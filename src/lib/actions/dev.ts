"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { canSeeDev } from "@/lib/server/dev";

async function guard() {
  const user = await getUser();
  if (!(await canSeeDev(user))) throw new Error("FORBIDDEN");
  return user!;
}

const KINDS = ["objective", "pending", "constraint", "idea", "done"];
const PRIORITIES = ["haute", "moyenne", "basse"];

export async function saveDevItemAction(id: number | null, data: { kind: string; title: string; detail: string; owner: string; priority?: string }) {
  await guard();
  if (!data.title.trim() || !KINDS.includes(data.kind)) return { error: "invalid" };
  const values = { kind: data.kind, title: data.title.trim(), detail: data.detail.trim() || null, owner: data.owner || null, priority: PRIORITIES.includes(data.priority ?? "") ? data.priority! : null, updatedAt: new Date() };
  if (id) await getDb().update(schema.devItems).set(values).where(eq(schema.devItems.id, id));
  else await getDb().insert(schema.devItems).values({ ...values, position: Date.now() % 1_000_000 });
  revalidatePath("/dev");
  return { ok: true };
}

export async function deleteDevItemAction(id: number) {
  await guard();
  await getDb().delete(schema.devItems).where(eq(schema.devItems.id, id));
  revalidatePath("/dev");
}

/** Réserver l'onglet Dev à son propre compte */
export async function reserveDevAction() {
  const user = await guard();
  await setSetting("dev_users", String(user.id));
  revalidatePath("/", "layout");
}
