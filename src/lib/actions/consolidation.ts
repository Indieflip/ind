"use server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Ancienne fiche (générée depuis les anomalies importées) : consolidation manuelle, la fiche n'est plus modifiable */
export async function consolidateImportedAction(receptionId: number) {
  const user = await assertUser(can.consolidate);
  const r = schema.receptions;
  const done = await getDb()
    .update(r)
    .set({ consolidatedAt: new Date(), consolidatedBy: user.id })
    .where(and(eq(r.id, receptionId), isNotNull(r.importedFrom), isNull(r.consolidatedAt)))
    .returning({ id: r.id });
  revalidatePath("/receptions", "layout");
  return { ok: done.length > 0 };
}

/** Ancienne fiche (importée) : enlever la consolidation, la fiche redevient modifiable */
export async function unconsolidateImportedAction(receptionId: number) {
  await assertUser(can.consolidate);
  const r = schema.receptions;
  const done = await getDb()
    .update(r)
    .set({ consolidatedAt: null, consolidatedBy: null })
    .where(and(eq(r.id, receptionId), isNotNull(r.importedFrom), isNotNull(r.consolidatedAt)))
    .returning({ id: r.id });
  revalidatePath("/receptions", "layout");
  return { ok: done.length > 0 };
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
  return { ok: true };
}
