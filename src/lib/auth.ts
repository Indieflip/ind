import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/db";
import type { Role } from "./permissions";

const COOKIE = "rm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours : pas besoin de se reconnecter à chaque livraison

let cachedSecret: Uint8Array | null = null;

async function secret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  let value = process.env.AUTH_SECRET;
  if (!value) {
    const db = getDb();
    const row = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, "auth_secret") });
    if (row) value = row.value;
    else {
      value = randomBytes(32).toString("hex");
      await db.insert(schema.appSettings).values({ key: "auth_secret", value }).onConflictDoNothing();
      const again = await db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, "auth_secret") });
      value = again!.value;
    }
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  locale: string;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(await secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Utilisateur connecté (relu en base : un compte désactivé perd l'accès immédiatement) */
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const uid = Number(payload.uid);
    const user = await getDb().query.users.findFirst({ where: eq(schema.users.id, uid) });
    if (!user || !user.active) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale };
  } catch {
    return null;
  }
}

export async function requireUser(check?: (r: Role) => boolean): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (check && !check(user.role)) redirect("/");
  return user;
}

/** Pour les server actions / routes API : lève une erreur au lieu de rediriger */
export async function assertUser(check?: (r: Role) => boolean): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (check && !check(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function hasAnyUser() {
  const row = await getDb().query.users.findFirst({ columns: { id: true } });
  return !!row;
}
