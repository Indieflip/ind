import "server-only";
import { fmtNo } from "@/lib/numbering";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dictFor } from "@/lib/i18n";
import { num } from "@/lib/format";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Fiche de réception de marchandises (Frm) — exports :
 * - automatique : chaque jour à 23 h, fiche des bons du jour, qui sont consolidés en même temps (plus modifiables) ;
 * - manuel : demande exceptionnelle, sur n'importe quels bons choisis, marqué « Export manuel ».
 * Un export n'est jamais modifié (une livraison non conforme se suit par son anomalie).
 */
export type SheetData = { header: string[]; rows: (string | number | null)[][] };
export type SheetFormat = "pdf" | "xlsx";
export const SHEET_FORMATS: SheetFormat[] = ["pdf", "xlsx"];
export const RETENTION_YEARS = 5;
/** Heure de l'export automatique (heure de Paris) */
export const AUTO_EXPORT_HOUR = 23;

/** N° de fiche de réception de marchandises : FPM001… (par année, remise à zéro le 01/01) */
export const exportNumber = (s: { year: number; seq: number }) => fmtNo("sheet", s.seq);
export const parisDay = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
const parisHour = (d = new Date()) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Responsables désignés : nom affiché dans l'en-tête de la fiche */
export async function sheetValidatorIds() {
  return ((await getSetting("sheet_validators")) ?? "").split(",").map(Number).filter(Boolean);
}
async function responsibleNames() {
  const ids = await sheetValidatorIds();
  if (!ids.length) return "";
  const rows = await getDb().select({ name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids));
  return rows.map((r) => r.name).join(", ");
}

const initials = (name: string | null) =>
  (name ?? "").split(/[\s-]+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3);

/** Lignes de la fiche (modèle « Fiche de réception des marchandises ») pour une liste de bons : une ligne par produit contrôlé */
export async function buildSheetData(receptionIds: number[], locale = "fr") {
  const t = dictFor(locale === "en" ? "en" : "fr");
  const f = t.rsheet;
  const r = schema.receptions;
  const l = schema.receptionLines;
  const rows = receptionIds.length
    ? await getDb()
        .select({ rec: r, line: l, by: schema.users.name })
        .from(l)
        .innerJoin(r, eq(r.id, l.receptionId))
        .leftJoin(schema.users, eq(schema.users.id, r.createdBy))
        .where(inArray(r.id, receptionIds))
        .orderBy(asc(r.deliveredAt), asc(l.position))
    : [];
  const time = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
  const dlc = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const reason = (x: string | null) => (x ? (t.reasons as Record<string, string>)[x] ?? x : "");
  const data: SheetData = {
    header: [f.colDate, t.common.supplier, t.common.product, f.colTruck, f.colProduct, f.colPackaging, f.colDlc, f.colLabel, f.colDecision, f.colVisa],
    rows: rows.map(({ rec, line, by }) => {
      const why = reason(line.reason);
      const decision = line.decision === "refuse" ? f.refused : line.decision === "reserve" ? f.reserved : f.accepted;
      return [
        time(rec.deliveredAt),
        rec.supplierName,
        line.note ? `${line.productName} (${line.note})` : line.productName,
        rec.truckTemp == null ? null : num(rec.truckTemp),
        line.temperature == null ? null : num(line.temperature),
        line.reason === "damaged" ? f.nonCompliant : f.compliant,
        dlc(line.dlc),
        line.reason === "label" ? f.nonCompliant : f.compliant,
        why && line.decision !== "conform" ? `${decision} (${why})` : decision,
        initials(rec.receiverName || by),
      ];
    }),
  };
  return { data, receptionCount: new Set(rows.map((x) => x.rec.id)).size };
}

/** Enregistre un export (N° suivant de l'année) */
async function insertExport(v: { mode: "auto" | "manual"; day: string | null; receptionIds: number[]; userId: number | null }) {
  const db = getDb();
  const { data, receptionCount } = await buildSheetData(v.receptionIds);
  const year = Number((v.day ?? parisDay()).slice(0, 4));
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [{ next }] = (await tx.execute<{ next: number }>(sql`select coalesce(max(seq), 0)::int + 1 as next from reception_exports where year = ${year}`)).rows;
        const [row] = await tx
          .insert(schema.receptionExports)
          .values({ year, seq: next, mode: v.mode, day: v.day, receptionIds: v.receptionIds, data, receptionCount: Math.max(receptionCount, v.receptionIds.length), lineCount: data.rows.length, createdBy: v.userId })
          .returning();
        return row;
      });
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

/**
 * Export automatique d'un jour : fiche des bons du jour pas encore consolidés, puis consolidation de ces bons.
 * (Une livraison saisie après l'export du soir fait l'objet d'un export complémentaire au passage suivant.)
 */
export async function runDailyExport(day: string, opts: { includeConsolidated?: boolean } = {}) {
  const r = schema.receptions;
  const start = sql`((${day}::date)::timestamp at time zone 'Europe/Paris')`;
  const end = sql`((${day}::date + 1)::timestamp at time zone 'Europe/Paris')`;
  const recs = await getDb()
    .select({ id: r.id })
    .from(r)
    .where(and(sql`${r.deliveredAt} >= ${start}`, sql`${r.deliveredAt} < ${end}`, isNull(r.importedFrom), opts.includeConsolidated ? undefined : isNull(r.consolidatedAt)))
    .orderBy(asc(r.deliveredAt));
  if (!recs.length) return null;
  const ids = recs.map((x) => x.id);
  const row = await insertExport({ mode: "auto", day, receptionIds: ids, userId: null });
  await getDb().update(r).set({ consolidatedAt: new Date() }).where(and(inArray(r.id, ids), isNull(r.consolidatedAt)));
  return row;
}

/**
 * Exports automatiques dus : tous les jours passés (et aujourd'hui à partir de 23 h) qui ont des bons non consolidés.
 * Appelé par la tâche planifiée du soir et, par sécurité, à l'ouverture des pages (rattrapage si la tâche n'est pas passée).
 */
export async function runDueExports(now = new Date()) {
  const r = schema.receptions;
  // Premier passage : chaque jour déjà saisi reçoit sa fiche (y compris les bons consolidés à la main auparavant)
  const first = !(await getSetting("frm_exports_v1"));
  const today = parisDay(now);
  const limit = parisHour(now) >= AUTO_EXPORT_HOUR ? today : null;
  const days = await getDb().execute<{ d: string }>(sql`
    select distinct to_char(${r.deliveredAt} at time zone 'Europe/Paris', 'YYYY-MM-DD') as d from ${r}
    where ${r.importedFrom} is null and ${first ? sql`true` : sql`${r.consolidatedAt} is null`} order by 1`);
  const done: string[] = [];
  for (const { d } of days.rows) {
    if (d > today || (d === today && !limit)) continue;
    if (first) {
      const exists = await getDb().query.receptionExports.findFirst({ where: and(eq(schema.receptionExports.day, d), eq(schema.receptionExports.mode, "auto")) });
      if (exists) continue;
    }
    if (await runDailyExport(d, { includeConsolidated: first })) done.push(d);
  }
  if (first) await setSetting("frm_exports_v1", "1");
  return done;
}

/** Export manuel (demande exceptionnelle) : bons choisis par l'utilisateur ; ne consolide rien */
export async function manualExport(receptionIds: number[], userId: number) {
  const ids = [...new Set(receptionIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return null;
  return insertExport({ mode: "manual", day: null, receptionIds: ids, userId });
}

/** Archivage : exports de plus de 5 ans supprimés */
export async function purgeOldExports() {
  const limit = `${Number(parisDay().slice(0, 4)) - RETENTION_YEARS}${parisDay().slice(4)}`;
  await getDb().delete(schema.receptionExports).where(lt(schema.receptionExports.createdAt, new Date(`${limit}T00:00:00Z`)));
}

export async function loadExport(id: number) {
  const e = schema.receptionExports;
  const [row] = await getDb().select({ e, by: schema.users.name }).from(e).leftJoin(schema.users, eq(schema.users.id, e.createdBy)).where(eq(e.id, id));
  return row ? { ...row.e, by: row.by } : null;
}
export type LoadedExport = NonNullable<Awaited<ReturnType<typeof loadExport>>>;

export async function lastAutoExport() {
  const e = schema.receptionExports;
  return getDb().query.receptionExports.findFirst({ where: eq(e.mode, "auto"), orderBy: desc(e.createdAt) });
}

/* ------------------------------------------------------------------ Fichiers ------------------------------------------------------------------ */

export interface ExportMeta { restaurant: string; locale: string; responsible?: string }

const fmtDT = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
const dayLong = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const monthYear = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** Mention du mode d'export, écrite sur la fiche */
function modeLine(x: LoadedExport, locale: string) {
  const f = dictFor(locale === "en" ? "en" : "fr").rsheet;
  return x.mode === "manual"
    ? `${f.manualMention} - ${fmtDT(x.createdAt)}${x.by ? ` ${f.by} ${x.by}` : ""} - ${x.receptionCount} ${f.receptions.toLowerCase()}`
    : `${f.autoMention} - ${fmtDT(x.createdAt)} - ${x.receptionCount} ${f.receptions.toLowerCase()} ${f.consolidatedMention}`;
}
const periodOf = (x: LoadedExport, locale: string) => {
  const d = x.day ?? parisDay(x.createdAt);
  return `${monthYear(d, locale)}${x.day ? ` (${dayLong(x.day, locale)})` : ""}`;
};

const cellText = (v: string | number | null) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);

export function exportName(x: LoadedExport, format: SheetFormat) {
  return `fiche-reception-${exportNumber(x)}-${x.year}-${x.mode === "manual" ? "manuel" : x.day}.${format}`;
}

export async function sheetXlsx(list: LoadedExport[], meta: ExportMeta) {
  const f = dictFor(meta.locale === "en" ? "en" : "fr").rsheet;
  const wb = new ExcelJS.Workbook();
  if (!list.length) wb.addWorksheet(f.title.slice(0, 31)).addRow([f.none]);
  for (const x of list) {
    const ws = wb.addWorksheet(exportNumber(x), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    ws.mergeCells(1, 1, 1, 10);
    const title = ws.getCell(1, 1);
    title.value = `${f.title} N° ${exportNumber(x)}`;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };
    ws.addRow([`${f.establishment} : ${meta.restaurant}`, "", `${f.monthYear} : ${periodOf(x, meta.locale)}`, "", "", `${f.responsible} : ${meta.responsible || "—"}`]);
    ws.addRow([modeLine(x, meta.locale)]).font = { bold: x.mode === "manual", color: { argb: x.mode === "manual" ? "FFB45309" : "FF57534E" } };
    const head = ws.addRow(x.data.header);
    head.font = { bold: true };
    head.height = 30;
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA5A5A5" } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    for (const r of x.data.rows) {
      const row = ws.addRow(r.map((v) => (v == null ? "" : v)));
      row.eachCell({ includeEmpty: true }, (c) => { c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; c.alignment = { wrapText: true, vertical: "top" }; });
    }
    if (!x.data.rows.length) ws.addRow([f.empty]);
    [15, 22, 36, 12, 12, 13, 12, 13, 24, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Polices standard du PDF : uniquement les caractères WinAnsi */
const safe = (s: string) =>
  s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/ | /g, " ").replace(/[^\x20-\x7E -ÿ€œŒ…•]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 4) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = w;
    while (font.widthOfTextAtSize(cur, size) > width && cur.length > 1) {
      let k = cur.length - 1;
      while (k > 1 && font.widthOfTextAtSize(cur.slice(0, k), size) > width) k--;
      out.push(cur.slice(0, k));
      cur = cur.slice(k);
    }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, "…"); }
  return out.length ? out : [""];
}

export async function sheetPdf(x: LoadedExport, meta: ExportMeta) {
  const f = dictFor(meta.locale === "en" ? "en" : "fr").rsheet;
  const doc = await PDFDocument.create();
  doc.setTitle(`${f.title} N° ${exportNumber(x)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 28, size = 8, lh = 9.5;
  const weights = [9, 12, 21, 7, 7, 8, 7, 8, 15, 5];
  const total = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => ((W - 2 * M) * w) / total);
  const grey = rgb(0.45, 0.43, 0.41);
  const black = rgb(0.1, 0.1, 0.1);
  const line = rgb(0.6, 0.6, 0.6);
  const pages: PDFPage[] = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - M;

  const titleText = safe(f.title);
  page.drawText(titleText, { x: (W - bold.widthOfTextAtSize(titleText, 15)) / 2, y: y - 14, size: 15, font: bold, color: black });
  const no = safe(`N° ${exportNumber(x)}`);
  page.drawText(no, { x: W - M - bold.widthOfTextAtSize(no, 11), y: y - 13, size: 11, font: bold, color: black });
  y -= 34;
  const info: [string, string][] = [
    [`${f.establishment} :`, meta.restaurant || "—"],
    [`${f.monthYear} :`, periodOf(x, meta.locale)],
    [`${f.responsible} :`, meta.responsible || "—"],
  ];
  let x0 = M;
  for (const [k, v] of info) {
    page.drawText(safe(k), { x: x0, y, size: 9, font: bold, color: black });
    page.drawText(safe(v), { x: x0 + bold.widthOfTextAtSize(safe(k), 9) + 4, y, size: 9, font, color: black });
    x0 += (W - 2 * M) / 3;
  }
  y -= 13;
  page.drawText(safe(modeLine(x, meta.locale)), { x: M, y, size: 8, font: x.mode === "manual" ? bold : font, color: x.mode === "manual" ? rgb(0.7, 0.33, 0.04) : grey });
  y -= 10;

  const border = (top: number, h: number) => {
    let xx = M;
    page.drawRectangle({ x: M, y: top - h, width: W - 2 * M, height: h, borderColor: line, borderWidth: 0.5 });
    for (let i = 0; i < cw.length - 1; i++) { xx += cw[i]; page.drawLine({ start: { x: xx, y: top }, end: { x: xx, y: top - h }, thickness: 0.5, color: line }); }
  };
  const drawHeader = () => {
    const lines = x.data.header.map((h, i) => wrap(h, bold, size, cw[i] - 6, 3));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 8;
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: rgb(0.647, 0.647, 0.647) });
    border(y, h);
    let xx = M;
    lines.forEach((ls, i) => { ls.forEach((t, k) => page.drawText(t, { x: xx + (cw[i] - bold.widthOfTextAtSize(t, size)) / 2, y: y - 11 - k * lh, size, font: bold, color: black })); xx += cw[i]; });
    y -= h;
  };
  drawHeader();
  for (const r of x.data.rows) {
    const lines = r.map((v, i) => wrap(cellText(v), font, size, cw[i] - 6));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 6;
    if (y - h < M + 16) { page = doc.addPage([W, H]); pages.push(page); y = H - M; drawHeader(); }
    border(y, h);
    let xx = M;
    lines.forEach((ls, i) => {
      const center = i >= 3 && i !== 8;
      ls.forEach((t, k) => page.drawText(t, { x: center ? xx + (cw[i] - font.widthOfTextAtSize(t, size)) / 2 : xx + 3, y: y - 10 - k * lh, size, font, color: black }));
      xx += cw[i];
    });
    y -= h;
  }
  if (!x.data.rows.length) page.drawText(safe(f.empty), { x: M + 4, y: y - 14, size: 9, font, color: grey });
  pages.forEach((p, i) => {
    const label = safe(`${f.title} N° ${exportNumber(x)} - ${f.page} ${i + 1} / ${pages.length}`);
    p.drawText(label, { x: p.getWidth() - M - font.widthOfTextAtSize(label, 7), y: M - 12, size: 7, font, color: grey });
  });
  return Buffer.from(await doc.save());
}

/** Plusieurs exports dans un seul PDF */
export async function sheetsPdf(list: LoadedExport[], meta: ExportMeta) {
  const doc = await PDFDocument.create();
  for (const x of list) {
    const one = await PDFDocument.load(await sheetPdf(x, meta));
    for (const p of await doc.copyPages(one, one.getPageIndices())) doc.addPage(p);
  }
  return Buffer.from(await doc.save());
}

export async function exportMeta(locale: string): Promise<ExportMeta> {
  const [restaurant, responsible] = await Promise.all([getSetting("restaurant_name"), responsibleNames()]);
  return { restaurant: restaurant ?? "", locale, responsible };
}

export async function allExports() {
  const e = schema.receptionExports;
  const rows = await getDb().select({ e, by: schema.users.name }).from(e).leftJoin(schema.users, eq(schema.users.id, e.createdBy)).orderBy(asc(e.createdAt));
  return rows.map((r) => ({ ...r.e, by: r.by }));
}
