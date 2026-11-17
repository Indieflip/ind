import { getUser } from "@/lib/auth";
import { getRestaurantName } from "@/lib/settings";
import { SHEET_FORMATS, sheetsPdf, sheetXlsx, validatedSheetsBetween, type SheetFormat } from "@/lib/server/sheets";

/** Export manuel des fiches de réception d'une période (fiches validées uniquement) */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const day = (k: string) => { const v = sp.get(k) ?? ""; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; };
  const from = day("from");
  const to = day("to");
  const format = (SHEET_FORMATS as string[]).includes(sp.get("format") ?? "") ? (sp.get("format") as SheetFormat) : "pdf";
  const list = await validatedSheetsBetween(from, to);
  if (!list.length) return new Response("Aucune fiche validée sur cette période.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const meta = { restaurant: await getRestaurantName(), locale: user.locale };
  const body = format === "pdf" ? await sheetsPdf(list, meta) : await sheetXlsx(list, meta);
  const name = `fiches-reception-${from ?? "debut"}-${to ?? "fin"}.${format}`;
  const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
