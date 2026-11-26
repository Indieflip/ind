"use server";
import { invalidate } from "@/lib/server/throttle";
import { parisYear } from "@/lib/numbering";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { storeFile, parseDataUrl } from "@/lib/storage";
import { matchProduct } from "@/lib/server/maj";
import { WAITING, legacyOf, MODES, outcomeOf, RESOLUTIONS, stageOf, STAGES, type Stage } from "@/lib/anomaly";

const TYPES = schema.anomalyTypeEnum.enumValues;
const STATUSES = schema.anomalyStatusEnum.enumValues;

export async function createAnomalyAction(_p: { ok?: boolean; error?: string } | undefined, form: FormData) {
  const user = await assertUser(can.createAnomaly);
  const receptionId = Number(form.get("receptionId")) || null;
  const description = String(form.get("description") ?? "").trim();
  const type = String(form.get("type") ?? "other") as (typeof TYPES)[number];
  const productName = String(form.get("productName") ?? "").trim() || null;
  const photo = String(form.get("photo") ?? "");
  const nature = String(form.get("nature") ?? "").trim() || null;
  const nextActionAt = String(form.get("nextActionAt") ?? "") || null;
  // Une anomalie est toujours rattachée à un bon existant
  if (!receptionId || !description || !TYPES.includes(type)) return { error: "invalid" };
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, receptionId) });
  if (!rec) return { error: "invalid" };
  let photoUrl: string | null = null;
  const parsed = photo ? parseDataUrl(photo) : null;
  if (parsed) photoUrl = await storeFile(parsed.buffer, parsed.contentType, "anomaly");
  const docs = (rec.documents as { type: string; number: string }[] | null) ?? (rec.blNumber ? [{ type: "bl", number: rec.blNumber }] : []);
  await db.insert(schema.anomalies).values({
    receptionId, supplierId: rec.supplierId, supplierName: rec.supplierName, description, type, productName, photoUrl, createdBy: user.id,
    nature, reference: docs.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc" : "BL"} ${d.number}`).join(", ") || null,
    nextActionAt: nextActionAt && /^\d{4}-\d{2}-\d{2}$/.test(nextActionAt) ? nextActionAt : null,
    createdAt: rec.deliveredAt,
    source: "manual",
    claimedAmount: (() => { const n = num(String(form.get("claimedAmount") ?? "")); return n != null ? String(Math.abs(n)) : null; })(),
  });
  revalidatePath(`/receptions/${receptionId}`);
  revalidatePath("/anomalies");
  return { ok: true };
}

export async function updateAnomalyAction(
  id: number,
  data: {
    status?: string; creditAmount?: string; followUp?: string; description?: string; nature?: string; result?: string; lastActionAt?: string; nextActionAt?: string;
    stage?: string; resolution?: string; mode?: string; claimedAmount?: string; creditNumber?: string; creditDate?: string; creditKind?: string; docDate?: string; waitingFor?: string;
    problemType?: string; productId?: number | null; note?: string;
    items?: { productId: number | null; name: string; qty: number | null; unit: string; price: number | null }[];
  },
) {
  await assertUser(can.manageAnomalies);
  const set: Partial<typeof schema.anomalies.$inferInsert> = {};
  if (data.status && STATUSES.includes(data.status as (typeof STATUSES)[number])) {
    set.status = data.status as (typeof STATUSES)[number];
    set.closedAt = data.status === "closed" ? new Date() : null;
  }
  if (data.creditAmount !== undefined) {
    const n = num(data.creditAmount);
    set.creditAmount = n != null ? String(n) : null;
  }
  if (data.followUp !== undefined) set.followUp = data.followUp.trim() || null;
  if (data.description !== undefined && data.description.trim()) set.description = data.description.trim();
  if (data.nature !== undefined) set.nature = data.nature.trim() || null;
  if (data.result !== undefined) set.result = outcomeOf(data.result);
  if (data.problemType !== undefined) set.problemType = data.problemType.trim() || null;
  if (data.note !== undefined) set.note = data.note.trim() || null;
  if (data.items !== undefined) {
    const items = data.items
      .map((x) => ({ productId: x.productId ?? null, name: String(x.name ?? "").trim().slice(0, 300), qty: x.qty != null && Number.isFinite(x.qty) ? x.qty : null, unit: String(x.unit ?? "").trim().slice(0, 30), price: x.price != null && Number.isFinite(x.price) ? x.price : null }))
      .filter((x) => x.name)
      .slice(0, 100);
    // Liste vide = fiche enregistrée volontairement sans produit (gardée vide, jamais recalculée)
    set.items = items;
    // Le premier produit reste le produit principal de la fiche ; sans produit, la fiche n'en a plus
    if (items[0]) { set.productName = items[0].name; set.productId = items[0].productId; }
    else { set.productName = null; set.productId = null; }
  }
  if (data.productId !== undefined) {
    const p = data.productId ? await getDb().query.products.findFirst({ where: eq(schema.products.id, data.productId), columns: { id: true, name: true } }) : undefined;
    set.productId = p?.id ?? null;
    if (p) set.productName = p.name;
  }
  // Suivi unique : l'étape pilote aussi les anciens champs statut / résultat
  if (data.stage !== undefined && STAGES.includes(data.stage as Stage)) {
    const stage = stageOf(data.stage);
    const resolution = stage === "cloturee" && RESOLUTIONS.includes(data.resolution as (typeof RESOLUTIONS)[number]) ? data.resolution! : null;
    // Date de clôture : posée quand la fiche est clôturée / annulée, gardée tant qu'elle le reste (pas remise à jour à chaque enregistrement)
    const cur = await getDb().query.anomalies.findFirst({ where: eq(schema.anomalies.id, id), columns: { stage: true, closedAt: true } });
    const closed = stage === "cloturee" || stage === "annulee";
    const closedAt = !closed ? null : cur && cur.stage === stage && cur.closedAt ? cur.closedAt : new Date();
    Object.assign(set, { stage, resolution, ...legacyOf(stage, resolution), closedAt });
  }
  if (data.creditNumber !== undefined) set.creditNumber = data.creditNumber.trim() || null;
  if (data.creditKind !== undefined) set.creditKind = data.creditKind === "facture" ? "facture" : data.creditKind === "avoir" ? "avoir" : null;
  if (data.waitingFor !== undefined) set.waitingFor = WAITING.includes(data.waitingFor as (typeof WAITING)[number]) ? data.waitingFor : null;
  if (data.docDate !== undefined) set.docDate = /^\d{4}-\d{2}-\d{2}$/.test(data.docDate) ? data.docDate : null;
  if (data.creditDate !== undefined) set.creditDate = /^\d{4}-\d{2}-\d{2}$/.test(data.creditDate) ? data.creditDate : null;
  if (data.mode !== undefined && MODES.includes(data.mode as (typeof MODES)[number])) set.mode = data.mode;
  if (data.claimedAmount !== undefined) {
    const n = num(data.claimedAmount);
    set.claimedAmount = n != null ? String(Math.abs(n)) : null;
  }
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (data.lastActionAt !== undefined) set.lastActionAt = day(data.lastActionAt);
  if (data.nextActionAt !== undefined) set.nextActionAt = day(data.nextActionAt);
  const db = getDb();
  await db.update(schema.anomalies).set(set).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** Consolidation des anomalies traitées : elles sortent du suivi et ne sont plus modifiables */
export async function consolidateAnomaliesAction(ids: number[]) {
  const user = await assertUser(can.consolidate);
  const clean = ids.filter((n) => Number.isInteger(n));
  if (!clean.length) return { count: 0 };
  // N° définitif attribué à la consolidation, dans l'ordre des dates, à la suite du dernier numéro (unique)
  const done = await getDb().transaction(async (tx) => {
    await tx.execute(sql`lock table anomalies in share row exclusive mode`);
    const rows = await tx
      .select({ id: schema.anomalies.id, number: schema.anomalies.number, createdAt: schema.anomalies.createdAt })
      .from(schema.anomalies)
      .where(and(inArray(schema.anomalies.id, clean), isNull(schema.anomalies.consolidatedAt)))
      .orderBy(asc(schema.anomalies.createdAt), asc(schema.anomalies.id));
    // N° déjà attribué gardé ; sinon à la suite du dernier numéro de l'année de création (remise à zéro le 01/01)
    const maxByYear = new Map<number, number>();
    for (const r of (await tx.execute<{ y: number; m: number }>(sql`select extract(year from ${schema.anomalies.createdAt} at time zone 'Europe/Paris')::int as y, coalesce(max(${schema.anomalies.number}), 0)::int as m from ${schema.anomalies} group by 1`)).rows) maxByYear.set(Number(r.y), Number(r.m));
    for (const r of rows) {
      let number = r.number;
      if (number == null) { const y = parisYear(r.createdAt); number = (maxByYear.get(y) ?? 0) + 1; maxByYear.set(y, number); }
      await tx.update(schema.anomalies).set({ consolidatedAt: new Date(), consolidatedBy: user.id, number }).where(eq(schema.anomalies.id, r.id));
    }
    return rows;
  });
  revalidatePath("/anomalies", "layout");
  return { count: done.length };
}

/** Écarts de pesée : modification d'une ligne (l'écart en kg et en € est recalculé) */
export interface WeighGapInput {
  date?: string; nature?: string; supplierId?: number | null; reference?: string; product?: string;
  qtyInvoiced?: string; unitPrice?: string; qtyWeighed?: string; acceptableLoss?: string; detail?: string; claimDate?: string;
}

export async function updateWeighGapAction(id: number, data: WeighGapInput) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const [g] = await db.select().from(schema.weighGaps).where(eq(schema.weighGaps.id, id));
  if (!g) return { error: "not_found" };
  const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const n = (v: string | undefined, old: string | null) => (v === undefined ? num(old) : num(v));
  const set: Partial<typeof schema.weighGaps.$inferInsert> = {};
  if (data.date !== undefined && isoDate(data.date)) set.date = data.date;
  if (data.nature !== undefined) set.nature = data.nature.trim() || null;
  if (data.supplierId !== undefined) set.supplierId = data.supplierId;
  if (data.reference !== undefined) set.reference = data.reference.trim() || null;
  if (data.product !== undefined && data.product.trim()) {
    set.product = data.product.trim();
    const products = await db.select({ id: schema.products.id, name: schema.products.name, supplierId: schema.products.supplierId }).from(schema.products);
    set.productId = matchProduct(set.product, set.supplierId ?? g.supplierId, products)?.id ?? null;
  }
  if (data.detail !== undefined) set.detail = data.detail.trim() || null;
  if (data.claimDate !== undefined) set.claimDate = isoDate(data.claimDate);
  const inv = n(data.qtyInvoiced, g.qtyInvoiced);
  const price = n(data.unitPrice, g.unitPrice);
  const weighed = n(data.qtyWeighed, g.qtyWeighed);
  const loss = n(data.acceptableLoss, g.acceptableLoss);
  const str = (v: number | null) => (v == null ? null : String(v));
  set.qtyInvoiced = str(inv);
  set.unitPrice = str(price);
  set.qtyWeighed = str(weighed);
  set.acceptableLoss = str(loss);
  // Écart = facturé − contrôlé − perte acceptable ; écart € = écart × prix unitaire
  if (inv != null && weighed != null) {
    const gap = Math.round((inv - weighed - (loss ?? 0)) * 1000) / 1000;
    set.gapQty = String(gap);
    set.gapAmount = price != null ? String(Math.round(gap * price * 10000) / 10000) : null;
  }
  await db.update(schema.weighGaps).set(set).where(eq(schema.weighGaps.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
  invalidate("weigh-anomalies");
}

/** Nouvel écart de pesée saisi à la main (ou collé depuis un autre tableau) */
export async function addWeighGapAction(data: WeighGapInput) {
  await assertUser(can.manageAnomalies);
  if (!data.product?.trim()) return { error: "product" };
  const date = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : new Date().toISOString().slice(0, 10);
  const [row] = await getDb().insert(schema.weighGaps).values({ date, product: data.product.trim(), position: -1 }).returning({ id: schema.weighGaps.id });
  return updateWeighGapAction(row.id, { ...data, date });
}

/** Tableau de bord : passer une anomalie à l'étape suivante (ou précédente) */
export async function moveAnomalyAction(id: number, stage: string, resolution?: string) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const cur = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id), columns: { consolidatedAt: true, stage: true } });
  if (!cur) return { error: "not_found" };
  const st = stageOf(stage);
  const res = st === "cloturee" && RESOLUTIONS.includes(resolution as (typeof RESOLUTIONS)[number]) ? resolution! : null;
  const today = new Date().toISOString().slice(0, 10);
  await db.update(schema.anomalies).set({ stage: st, resolution: res, ...legacyOf(st, res), lastActionAt: today, closedAt: st === "cloturee" || st === "annulee" ? new Date() : null }).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** « Relancé aujourd'hui » : date de dernière action = aujourd'hui, une ligne ajoutée à l'action */
export async function followUpTodayAction(id: number, note: string, day?: string) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const cur = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id) });
  if (!cur) return { error: "not_found" };
  // Date de l'action : aujourd'hui par défaut, ou une autre date choisie (relance faite un autre jour)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const iso = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  const [yy, mm, dd] = iso.split("-");
  const label = `${dd}/${mm}/${yy.slice(2)}`;
  const line = `${label} : ${note.trim() || "relance"}`;
  const stage = stageOf(cur.stage) === "a_traiter" ? "en_attente" : stageOf(cur.stage);
  await db.update(schema.anomalies).set({
    followUp: [cur.followUp, line].filter(Boolean).join("\n"), lastActionAt: cur.lastActionAt && cur.lastActionAt > iso ? cur.lastActionAt : iso, stage,
    // Réclamation envoyée : on attend d'abord le retour du fournisseur
    ...(stage === "en_attente" && !cur.waitingFor ? { waitingFor: "reponse" } : {}), ...legacyOf(stage, cur.resolution),
  }).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}


/** Économies : rattacher les anomalies d'un nom de fournisseur non reconnu à un fournisseur de la liste */
export async function relinkSupplierGroupAction(supplierName: string, supplierId: number) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const sup = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) });
  if (!sup) return { error: "invalid" };
  await db.update(schema.anomalies).set({ supplierId: sup.id, supplierName: sup.name }).where(and(isNull(schema.anomalies.supplierId), eq(schema.anomalies.supplierName, supplierName)));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** Économies : supprimer les anomalies d'une ligne sans fournisseur (non consolidées) */
export async function deleteSupplierGroupAction(supplierName: string) {
  await assertUser(can.manageAnomalies);
  await getDb().delete(schema.anomalies).where(and(isNull(schema.anomalies.supplierId), isNull(schema.anomalies.consolidatedAt), eq(schema.anomalies.supplierName, supplierName)));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/**
 * Supprimer une fiche d'anomalie : sa réclamation part avec elle (N° R propre à la fiche, lignes de réclamation rattachées) ;
 * une réclamation partagée avec d'autres fiches reste pour celles-ci. Écart de pesée : le regroupement n'est plus recréé.
 */
export async function deleteAnomalyAction(id: number) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const a = await db.query.anomalies.findFirst({ where: eq(schema.anomalies.id, id) });
  if (!a) return { error: "not_found" };
  await db.transaction(async (tx) => {
    await tx.delete(schema.claims).where(eq(schema.claims.anomalyId, id));
    if (a.source === "weigh" && a.groupKey) {
      const key = "weigh_dismissed";
      const cur = (await tx.query.appSettings.findFirst({ where: eq(schema.appSettings.key, key) }))?.value;
      const list: string[] = cur ? JSON.parse(cur) : [];
      if (!list.includes(a.groupKey)) list.push(a.groupKey);
      await tx.insert(schema.appSettings).values({ key, value: JSON.stringify(list) }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(list) } });
    }
    await tx.delete(schema.anomalies).where(eq(schema.anomalies.id, id));
  });
  revalidatePath("/anomalies", "layout");
  revalidatePath("/receptions", "layout");
  return { ok: true };
}

/** Réclamations : regrouper plusieurs anomalies / écarts sous un même N° (le plus petit) */
export async function groupClaimsAction(ids: number[]) {
  await assertUser(can.manageAnomalies);
  const clean = ids.filter((n) => Number.isInteger(n));
  if (clean.length < 2) return { error: "invalid" };
  const db = getDb();
  const rows = await db.select({ claimNo: schema.anomalies.claimNo }).from(schema.anomalies).where(inArray(schema.anomalies.id, clean));
  const target = Math.min(...rows.map((r) => r.claimNo ?? Infinity));
  if (!Number.isFinite(target)) return { error: "invalid" };
  await db.update(schema.anomalies).set({ claimNo: target }).where(inArray(schema.anomalies.id, clean));
  revalidatePath("/anomalies", "layout");
  return { ok: true, claimNo: target };
}

/** Réclamations : sortir une anomalie d'un regroupement (nouveau N°) */
export async function ungroupClaimAction(id: number) {
  await assertUser(can.manageAnomalies);
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.anomalies.claimNo}), 0)::int` }).from(schema.anomalies);
  await db.update(schema.anomalies).set({ claimNo: max + 1 }).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}


/** Contrôle d'une fiche par l'utilisateur : « À vérifier », « Vérifiée », « À voir » (vide pour effacer) */
export async function setAnomalyReviewAction(id: number, review: string) {
  await assertUser(can.manageAnomalies);
  const value = ["a_verifier", "verifiee", "a_voir"].includes(review) ? review : null;
  await getDb().update(schema.anomalies).set({ review: value }).where(eq(schema.anomalies.id, id));
  revalidatePath("/anomalies", "layout");
  return { ok: true };
}

/** Liste des anomalies : même contrôle pour plusieurs fiches d'un coup */
export async function setAnomaliesReviewAction(ids: number[], review: string) {
  await assertUser(can.manageAnomalies);
  const value = ["a_verifier", "verifiee", "a_voir"].includes(review) ? review : null;
  const list = ids.filter((x) => Number.isInteger(x)).slice(0, 2000);
  if (list.length) await getDb().update(schema.anomalies).set({ review: value }).where(inArray(schema.anomalies.id, list));
  revalidatePath("/anomalies", "layout");
  return { ok: true, count: list.length };
}
