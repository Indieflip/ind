"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Note complémentaire sur un bon consolidé (horodatée, non modifiable) */
export async function addNoteAction(receptionId: number, text: string) {
  const user = await assertUser(can.addNote);
  const t = text.trim();
  if (!t) return { error: "empty" };
  const rec = await getDb().query.receptions.findFirst({ where: eq(schema.receptions.id, receptionId), columns: { consolidatedAt: true } });
  if (!rec?.consolidatedAt) return { error: "not_consolidated" };
  await getDb().insert(schema.receptionNotes).values({ receptionId, text: t.slice(0, 5000), createdBy: user.id });
  revalidatePath(`/receptions/${receptionId}`);
  return { ok: true };
}
