import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

const body = z.object({
  clientUuid: z.string().min(8).max(64),
  supplierName: z.string().max(200).nullable(),
  blNumber: z.string().max(100).nullable(),
  data: z.record(z.string(), z.unknown()),
});

/** Enregistre (ou met à jour) le brouillon d'un bon. Les photos ont déjà été envoyées. */
export async function POST(req: Request) {
  let user;
  try {
    user = await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const raw = JSON.stringify(parsed.data.data);
  if (raw.includes("data:")) return Response.json({ error: "photos_not_uploaded" }, { status: 400 });
  if (raw.length > 500_000) return Response.json({ error: "too_large" }, { status: 413 });
  const { clientUuid, supplierName, blNumber, data } = parsed.data;
  const [row] = await getDb()
    .insert(schema.receptionDrafts)
    .values({ clientUuid, supplierName, blNumber, data, createdBy: user.id })
    .onConflictDoUpdate({ target: schema.receptionDrafts.clientUuid, set: { supplierName, blNumber, data, updatedAt: new Date() } })
    .returning({ id: schema.receptionDrafts.id });
  revalidatePath("/receptions");
  return Response.json({ id: row.id });
}
