import "server-only";
import { eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_FOLLOW_UP_DAYS } from "@/lib/anomaly";
import { getSetting, setSetting } from "@/lib/settings";
import { supplierMatcher } from "./maj";

export interface SupplierProcess { name: string; text: string; delay: number }

const delayOf = (text: string) => {
  const plain = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /jour meme|dans la journee|le jour/.test(plain) ? 1 : /48 ?h/.test(plain) ? 2 : DEFAULT_FOLLOW_UP_DAYS;
};

/** Sections « ## Fournisseur » du protocole « Process de réclamation » */
async function protocolSections() {
  const [p] = await getDb().select().from(schema.protocols).where(sql`lower(${schema.protocols.title}) = lower('Process de réclamation')`).limit(1);
  if (!p) return [];
  return p.content.split(/\n(?=## )/).filter((x) => x.startsWith("## ")).map((sec) => {
    const [head, ...body] = sec.split("\n");
    return { name: head.replace(/^##\s*/, "").trim(), text: body.join("\n").trim() };
  });
}

/**
 * Le process de réclamation de chaque fournisseur est recopié une fois dans son compte (indication modifiable),
 * pour ne jamais passer à côté d'une procédure particulière en traitant les anomalies.
 */
export async function ensureSupplierProcesses() {
  if (await getSetting("supplier_process_v1")) return;
  const m = await supplierMatcher();
  const db = getDb();
  for (const sec of await protocolSections()) {
    const id = m.find(sec.name);
    if (!id) continue;
    const cur = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id), columns: { claimProcess: true } });
    if (!cur?.claimProcess) await db.update(schema.suppliers).set({ claimProcess: sec.text }).where(eq(schema.suppliers.id, id));
  }
  await setSetting("supplier_process_v1", "1");
}

/**
 * Procédure de réclamation et délai de relance d'un fournisseur : celle de son compte en priorité,
 * sinon celle du protocole. « Le jour même » / « dans la journée » → 1 jour, « 48h » → 2 jours, sinon 3 jours.
 */
export async function supplierProcesses() {
  await ensureSupplierProcesses();
  const m = await supplierMatcher();
  const bySupplier = new Map<number, SupplierProcess>();
  const own = await getDb().select({ id: schema.suppliers.id, name: schema.suppliers.name, text: schema.suppliers.claimProcess }).from(schema.suppliers).where(isNotNull(schema.suppliers.claimProcess));
  for (const s of own) if (s.text?.trim()) bySupplier.set(s.id, { name: s.name, text: s.text, delay: delayOf(s.text) });
  const list = (await protocolSections()).map((x) => ({ ...x, delay: delayOf(x.text) }));
  const find = (supplierId: number | null, supplierName: string): SupplierProcess | undefined => {
    if (supplierId && bySupplier.has(supplierId)) return bySupplier.get(supplierId);
    const id = supplierId ?? m.find(supplierName);
    if (id && bySupplier.has(id)) return bySupplier.get(id);
    return id ? list.find((x) => m.find(x.name) === id) : undefined;
  };
  return { bySupplier, find };
}
