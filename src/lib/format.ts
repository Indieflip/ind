export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function fmtMoney(v: unknown, locale = "fr") {
  const n = num(v);
  if (n == null) return "—";
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 10 ? 3 : 2,
  }).format(n);
}

export function fmtNum(v: unknown, locale = "fr", digits = 3) {
  const n = num(v);
  if (n == null) return "—";
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: digits }).format(n);
}

export function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
}

const TZ = "Europe/Paris";

/** Dates écrites dans un texte : JJ/MM/AAAA → JJ/MM/AA (format de l'établissement) */
export function shortDates(s: string) {
  return s.replace(/\b(\d{1,2})\/(\d{1,2})\/(?:19|20)(\d{2})(?!\d)/g, "$1/$2/$3");
}

export function fmtDate(d: Date | string | null | undefined, locale = "fr") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
  // Format de l'établissement : JJ/MM/AA
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined, locale = "fr") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(date).replace(",", "");
}

/** CSV lisible par Excel FR : séparateur « ; », BOM UTF-8 */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
