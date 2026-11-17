import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dictFor } from "@/lib/i18n";
import { num } from "@/lib/format";
import { getSetting, setSetting } from "@/lib/settings";
import { receptionWhere } from "./queries";

export type SheetData = { header: string[]; rows: (string | number | null)[][] };
export type SheetFormat = "pdf" | "xlsx";
export const SHEET_FORMATS: SheetFormat[] = ["pdf", "xlsx"];
/** Durée de conservation légale des fiches */
export const RETENTION_YEARS = 5;

export const sheetNumber = (s: { year: number; seq: number }) => `${s.year}-${String(s.seq).padStart(3, "0")}`;
export const parisDay = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);

/** Responsables désignés (Réglages) : seuls eux valident les fiches ; l'administrateur aussi */
export async function sheetValidatorIds() {
  return ((await getSetting("sheet_validators")) ?? "").split(",").map(Number).filter(Boolean);
}
export async function canValidateSheets(user: { id: number; role: string }) {
  return user.role === "admin" || (await sheetValidatorIds()).includes(user.id);
}

const initials = (name: string | null) =>
  (name ?? "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);

/** Lignes de la fiche du jour (modèle « Fiche de réception des marchandises ») : une ligne par produit contrôlé */
export async function buildSheetData(date: string, locale: string) {
  const t = dictFor(locale === "en" ? "en" : "fr");
  const f = t.rsheet;
  const r = schema.receptions;
  const l = schema.receptionLines;
  const rows = await getDb()
    .select({ rec: r, line: l, by: schema.users.name })
    .from(l)
    .innerJoin(r, eq(r.id, l.receptionId))
    .leftJoin(schema.users, eq(schema.users.id, r.createdBy))
    .where(receptionWhere({ from: date, to: date }))
    .orderBy(asc(r.deliveredAt), asc(l.position));
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
        line.reason === "damaged" ? "NC" : "C",
        dlc(line.dlc),
        line.reason === "label" ? "NC" : "C",
        why && line.decision !== "conform" ? `${decision} (${why})` : decision,
        initials(rec.receiverName || by),
      ];
    }),
  };
  return { data, receptionCount: new Set(rows.map((x) => x.rec.id)).size };
}

/** Crée la fiche d'un jour (N° suivant de l'année) avec sa première version à valider ; renvoie la fiche existante sinon */
export async function createSheet(date: string, user: { id: number | null; locale: string }) {
  const db = getDb();
  const existing = await db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.date, date) });
  if (existing) return existing.id;
  const year = Number(date.slice(0, 4));
  const { data, receptionCount } = await buildSheetData(date, user.locale);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [{ next }] = (await tx.execute<{ next: number }>(sql`select coalesce(max(seq), 0)::int + 1 as next from reception_sheets where year = ${year}`)).rows;
        const [sheet] = await tx.insert(schema.receptionSheets).values({ year, seq: next, date, createdBy: user.id }).returning();
        await tx.insert(schema.receptionSheetVersions).values({ sheetId: sheet.id, version: 1, data, receptionCount, lineCount: data.rows.length, createdBy: user.id });
        return sheet.id;
      });
    } catch (e) {
      const again = await db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.date, date) });
      if (again) return again.id;
      if (attempt === 2) throw e;
    }
  }
  throw new Error("sheet");
}

/**
 * Génération automatique : après chaque réception enregistrée, modifiée ou supprimée, la fiche du jour est créée ou mise à jour.
 * - pas encore de fiche : création (N° suivant de l'année), à valider ;
 * - dernière version à valider : mise à jour sur place (elle n'a encore aucune valeur légale) ;
 * - dernière version validée ou refusée : nouvelle version « Mise à jour automatique », soumise à validation.
 * Rien n'est fait si le contenu n'a pas changé.
 */
export async function syncSheetForDate(date: string, reason: string, user: { id: number | null; locale?: string } = { id: null }) {
  const db = getDb();
  const locale = "fr";
  const sheet = await db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.date, date) });
  const { data, receptionCount } = await buildSheetData(date, locale);
  if (!sheet) {
    if (receptionCount === 0) return;
    await createSheet(date, { id: user.id, locale });
    return;
  }
  const v = schema.receptionSheetVersions;
  const last = await db.query.receptionSheetVersions.findFirst({ where: eq(v.sheetId, sheet.id), orderBy: desc(v.version) });
  if (last && JSON.stringify(last.data) === JSON.stringify(data)) return;
  if (last?.status === "pending") {
    await db.update(v).set({ data, receptionCount, lineCount: data.rows.length, createdAt: new Date(), reason: last.version > 1 ? reason : null }).where(eq(v.id, last.id));
  } else {
    await db.insert(v).values({ sheetId: sheet.id, version: (last?.version ?? 0) + 1, data, receptionCount, lineCount: data.rows.length, reason, createdBy: user.id });
  }
}

/** N'interrompt jamais l'enregistrement d'une réception */
export async function syncSheetsSafe(dates: (Date | string | null | undefined)[], reason: string, user?: { id: number | null }) {
  for (const d of new Set(dates.filter(Boolean).map((x) => (typeof x === "string" ? x : parisDay(x as Date))))) {
    try { await syncSheetForDate(d, reason, user); } catch (e) { console.error("[fiche]", e); }
  }
}

/** Une fois : fiches générées pour tous les jours ayant des réceptions, dans l'ordre chronologique */
export async function backfillSheets() {
  if (await getSetting("sheets_auto_v1")) return;
  const days = await getDb().execute<{ d: string }>(sql`select distinct to_char(delivered_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as d from receptions order by 1`);
  for (const { d } of days.rows) await syncSheetForDate(d, "Mise à jour automatique : reprise des réceptions du jour", { id: null });
  await setSetting("sheets_auto_v1", "1");
}

/** Purge automatique : fiches de plus de 5 ans */
export async function purgeOldSheets() {
  const limit = `${Number(parisDay().slice(0, 4)) - RETENTION_YEARS}${parisDay().slice(4)}`;
  await getDb().delete(schema.receptionSheets).where(lt(schema.receptionSheets.date, limit));
}

export async function loadSheet(id: number) {
  const db = getDb();
  const sheet = await db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.id, id) });
  if (!sheet) return null;
  const v = schema.receptionSheetVersions;
  const author = schema.users;
  const versions = await db
    .select({ v, by: author.name })
    .from(v)
    .leftJoin(author, eq(author.id, v.createdBy))
    .where(eq(v.sheetId, id))
    .orderBy(desc(v.version));
  const reviewerIds = [...new Set(versions.map((x) => x.v.reviewedBy).filter((x): x is number => !!x))];
  const reviewers = reviewerIds.length ? await db.select({ id: author.id, name: author.name }).from(author).where(inArray(author.id, reviewerIds)) : [];
  const name = new Map(reviewers.map((x) => [x.id, x.name]));
  return {
    sheet,
    versions: versions.map(({ v: x, by }) => ({ ...x, by, reviewer: x.reviewedBy ? name.get(x.reviewedBy) ?? null : null })),
  };
}
export type LoadedSheet = NonNullable<Awaited<ReturnType<typeof loadSheet>>>;

/** Dernière version validée : la seule qui peut être exportée */
export const lastValidated = (s: LoadedSheet) => s.versions.find((x) => x.status === "validated") ?? null;

export async function sheetsAwaitingValidation() {
  const v = schema.receptionSheetVersions;
  const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(v).where(eq(v.status, "pending"));
  return row.n;
}

export async function todaySheetExists() {
  return !!(await getDb().query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.date, parisDay()) }));
}

/* ------------------------------------------------------------------ Export ------------------------------------------------------------------ */

export interface ExportMeta { restaurant: string; locale: string }

const fmtDT = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
const dayLong = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const monthYear = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function historyLines(s: LoadedSheet, locale: string) {
  const f = dictFor(locale === "en" ? "en" : "fr").rsheet;
  return [...s.versions]
    .sort((a, b) => a.version - b.version)
    .map((x) => {
      const head = `V${x.version} - ${fmtDT(x.createdAt)}${x.by ? ` ${f.by} ${x.by}` : ""} : ${x.version === 1 ? f.created : `${f.modification} - ${x.reason ?? ""}`}`;
      const review = x.status === "validated" ? `${f.validatedOn} ${fmtDT(x.reviewedAt!)}${x.reviewer ? ` ${f.by} ${x.reviewer}` : ""}` : x.status === "rejected" ? `${f.rejectedOn} ${fmtDT(x.reviewedAt!)}${x.reviewer ? ` ${f.by} ${x.reviewer}` : ""}${x.reviewNote ? ` (${x.reviewNote})` : ""}` : f.statuses.pending;
      return `${head} · ${review}`;
    });
}

const cellText = (v: string | number | null) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);

export function exportName(s: LoadedSheet, format: SheetFormat) {
  return `fiche-reception-${sheetNumber(s.sheet)}-${s.sheet.date}.${format}`;
}

export async function sheetXlsx(list: { s: LoadedSheet; version: LoadedSheet["versions"][number] }[], meta: ExportMeta) {
  const t = dictFor(meta.locale === "en" ? "en" : "fr");
  const f = t.rsheet;
  const wb = new ExcelJS.Workbook();
  if (!list.length) wb.addWorksheet(f.title.slice(0, 31)).addRow([f.none]);
  for (const { s, version } of list) {
    const ws = wb.addWorksheet(sheetNumber(s.sheet), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    ws.mergeCells(1, 1, 1, 10);
    const title = ws.getCell(1, 1);
    title.value = `${f.title} N° ${sheetNumber(s.sheet)}`;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center" };
    ws.addRow([`${f.establishment} : ${meta.restaurant}`, "", `${f.monthYear} : ${monthYear(s.sheet.date, meta.locale)} (${dayLong(s.sheet.date, meta.locale)})`, "", "", `${f.responsible} : ${version.reviewer ?? "—"}`]);
    ws.addRow([`${f.version} ${version.version} · ${f.validatedOn} ${version.reviewedAt ? fmtDT(version.reviewedAt) : "—"}`]).font = { color: { argb: "FF57534E" } };
    const head = ws.addRow(version.data.header);
    head.font = { bold: true };
    head.height = 30;
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA5A5A5" } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    for (const r of version.data.rows) {
      const row = ws.addRow(r.map((v) => (v == null ? "" : v)));
      row.eachCell({ includeEmpty: true }, (c) => { c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; c.alignment = { wrapText: true, vertical: "top" }; });
    }
    if (!version.data.rows.length) ws.addRow([f.empty]);
    ws.addRow([]);
    ws.addRow([f.history]).font = { bold: true };
    for (const h of historyLines(s, meta.locale)) ws.addRow([h]);
    [15, 22, 36, 12, 12, 12, 12, 12, 24, 8].forEach((w, i) => (ws.getColumn(i + 1).width = w));
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

export async function sheetPdf(s: LoadedSheet, version: LoadedSheet["versions"][number], meta: ExportMeta) {
  const f = dictFor(meta.locale === "en" ? "en" : "fr").rsheet;
  const doc = await PDFDocument.create();
  doc.setTitle(`${f.title} N° ${sheetNumber(s.sheet)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 28, size = 8, lh = 9.5;
  const weights = [9, 12, 22, 7, 7, 7, 7, 7, 15, 5];
  const total = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => ((W - 2 * M) * w) / total);
  const grey = rgb(0.45, 0.43, 0.41);
  const black = rgb(0.1, 0.1, 0.1);
  const line = rgb(0.6, 0.6, 0.6);
  const pages: PDFPage[] = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - M;

  const titleText = safe(`${f.title}`);
  page.drawText(titleText, { x: (W - bold.widthOfTextAtSize(titleText, 15)) / 2, y: y - 14, size: 15, font: bold, color: black });
  const no = safe(`N° ${sheetNumber(s.sheet)}`);
  page.drawText(no, { x: W - M - bold.widthOfTextAtSize(no, 11), y: y - 13, size: 11, font: bold, color: black });
  y -= 34;
  const info: [string, string][] = [
    [`${f.establishment} :`, meta.restaurant || "—"],
    [`${f.monthYear} :`, `${monthYear(s.sheet.date, meta.locale)} (${dayLong(s.sheet.date, meta.locale)})`],
    [`${f.responsible} :`, version.reviewer ?? "—"],
  ];
  let x0 = M;
  for (const [k, v] of info) {
    page.drawText(safe(k), { x: x0, y, size: 9, font: bold, color: black });
    page.drawText(safe(v), { x: x0 + bold.widthOfTextAtSize(safe(k), 9) + 4, y, size: 9, font, color: black });
    x0 += (W - 2 * M) / 3;
  }
  y -= 13;
  page.drawText(safe(`${f.version} ${version.version} · ${f.validatedOn} ${version.reviewedAt ? fmtDT(version.reviewedAt) : "—"}${version.reviewer ? ` ${f.by} ${version.reviewer}` : ""}`), { x: M, y, size: 8, font, color: grey });
  y -= 10;

  const border = (top: number, h: number) => {
    let x = M;
    page.drawRectangle({ x: M, y: top - h, width: W - 2 * M, height: h, borderColor: line, borderWidth: 0.5 });
    for (let i = 0; i < cw.length - 1; i++) { x += cw[i]; page.drawLine({ start: { x, y: top }, end: { x, y: top - h }, thickness: 0.5, color: line }); }
  };
  const drawHeader = () => {
    const lines = version.data.header.map((h, i) => wrap(h, bold, size, cw[i] - 6, 3));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 8;
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: rgb(0.647, 0.647, 0.647) });
    border(y, h);
    let x = M;
    lines.forEach((ls, i) => { ls.forEach((t, k) => page.drawText(t, { x: x + (cw[i] - bold.widthOfTextAtSize(t, size)) / 2, y: y - 11 - k * lh, size, font: bold, color: black })); x += cw[i]; });
    y -= h;
  };
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
  drawHeader();
  for (const r of version.data.rows) {
    const lines = r.map((v, i) => wrap(cellText(v), font, size, cw[i] - 6));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 6;
    if (y - h < M + 16) { newPage(); drawHeader(); }
    border(y, h);
    let x = M;
    lines.forEach((ls, i) => {
      const center = i >= 3 && i !== 8;
      ls.forEach((t, k) => page.drawText(t, { x: center ? x + (cw[i] - font.widthOfTextAtSize(t, size)) / 2 : x + 3, y: y - 10 - k * lh, size, font, color: black }));
      x += cw[i];
    });
    y -= h;
  }
  if (!version.data.rows.length) { page.drawText(safe(f.empty), { x: M + 4, y: y - 14, size: 9, font, color: grey }); y -= 20; }

  // Historique des modifications
  const hist = historyLines(s, meta.locale);
  if (y - 30 - hist.length * 11 < M + 16) newPage();
  y -= 22;
  page.drawText(safe(f.history), { x: M, y, size: 10, font: bold, color: black });
  for (const h of hist) {
    for (const t of wrap(h, font, 8, W - 2 * M, 3)) {
      y -= 11;
      if (y < M + 16) { newPage(); y -= 11; }
      page.drawText(t, { x: M, y, size: 8, font, color: black });
    }
  }
  pages.forEach((p, i) => {
    const label = safe(`${f.title} N° ${sheetNumber(s.sheet)} - ${f.page} ${i + 1} / ${pages.length}`);
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7), y: M - 12, size: 7, font, color: grey });
  });
  return Buffer.from(await doc.save());
}

/** Toutes les fiches (dernière version validée, sinon la dernière) pour l'export de l'administrateur */
export async function allSheetsForExport() {
  const ids = await getDb().select({ id: schema.receptionSheets.id }).from(schema.receptionSheets).orderBy(asc(schema.receptionSheets.date));
  const out: { s: LoadedSheet; version: LoadedSheet["versions"][number] }[] = [];
  for (const { id } of ids) {
    const s = await loadSheet(id);
    if (!s) continue;
    const version = lastValidated(s) ?? s.versions[0];
    if (version) out.push({ s, version });
  }
  return out;
}


/** Export manuel d'une période : fiches validées (dernière version validée) entre deux dates */
export async function validatedSheetsBetween(from?: string, to?: string) {
  const s = schema.receptionSheets;
  const conds = [];
  if (from) conds.push(sql`${s.date} >= ${from}`);
  if (to) conds.push(sql`${s.date} <= ${to}`);
  const ids = await getDb().select({ id: s.id }).from(s).where(conds.length ? sql.join(conds, sql` and `) : undefined).orderBy(asc(s.date));
  const out: { s: LoadedSheet; version: LoadedSheet["versions"][number] }[] = [];
  for (const { id } of ids) {
    const x = await loadSheet(id);
    const version = x && lastValidated(x);
    if (x && version) out.push({ s: x, version });
  }
  return out;
}

/** Plusieurs fiches dans un seul PDF (une fiche à la suite de l'autre) */
export async function sheetsPdf(list: { s: LoadedSheet; version: LoadedSheet["versions"][number] }[], meta: ExportMeta) {
  const doc = await PDFDocument.create();
  doc.setTitle(dictFor(meta.locale === "en" ? "en" : "fr").rsheet.titleShort);
  for (const { s, version } of list) {
    const one = await PDFDocument.load(await sheetPdf(s, version, meta));
    for (const p of await doc.copyPages(one, one.getPageIndices())) doc.addPage(p);
  }
  return Buffer.from(await doc.save());
}
