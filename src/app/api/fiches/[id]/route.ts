import { getUser } from "@/lib/auth";
import { exportMeta, exportName, loadExport, SHEET_FORMATS, sheetPdf, sheetXlsx, type SheetFormat } from "@/lib/server/sheets";

/** Téléchargement d'un export de l'historique (contenu figé), en PDF ou Excel */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const x = await loadExport(Number((await params).id));
  if (!x) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const format = (SHEET_FORMATS as string[]).includes(sp.get("format") ?? "") ? (sp.get("format") as SheetFormat) : "pdf";
  const meta = await exportMeta(user.locale);
  const body = format === "pdf" ? await sheetPdf(x, meta) : await sheetXlsx([x], meta);
  const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${exportName(x, format)}"`, "Cache-Control": "no-store" } });
}
