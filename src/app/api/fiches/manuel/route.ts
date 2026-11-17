import { getUser } from "@/lib/auth";
import { exportMeta, exportName, loadExport, manualExport, SHEET_FORMATS, sheetPdf, sheetXlsx, type SheetFormat } from "@/lib/server/sheets";

/** Export manuel (demande exceptionnelle) : bons choisis → nouvel export « Export manuel » dans l'historique, puis téléchargement */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const form = await req.formData();
  const ids = form.getAll("ids").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  const format = (SHEET_FORMATS as string[]).includes(String(form.get("format") ?? "")) ? (String(form.get("format")) as SheetFormat) : "pdf";
  if (!ids.length) return new Response("Aucun bon sélectionné.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const row = await manualExport(ids, user.id);
  const x = row && (await loadExport(row.id));
  if (!x) return new Response("Erreur", { status: 500 });
  const meta = await exportMeta(user.locale);
  const body = format === "pdf" ? await sheetPdf(x, meta) : await sheetXlsx([x], meta);
  const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${exportName(x, format)}"`, "Cache-Control": "no-store" } });
}
