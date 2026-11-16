"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser, hashPassword, verifyPassword } from "@/lib/auth";
import { can, mergeMatrix } from "@/lib/permissions";
import { num } from "@/lib/format";
import { setSetting } from "@/lib/settings";

type R = { ok?: boolean; error?: string } | undefined;
const ROLES = ["admin", "econome", "comptable", "invite"] as const;

export async function addUserAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.manageUsers);
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "econome") as (typeof ROLES)[number];
  if (!name || !email.includes("@") || password.length < 8 || !ROLES.includes(role)) return { error: "invalid" };
  const db = getDb();
  const exists = await db.query.users.findFirst({ where: eq(sql`lower(${schema.users.email})`, email) });
  if (exists) return { error: "exists" };
  await db.insert(schema.users).values({ name, email, role, passwordHash: await hashPassword(password) });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserAction(id: number, data: { role?: string; active?: boolean; password?: string; name?: string }) {
  const me = await assertUser(can.manageUsers);
  const set: Partial<typeof schema.users.$inferInsert> = {};
  // On ne peut pas se retirer soi-même les droits admin ou se désactiver (évite de se bloquer)
  if (data.role && ROLES.includes(data.role as "admin") && id !== me.id) set.role = data.role as "admin";
  if (data.active !== undefined && id !== me.id) set.active = data.active;
  if (data.name?.trim()) set.name = data.name.trim();
  // Le mot de passe ne se change plus ici : voir changePasswordAction (vérification obligatoire)
  if (Object.keys(set).length) await getDb().update(schema.users).set(set).where(eq(schema.users.id, id));
  revalidatePath("/settings");
}

export async function updateCategoryAction(id: number, data: { conformMax?: string; reserveMax?: string; tempRequired?: boolean }) {
  await assertUser((r) => r === "admin");
  const set: Partial<typeof schema.categories.$inferInsert> = {};
  if (data.conformMax !== undefined) set.conformMax = num(data.conformMax);
  if (data.reserveMax !== undefined) set.reserveMax = num(data.reserveMax);
  if (data.tempRequired !== undefined) set.tempRequired = data.tempRequired;
  await getDb().update(schema.categories).set(set).where(eq(schema.categories.id, id));
  revalidatePath("/settings");
}

export async function setRestaurantAction(name: string) {
  await assertUser(can.manageUsers);
  await setSetting("restaurant_name", name.trim());
  revalidatePath("/", "layout");
}

/** Suppression d'un utilisateur. S'il a déjà saisi des bons, on propose plutôt de le désactiver. */
export async function deleteUserAction(id: number): Promise<{ error?: string }> {
  const me = await assertUser(can.manageUsers);
  if (id === me.id) return { error: "self" };
  try {
    await getDb().delete(schema.users).where(eq(schema.users.id, id));
  } catch {
    return { error: "used" };
  }
  revalidatePath("/settings");
  return {};
}

export async function saveRightsAction(matrix: Record<string, Record<string, boolean>>) {
  await assertUser(can.manageRights);
  await setSetting("rights", JSON.stringify(mergeMatrix(matrix)));
  revalidatePath("/", "layout");
}

export async function saveBackupSettingsAction(data: { email: string; frequencyDays: number; retentionYears: number }) {
  await assertUser(can.backup);
  const email = data.email.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "email" };
  await setSetting("backup_email", email);
  await setSetting("backup_frequency_days", String(Math.min(90, Math.max(1, Math.round(data.frequencyDays || 7)))));
  await setSetting("retention_years", String(Math.min(30, Math.max(1, Math.round(data.retentionYears || 10)))));
  revalidatePath("/settings");
  return { ok: true };
}

/** Profil d'un utilisateur (nom, e-mail, profil, actif) */
export async function updateUserProfileAction(id: number, data: { name: string; email: string; role: string; active: boolean }) {
  const me = await assertUser(can.manageUsers);
  const email = data.email.trim().toLowerCase();
  if (!data.name.trim() || !email.includes("@")) return { error: "invalid" };
  const db = getDb();
  const other = await db.query.users.findFirst({ where: eq(sql`lower(${schema.users.email})`, email) });
  if (other && other.id !== id) return { error: "exists" };
  const set: Partial<typeof schema.users.$inferInsert> = { name: data.name.trim(), email };
  if (id !== me.id && ROLES.includes(data.role as "admin")) set.role = data.role as "admin";
  if (id !== me.id) set.active = data.active;
  await db.update(schema.users).set(set).where(eq(schema.users.id, id));
  revalidatePath("/settings/utilisateurs", "layout");
  return { ok: true };
}

/**
 * Changement de mot de passe sécurisé : l'administrateur confirme avec SON mot de passe actuel,
 * puis saisit deux fois le nouveau.
 */
export async function changePasswordAction(id: number, current: string, next: string, confirmNext: string) {
  const me = await assertUser(can.manageUsers);
  if (next.length < 8) return { error: "short" };
  if (next !== confirmNext) return { error: "mismatch" };
  const db = getDb();
  const self = await db.query.users.findFirst({ where: eq(schema.users.id, me.id) });
  if (!self || !(await verifyPassword(current, self.passwordHash))) return { error: "current" };
  await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, id));
  return { ok: true };
}

export async function updateConformityAction(id: number, data: { conformRules?: string; reserveRules?: string; refuseRules?: string }) {
  await assertUser((r) => r === "admin");
  const set: Partial<typeof schema.categories.$inferInsert> = {};
  if (data.conformRules !== undefined) set.conformRules = data.conformRules.trim() || null;
  if (data.reserveRules !== undefined) set.reserveRules = data.reserveRules.trim() || null;
  if (data.refuseRules !== undefined) set.refuseRules = data.refuseRules.trim() || null;
  await getDb().update(schema.categories).set(set).where(eq(schema.categories.id, id));
  revalidatePath("/settings/reglementation", "layout");
  revalidatePath("/protocoles");
}

const COMPANY_KEYS = ["company_legal_name", "restaurant_name", "company_address", "company_phone", "company_email", "company_siren", "company_vat"] as const;

/** Champs de l'onglet Company (raison sociale, établissement, adresse, téléphone, mail) */
export async function setCompanyFieldAction(key: string, value: string) {
  await assertUser((r) => r === "admin");
  if (!(COMPANY_KEYS as readonly string[]).includes(key)) return { error: "invalid" };
  const v = value.trim();
  if (key === "company_email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { error: "email" };
  // SIREN : 9 chiffres ; TVA intracommunautaire : FR + 11 caractères
  if (key === "company_siren" && v && v.replace(/\s/g, "").length !== 9) return { error: "siren" };
  if (key === "company_vat" && v && !/^[A-Z]{2}[0-9A-Z]{2,13}$/i.test(v.replace(/\s/g, ""))) return { error: "vat" };
  await setSetting(key, v);
  revalidatePath("/", "layout");
  return { ok: true };
}
