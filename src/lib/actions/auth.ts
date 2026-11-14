"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createSession, destroySession, hashPassword, verifyPassword, hasAnyUser, getUser } from "@/lib/auth";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export async function loginAction(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await getDb().query.users.findFirst({ where: eq(sql`lower(${schema.users.email})`, email) });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "invalid" };
  }
  await createSession(user.id);
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/receptions");
}

export async function setupAction(_prev: { error?: string } | undefined, form: FormData) {
  if (await hasAnyUser()) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const restaurant = String(form.get("restaurant") ?? "").trim();
  if (!name || !email.includes("@") || password.length < 8) return { error: "invalid" };
  const db = getDb();
  const [user] = await db
    .insert(schema.users)
    .values({ name, email, passwordHash: await hashPassword(password), role: "admin" })
    .returning();
  if (restaurant) {
    await db
      .insert(schema.appSettings)
      .values({ key: "restaurant_name", value: restaurant })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: restaurant } });
  }
  await createSession(user.id);
  redirect("/receptions");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setLocaleAction(locale: string) {
  const l = normalizeLocale(locale);
  (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const user = await getUser();
  if (user) await getDb().update(schema.users).set({ locale: l }).where(eq(schema.users.id, user.id));
}
