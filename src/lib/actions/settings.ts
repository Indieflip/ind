"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser, hashPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { setSetting } from "@/lib/settings";

type R = { ok?: boolean; error?: string } | undefined;
const ROLES = ["admin", "contributor", "viewer"] as const;

export async function addUserAction(_p: R, form: FormData): Promise<R> {
  await assertUser(can.manageSettings);
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "contributor") as (typeof ROLES)[number];
  if (!name || !email.includes("@") || password.length < 8 || !ROLES.includes(role)) return { error: "invalid" };
  const db = getDb();
  const exists = await db.query.users.findFirst({ where: eq(sql`lower(${schema.users.email})`, email) });
  if (exists) return { error: "exists" };
  await db.insert(schema.users).values({ name, email, role, passwordHash: await hashPassword(password) });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserAction(id: number, data: { role?: string; active?: boolean; password?: string; name?: string }) {
  const me = await assertUser(can.manageSettings);
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
  await assertUser(can.manageSettings);
  const set: Partial<typeof schema.categories.$inferInsert> = {};
  if (data.conformMax !== undefined) set.conformMax = num(data.conformMax);
  if (data.reserveMax !== undefined) set.reserveMax = num(data.reserveMax);
  if (data.tempRequired !== undefined) set.tempRequired = data.tempRequired;
  await getDb().update(schema.categories).set(set).where(eq(schema.categories.id, id));
  revalidatePath("/settings");
}

export async function setRestaurantAction(name: string) {
  await assertUser(can.manageSettings);
  await setSetting("restaurant_name", name.trim());
  revalidatePath("/", "layout");
}
