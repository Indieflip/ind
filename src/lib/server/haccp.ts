import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dictFor } from "@/lib/i18n";
import { num } from "@/lib/format";
import { receptionWhere } from "./queries";

export type HaccpData = { header: string[]; rows: (string | number | null)[][] };
export type HaccpFormat = "pdf" | "xlsx" | "csv";
export const HACCP_FORMATS: HaccpFormat[] = ["pdf", "xlsx", "csv"];

/** Lignes du registre : une ligne par produit contrôlé (températures, DLC, lots, décisions), sans les prix */
export async function buildHaccp(from: string | undefined, to: string | undefined, locale: string) {
  const t = dictFor(locale === "en" ? "en" : "fr");
  const r = schema.receptions;
  const l = schema.receptionLines;
  const rows = await getDb()
    .select({ rec: r, line: l, catFr: schema.categories.nameFr, catEn: schema.categories.nameEn })
    .from(l)
    .innerJoin(r, eq(r.id, l.receptionId))
    .leftJoin(schema.categories, eq(schema.categories.id, l.categoryId))
    .where(receptionWhere({ from, to }))
    .orderBy(asc(r.deliveredAt), asc(l.position));
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
  const dlc = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  const docs = (rec: typeof r.$inferSelect) => {
    const list = (rec.documents as { type: string; number: string }[] | null) ?? [];
    return list.length ? list.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ") : rec.blNumber ?? "";
  };
  const data: HaccpData = {
    header: [
      t.common.date, t.common.supplier, t.prices.document, t.receptions.driver, t.receptions.truckTemp, t.receptions.vehicleClean,
      t.common.product, t.common.category, t.common.unit, t.wizard.ordered, t.wizard.received, t.wizard.temperature,
      t.wizard.dlc, t.wizard.lot, t.common.status, t.wizard.reason, t.receptions.title,
    ],
    rows: rows.map(({ rec, line, catFr, catEn }) => [
      fmt(rec.deliveredAt), rec.supplierName, docs(rec), rec.driverName, rec.truckTemp == null ? null : num(rec.truckTemp),
      rec.vehicleClean == null ? "" : rec.vehicleClean ? t.common.yes : t.common.no,
      line.productName, (locale === "en" ? catEn : catFr) ?? "", line.unit, num(line.qtyOrdered), num(line.qtyReceived),
      line.temperature == null ? null : num(line.temperature), dlc(line.dlc), line.lot, t.decision[line.decision],
      line.reason ? (t.reasons as Record<string, string>)[line.reason] ?? line.reason : "", t.receptionStatus[rec.status],
    ]),
  };
  return { data, receptionCount: new Set(rows.map((x) => x.rec.id)).size };
}

/** Enregistre le registre dans l'historique (copie figée) */
export async function saveRegister(p: { from?: string; to?: string; format: HaccpFormat; data: HaccpData; receptionCount: number; userId: number }) {
  const [reg] = await getDb()
    .insert(schema.haccpRegisters)
    .values({ fromDate: p.from || null, toDate: p.to || null, format: p.format, data: p.data, receptionCount: p.receptionCount, lineCount: p.data.rows.length, createdBy: p.userId })
    .returning();
  return reg;
}

export interface RegisterMeta { number: number; restaurant: string; period: string; createdAt: Date; by: string | null; locale: string }

const cell = (v: string | number | null) => (v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);

export function fileName(meta: RegisterMeta, format: HaccpFormat) {
  const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(meta.createdAt);
  return `registre-haccp-${String(meta.number).padStart(4, "0")}-${d}.${format}`;
}

export function toCsv(data: HaccpData) {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [data.header, ...data.rows].map((r) => r.map((v) => esc(cell(v))).join(";")).join("\r\n");
}

export async function toXlsx(data: HaccpData, meta: RegisterMeta) {
  const t = dictFor(meta.locale === "en" ? "en" : "fr");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.reporting.haccp, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }, views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([`${t.reporting.haccp} N° ${meta.number}${meta.restaurant ? ` — ${meta.restaurant}` : ""}`]).font = { bold: true, size: 14 };
  ws.addRow([`${t.haccpReg.period} : ${meta.period}  ·  ${t.haccpReg.createdAt} ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(meta.createdAt)}${meta.by ? ` ${t.haccpReg.by} ${meta.by}` : ""}  ·  ${data.rows.length} ${t.haccpReg.lines}`]).font = { color: { argb: "FF57534E" } };
  ws.addRow([]);
  const head = ws.addRow(data.header);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
  for (const r of data.rows) ws.addRow(r.map((v) => (v == null ? "" : v)));
  const widths = [15, 22, 18, 14, 9, 9, 34, 16, 8, 9, 9, 9, 11, 12, 11, 22, 16];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: data.header.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Polices standard du PDF : uniquement les caractères WinAnsi */
const safe = (s: string) =>
  s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/ | /g, " ").replace(/[^\x20-\x7E -ÿ€œŒ…•]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 3) {
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

export async function toPdf(data: HaccpData, meta: RegisterMeta) {
  const t = dictFor(meta.locale === "en" ? "en" : "fr");
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.reporting.haccp} N° ${meta.number}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 24, size = 6.6, lh = 8;
  // Largeur relative des colonnes (même ordre que l'en-tête)
  const weights = [7, 10, 9, 6, 5, 5.5, 14, 7, 3.5, 4.4, 4.4, 4, 5, 5.5, 5, 8.5, 6];
  const total = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => ((W - 2 * M) * w) / total);
  const green = rgb(0.086, 0.396, 0.204);
  const grey = rgb(0.47, 0.44, 0.42);
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - M;

  const title = `${t.reporting.haccp} N° ${meta.number}${meta.restaurant ? ` - ${meta.restaurant}` : ""}`;
  page.drawText(safe(title), { x: M, y: y - 12, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1) });
  const sub = `${t.haccpReg.period} : ${meta.period}   ·   ${t.haccpReg.createdAt} ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(meta.createdAt)}${meta.by ? ` ${t.haccpReg.by} ${meta.by}` : ""}   ·   ${data.rows.length} ${t.haccpReg.lines}`;
  page.drawText(safe(sub), { x: M, y: y - 26, size: 8, font, color: grey });
  y -= 38;

  const drawHeader = () => {
    const lines = data.header.map((h, i) => wrap(h, bold, size, cw[i] - 4, 2));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 6;
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: green });
    let x = M;
    lines.forEach((ls, i) => { ls.forEach((s, k) => page.drawText(s, { x: x + 2, y: y - 9 - k * lh, size, font: bold, color: rgb(1, 1, 1) })); x += cw[i]; });
    y -= h;
  };
  drawHeader();
  data.rows.forEach((r, n) => {
    const lines = r.map((v, i) => wrap(cell(v), font, size, cw[i] - 4));
    const h = Math.max(...lines.map((l) => l.length)) * lh + 4;
    if (y - h < M + 14) {
      page = doc.addPage([W, H]);
      pages.push(page);
      y = H - M;
      drawHeader();
    }
    if (n % 2) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: rgb(0.97, 0.96, 0.96) });
    let x = M;
    lines.forEach((ls, i) => { ls.forEach((s, k) => page.drawText(s, { x: x + 2, y: y - 8 - k * lh, size, font, color: rgb(0.1, 0.1, 0.1) })); x += cw[i]; });
    y -= h;
  });
  if (!data.rows.length) page.drawText(safe(t.haccpReg.empty), { x: M, y: y - 14, size: 9, font, color: grey });
  pages.forEach((p, i) => {
    const label = `${t.reporting.haccp} N° ${meta.number} - ${i + 1} / ${pages.length}`;
    p.drawText(safe(label), { x: W - M - font.widthOfTextAtSize(safe(label), 7), y: M - 10, size: 7, font, color: grey });
  });
  return Buffer.from(await doc.save());
}

export async function registerFile(data: HaccpData, meta: RegisterMeta, format: HaccpFormat) {
  const name = fileName(meta, format);
  if (format === "pdf") return { name, type: "application/pdf", body: await toPdf(data, meta) };
  if (format === "xlsx") return { name, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: await toXlsx(data, meta) };
  return { name, type: "text/csv; charset=utf-8", body: Buffer.from(toCsv(data), "utf8") };
}
