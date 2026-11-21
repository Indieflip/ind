"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { canSeeDev } from "@/lib/server/dev";

async function guard() {
  const user = await getUser();
  if (!(await canSeeDev(user))) throw new Error("FORBIDDEN");
  return user!;
}

const KINDS = ["objective", "pending", "constraint", "idea", "done"];
const PRIORITIES = ["haute", "moyenne", "basse"];

export async function saveDevItemAction(id: number | null, data: { kind: string; title: string; detail: string; owner: string; priority?: string; task?: string }) {
  await guard();
  if (!data.title.trim() || !KINDS.includes(data.kind)) return { error: "invalid" };
  const values = { kind: data.kind, title: data.title.trim(), detail: data.detail.trim() || null, owner: data.owner || null, priority: PRIORITIES.includes(data.priority ?? "") ? data.priority! : null, task: data.task?.trim() || null, updatedAt: new Date() };
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

const FORMS = ["reception", "anomaly", "claim", "weigh", "product", "supplier", "sheet", "credit"];

/** Dev > Développement : champ d'une fiche (obligatoire, règle de saisie, message affiché) */
export async function saveDevFieldAction(id: number | null, data: { form: string; section: string; field: string; required: boolean; rule: string; message: string }) {
  await guard();
  if (!data.field.trim() || !FORMS.includes(data.form)) return { error: "invalid" };
  const values = { form: data.form, section: data.section.trim() || null, field: data.field.trim(), required: data.required, rule: data.rule.trim() || null, message: data.message.trim() || null, updatedAt: new Date() };
  if (id) await getDb().update(schema.devFields).set(values).where(eq(schema.devFields.id, id));
  else await getDb().insert(schema.devFields).values({ ...values, position: 10_000 + (Date.now() % 1_000_000) });
  revalidatePath("/dev");
  return { ok: true };
}

export async function deleteDevFieldAction(id: number) {
  await guard();
  await getDb().delete(schema.devFields).where(eq(schema.devFields.id, id));
  revalidatePath("/dev");
}

/** Dev > Projet : document de travail (éditeur de texte riche) */
export async function saveProjectDocAction(html: string) {
  await guard();
  await setSetting("dev_project_doc", html.slice(0, 500_000));
  revalidatePath("/dev");
  return { ok: true };
}

/** Dev > Projet : hypothèses du calcul coût / gains */
export async function saveProjectRoiAction(data: { monthlyCost: number; hoursPerWeek: number; hourlyRate: number; sites: number }) {
  await guard();
  const n = (v: number) => (Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
  await setSetting("dev_project_roi", JSON.stringify({ monthlyCost: n(data.monthlyCost), hoursPerWeek: n(data.hoursPerWeek), hourlyRate: n(data.hourlyRate), sites: Math.max(1, Math.round(n(data.sites))) }));
  revalidatePath("/dev");
  return { ok: true };
}

/** Dev : saisie directe de la colonne « Tâche » */
export async function setDevTaskAction(id: number, task: string) {
  await guard();
  await getDb().update(schema.devItems).set({ task: task.trim().slice(0, 120) || null }).where(eq(schema.devItems.id, id));
  revalidatePath("/dev");
  return { ok: true };
}

/** Dev > Marché : comparatif des concurrents (lignes modifiables, ajoutées ou supprimées) */
export async function saveCompetitorsAction(rows: Record<string, string>[]) {
  await guard();
  const keys = ["cat", "name", "url", "price", "reception", "haccp", "cmp", "stock", "ddpp", "offline", "other", "pros", "cons", "target"];
  const clean = rows
    .map((r) => Object.fromEntries(keys.map((k) => [k, String(r[k] ?? "").trim().slice(0, 2000)])))
    .filter((r) => r.name)
    .slice(0, 200);
  await setSetting("dev_competitors", JSON.stringify(clean));
  revalidatePath("/dev");
  return { ok: true };
}

/** Dev > Développement > Caractéristiques : colonne « Point » (texte libre par ligne) */
export async function saveCharacteristicPointAction(id: string, text: string) {
  await guard();
  let cur: Record<string, string> = {};
  try { cur = JSON.parse((await getSetting("dev_char_points")) ?? "{}") ?? {}; } catch { cur = {}; }
  const k = id.slice(0, 80);
  if (text.trim()) cur[k] = text.trim().slice(0, 2000); else delete cur[k];
  await setSetting("dev_char_points", JSON.stringify(cur));
  revalidatePath("/dev");
  return { ok: true };
}
