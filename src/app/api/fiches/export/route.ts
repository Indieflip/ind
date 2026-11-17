import { isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { getRestaurantName } from "@/lib/settings";
import { allSheetsForExport, parisDay, sheetXlsx } from "@/lib/server/sheets";

/** Administrateur : export de toutes les fiches (préalable obligatoire à une suppression avant 5 ans) */
export async function GET() {
  const user = await getUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const list = await allSheetsForExport();
  const body = await sheetXlsx(list, { restaurant: await getRestaurantName(), locale: user.locale });
  await getDb().update(schema.receptionSheets).set({ exportedAt: new Date() }).where(isNull(schema.receptionSheets.exportedAt));
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="fiches-reception-${parisDay()}.xlsx"`, "Cache-Control": "no-store" },
  });
}
