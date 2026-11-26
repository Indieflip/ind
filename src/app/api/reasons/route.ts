import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Ajoute un motif de refus / retour à la liste (proposé ensuite dans toutes les fiches de réception) */
export async function POST(req: Request) {
  try { await assertUser(can.receive); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  const raw = String(body?.label ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!raw) return Response.json({ error: "invalid" }, { status: 400 });
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  const db = getDb();
  const key = "refusal_reasons_extra";
  let list: string[] = [];
  try { list = JSON.parse((await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, key) }))?.value ?? "[]"); } catch { /* liste vide */ }
  if (!list.some((x) => x.toLowerCase() === label.toLowerCase())) list.push(label);
  await db.insert(schema.appSettings).values({ key, value: JSON.stringify(list) }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(list) } });
  return Response.json({ ok: true, label });
}
