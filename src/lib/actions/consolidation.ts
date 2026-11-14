"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Consolide (valide) des bons : ils ne pourront plus être modifiés ni supprimés */
export async function consolidateAction(ids: number[]) {
  const user = await assertUser(can.consolidate);
  const clean = ids.filter((n) => Number.isInteger(n) && n > 0);
  if (!clean.length) return { count: 0 };
  const done = await getDb()
    .update(schema.receptions)
    .set({ consolidatedAt: new Date(), consolidatedBy: user.id })
    .where(and(inArray(schema.receptions.id, clean), isNull(schema.receptions.consolidatedAt)))
    .returning({ id: schema.receptions.id });
  revalidatePath("/consolidation");
  revalidatePath("/receptions", "layout");
  return { count: done.length };
}

/** Note complémentaire sur un bon consolidé (horodatée, non modifiable) */
export async function addNoteAction(receptionId: number, text: string) {
  const user = await assertUser(can.addNote);
  const t = text.trim();
  if (!t) return { error: "empty" };
  const rec = await getDb().query.receptions.findFirst({ where: eq(schema.receptions.id, receptionId), columns: { consolidatedAt: true } });
  if (!rec?.consolidatedAt) return { error: "not_consolidated" };
  await getDb().insert(schema.receptionNotes).values({ receptionId, text: t.slice(0, 5000), createdBy: user.id });
  revalidatePath(`/receptions/${receptionId}`);
  revalidatePath("/consolidation");
  return { ok: true };
}
