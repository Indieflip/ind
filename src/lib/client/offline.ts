"use client";
import { get, set, del } from "idb-keyval";
import type { Catalog, Draft, ReceptionPayload } from "../reception-types";
import { dataUrlToBlob } from "./image";

const DRAFT = "rm:draft";
const OUTBOX = "rm:outbox";
const CATALOG = "rm:catalog";

export const loadDraft = () => get<Draft>(DRAFT).catch(() => undefined);
export const saveDraft = (d: Draft) => set(DRAFT, { ...d, updatedAt: new Date().toISOString() }).catch(() => {});
export const clearDraft = () => del(DRAFT).catch(() => {});

export const loadCatalogCache = () => get<Catalog>(CATALOG).catch(() => undefined);

export async function fetchCatalog(): Promise<Catalog | undefined> {
  try {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const cat = (await res.json()) as Catalog;
    await set(CATALOG, cat).catch(() => {});
    return cat;
  } catch {
    return loadCatalogCache();
  }
}

export async function getOutbox(): Promise<ReceptionPayload[]> {
  return (await get<ReceptionPayload[]>(OUTBOX).catch(() => undefined)) ?? [];
}

async function setOutbox(items: ReceptionPayload[]) {
  if (items.length) await set(OUTBOX, items);
  else await del(OUTBOX);
}

export async function enqueue(p: ReceptionPayload) {
  const box = await getOutbox();
  await setOutbox([...box.filter((x) => x.clientUuid !== p.clientUuid), p]);
}

async function uploadIfNeeded(src: string, folder: string): Promise<string> {
  if (!src.startsWith("data:")) return src;
  const fd = new FormData();
  const blob = dataUrlToBlob(src);
  fd.append("file", blob, `${folder}.${blob.type === "application/pdf" ? "pdf" : blob.type === "image/png" ? "png" : "jpg"}`);
  fd.append("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return (await res.json()).url as string;
}

/** Envoie une réception : photos d'abord, puis les données. Lève une erreur si hors ligne. */
export async function sendReception(p: ReceptionPayload, editId?: number): Promise<number> {
  const blPhotos = [];
  for (const ph of p.blPhotos) blPhotos.push(await uploadIfNeeded(ph, "bl"));
  const lines = [];
  for (const l of p.lines) {
    const photos = [];
    for (const ph of l.photos) photos.push(await uploadIfNeeded(ph, "issue"));
    lines.push({ ...l, photos });
  }
  const signature = p.signature ? await uploadIfNeeded(p.signature, "signature") : null;
  const res = await fetch(editId ? `/api/receptions/${editId}` : "/api/receptions", {
    method: editId ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...p, blPhotos, lines, signature }),
  });
  if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { fatal: true });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).id as number;
}

let syncing = false;
/** Renvoie les réceptions en attente. Retourne le nombre restant. */
export async function syncOutbox(): Promise<number> {
  if (syncing) return (await getOutbox()).length;
  syncing = true;
  try {
    for (const p of await getOutbox()) {
      try {
        await sendReception(p);
        await setOutbox((await getOutbox()).filter((x) => x.clientUuid !== p.clientUuid));
      } catch (e) {
        // Réseau ou session expirée : on réessaiera plus tard. Données invalides : on garde la
        // réception en file (jamais de perte) et on passe à la suivante.
        if (!(e as { fatal?: boolean }).fatal) break;
      }
    }
    return (await getOutbox()).length;
  } finally {
    syncing = false;
  }
}
