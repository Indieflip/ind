"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser, hashPassword } from "@/lib/auth";
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
  if (data.password) {
    if (data.password.length < 8) throw new Error("password too short");
    set.passwordHash = await hashPassword(data.password);
  }
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
