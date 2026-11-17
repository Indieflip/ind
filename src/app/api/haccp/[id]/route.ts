import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { getRestaurantName } from "@/lib/settings";
import { HACCP_FORMATS, registerFile, type HaccpFormat } from "@/lib/server/haccp";
import { periodLabel } from "@/lib/server/haccpPeriod";

/** Re-télécharge un registre de l'historique, tel qu'il a été créé */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  const reg = id ? await getDb().query.haccpRegisters.findFirst({ where: eq(schema.haccpRegisters.id, id) }) : undefined;
  if (!reg) return new Response("Not found", { status: 404 });
  const by = reg.createdBy ? await getDb().query.users.findFirst({ where: eq(schema.users.id, reg.createdBy) }) : undefined;
  const sp = new URL(req.url).searchParams;
  const format = (HACCP_FORMATS as string[]).includes(sp.get("format") ?? "") ? (sp.get("format") as HaccpFormat) : "pdf";
  const file = await registerFile(reg.data, { number: reg.id, restaurant: await getRestaurantName(), period: periodLabel(reg.fromDate ?? undefined, reg.toDate ?? undefined, user.locale), createdAt: reg.createdAt, by: by?.name ?? null, locale: user.locale }, format);
  return new Response(new Uint8Array(file.body), { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" } });
}
