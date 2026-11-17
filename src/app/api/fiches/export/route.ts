import { isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { allExports, exportMeta, parisDay, sheetXlsx } from "@/lib/server/sheets";

/** Administrateur : archive de tous les exports (préalable obligatoire à une suppression avant 5 ans) */
export async function GET() {
  const user = await getUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const body = await sheetXlsx(await allExports(), await exportMeta(user.locale));
  await getDb().update(schema.receptionExports).set({ archivedAt: new Date() }).where(isNull(schema.receptionExports.archivedAt));
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="fiches-reception-archive-${parisDay()}.xlsx"`, "Cache-Control": "no-store" },
  });
}
