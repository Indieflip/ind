"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function saveProtocolAction(id: number | null, title: string, content: string) {
  const user = await assertUser(can.editProtocols);
  const t = title.trim();
  if (!t) return { error: "title" };
  const db = getDb();
  let savedId = id;
  if (id) {
    await db.update(schema.protocols).set({ title: t, content, updatedBy: user.id, updatedAt: new Date() }).where(eq(schema.protocols.id, id));
  } else {
    savedId = (await db.insert(schema.protocols).values({ title: t, content, updatedBy: user.id }).returning())[0].id;
  }
  revalidatePath("/protocoles");
  return { id: savedId };
}

export async function deleteProtocolAction(id: number) {
  await assertUser(can.editProtocols);
  await getDb().delete(schema.protocols).where(eq(schema.protocols.id, id));
  revalidatePath("/protocoles");
}
