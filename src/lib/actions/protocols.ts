"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting, setSetting } from "@/lib/settings";

export async function saveProtocolAction(id: number | null, title: string, content: string, folder?: string | null) {
  const user = await assertUser(can.editProtocols);
  const t = title.trim();
  if (!t) return { error: "title" };
  const db = getDb();
  let savedId = id;
  if (id) {
    await db.update(schema.protocols).set({ title: t, content, folder: folder?.trim() || null, updatedBy: user.id, updatedAt: new Date() }).where(eq(schema.protocols.id, id));
  } else {
    savedId = (await db.insert(schema.protocols).values({ title: t, content, folder: folder?.trim() || null, updatedBy: user.id }).returning())[0].id;
  }
  revalidatePath("/protocoles");
  return { id: savedId };
}

export async function deleteProtocolAction(id: number) {
  await assertUser(can.editProtocols);
  await getDb().delete(schema.protocols).where(eq(schema.protocols.id, id));
  revalidatePath("/protocoles");
}

/** Dossiers : liste (y compris les dossiers encore vides), gardée dans les réglages */
async function folders() {
  return JSON.parse((await getSetting("protocol_folders")) ?? "[]") as string[];
}

export async function addFolderAction(name: string) {
  await assertUser(can.editProtocols);
  const n = name.trim().slice(0, 80);
  if (!n) return { error: "name" };
  const list = await folders();
  if (!list.includes(n)) await setSetting("protocol_folders", JSON.stringify([...list, n]));
  revalidatePath("/protocoles");
  return { ok: true };
}

export async function renameFolderAction(from: string, to: string) {
  await assertUser(can.editProtocols);
  const n = to.trim().slice(0, 80);
  if (!n) return { error: "name" };
  const list = await folders();
  await setSetting("protocol_folders", JSON.stringify([...new Set(list.map((x) => (x === from ? n : x)).concat(list.includes(from) ? [] : [n]))]));
  await getDb().update(schema.protocols).set({ folder: n }).where(eq(schema.protocols.folder, from));
  revalidatePath("/protocoles");
  return { ok: true };
}

/** Supprime le dossier ; ses protocoles reviennent à la racine (rien n'est effacé) */
export async function deleteFolderAction(name: string) {
  await assertUser(can.editProtocols);
  await setSetting("protocol_folders", JSON.stringify((await folders()).filter((x) => x !== name)));
  await getDb().update(schema.protocols).set({ folder: null }).where(eq(schema.protocols.folder, name));
  revalidatePath("/protocoles");
  return { ok: true };
}

/** Range un protocole dans un dossier (ou à la racine) */
export async function moveProtocolAction(id: number, folder: string | null) {
  await assertUser(can.editProtocols);
  await getDb().update(schema.protocols).set({ folder: folder?.trim() || null }).where(eq(schema.protocols.id, id));
  revalidatePath("/protocoles");
  return { ok: true };
}
