import { getUser } from "@/lib/auth";
import { getRestaurantName } from "@/lib/settings";
import { exportName, lastValidated, loadSheet, SHEET_FORMATS, sheetPdf, sheetXlsx, type SheetFormat } from "@/lib/server/sheets";

/** Export d'une fiche de réception : uniquement sa dernière version validée par le responsable */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const s = await loadSheet(Number((await params).id));
  if (!s) return new Response("Not found", { status: 404 });
  const version = lastValidated(s);
  if (!version) return new Response("Fiche non validée : export impossible tant que le responsable ne l'a pas validée.", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const format = (SHEET_FORMATS as string[]).includes(sp.get("format") ?? "") ? (sp.get("format") as SheetFormat) : "pdf";
  const meta = { restaurant: await getRestaurantName(), locale: user.locale };
  const body = format === "pdf" ? await sheetPdf(s, version, meta) : await sheetXlsx([{ s, version }], meta);
  const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${exportName(s, format)}"`, "Cache-Control": "no-store" } });
}
