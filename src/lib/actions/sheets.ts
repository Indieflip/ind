"use server";
import { isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

/** Administrateur : responsable(s) désigné(s), indiqué(s) dans l'en-tête des fiches */
export async function setSheetValidatorsAction(ids: number[]) {
  await assertUser((r) => r === "admin");
  await setSetting("sheet_validators", ids.filter(Boolean).join(","));
  revalidatePath("/receptions/fiches");
  return { ok: true };
}

/** Suppression avant 5 ans : uniquement les exports déjà archivés (export administrateur), sur demande */
export async function deleteExportedSheetsAction(confirm: string) {
  await assertUser((r) => r === "admin");
  if (confirm !== "SUPPRIMER") return { error: "confirm" };
  const res = await getDb().delete(schema.receptionExports).where(isNotNull(schema.receptionExports.archivedAt)).returning({ id: schema.receptionExports.id });
  revalidatePath("/receptions/fiches");
  return { ok: true, count: res.length };
}
