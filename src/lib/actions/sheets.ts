"use server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { buildSheetData, canValidateSheets, createSheet } from "@/lib/server/sheets";

const refresh = (id?: number) => {
  revalidatePath("/receptions");
  revalidatePath("/receptions/fiches");
  if (id) revalidatePath(`/receptions/fiches/${id}`);
  revalidatePath("/accueil");
};

/** Édite la fiche d'un jour (créée avec le N° suivant de l'année si elle n'existe pas) */
export async function createSheetAction(date: string) {
  const user = await assertUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "date" };
  const id = await createSheet(date, user);
  refresh(id);
  return { id };
}

async function latest(sheetId: number) {
  return getDb().query.receptionSheetVersions.findFirst({ where: eq(schema.receptionSheetVersions.sheetId, sheetId), orderBy: desc(schema.receptionSheetVersions.version) });
}

/** Version en attente de validation : on peut la remettre à jour (elle n'a encore aucune valeur légale) */
export async function refreshPendingAction(sheetId: number) {
  const user = await assertUser();
  const db = getDb();
  const [sheet, v] = await Promise.all([db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.id, sheetId) }), latest(sheetId)]);
  if (!sheet || !v || v.status !== "pending") return { error: "locked" };
  const { data, receptionCount } = await buildSheetData(sheet.date, user.locale);
  await db.update(schema.receptionSheetVersions).set({ data, receptionCount, lineCount: data.rows.length, createdAt: new Date(), createdBy: user.id }).where(eq(schema.receptionSheetVersions.id, v.id));
  refresh(sheetId);
  return { ok: true };
}

/** Fiche validée (ou refusée) : toute modification est une nouvelle version, avec motif, à nouveau soumise à validation */
export async function addModificationAction(sheetId: number, reason: string) {
  const user = await assertUser();
  if (!reason.trim()) return { error: "reason" };
  const db = getDb();
  const [sheet, v] = await Promise.all([db.query.receptionSheets.findFirst({ where: eq(schema.receptionSheets.id, sheetId) }), latest(sheetId)]);
  if (!sheet || !v || v.status === "pending") return { error: "pending" };
  const { data, receptionCount } = await buildSheetData(sheet.date, user.locale);
  await db.insert(schema.receptionSheetVersions).values({ sheetId, version: v.version + 1, data, receptionCount, lineCount: data.rows.length, reason: reason.trim(), createdBy: user.id });
  refresh(sheetId);
  return { ok: true };
}

/** Validation (ou refus) par un responsable désigné ; une version validée n'est plus jamais modifiée */
export async function reviewSheetAction(versionId: number, decision: "validated" | "rejected", note: string) {
  const user = await assertUser();
  if (!(await canValidateSheets(user))) return { error: "forbidden" };
  if (decision === "rejected" && !note.trim()) return { error: "note" };
  const v = schema.receptionSheetVersions;
  const [row] = await getDb()
    .update(v)
    .set({ status: decision, reviewedBy: user.id, reviewedAt: new Date(), reviewNote: note.trim() || null })
    .where(and(eq(v.id, versionId), eq(v.status, "pending")))
    .returning({ sheetId: v.sheetId });
  if (!row) return { error: "locked" };
  refresh(row.sheetId);
  return { ok: true };
}

/** Réglages : responsables désignés pour valider les fiches de réception */
export async function setSheetValidatorsAction(ids: number[]) {
  await assertUser((r) => r === "admin");
  await setSetting("sheet_validators", ids.filter(Boolean).join(","));
  revalidatePath("/settings/utilisateurs");
  return { ok: true };
}

/** Suppression avant 5 ans : uniquement les fiches déjà exportées par l'administrateur, sur demande */
export async function deleteExportedSheetsAction(confirm: string) {
  await assertUser((r) => r === "admin");
  if (confirm !== "SUPPRIMER") return { error: "confirm" };
  const res = await getDb().delete(schema.receptionSheets).where(isNotNull(schema.receptionSheets.exportedAt)).returning({ id: schema.receptionSheets.id });
  refresh();
  return { ok: true, count: res.length };
}
