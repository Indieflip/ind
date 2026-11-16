import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_FOLLOW_UP_DAYS } from "@/lib/anomaly";
import { supplierMatcher } from "./maj";

export interface SupplierProcess { name: string; text: string; delay: number }

/**
 * Procédure de réclamation de chaque fournisseur (protocole « Process de réclamation ») et délai de relance :
 * « le jour même » / « dans la journée » → 1 jour, « 48h » → 2 jours, sinon 3 jours.
 */
export async function supplierProcesses() {
  const [p] = await getDb().select().from(schema.protocols).where(sql`lower(${schema.protocols.title}) = lower('Process de réclamation')`).limit(1);
  const m = await supplierMatcher();
  const bySupplier = new Map<number, SupplierProcess>();
  if (!p) return { bySupplier, find: () => undefined as SupplierProcess | undefined };
  const sections = p.content.split(/\n(?=## )/).filter((x) => x.startsWith("## "));
  const list: SupplierProcess[] = [];
  for (const sec of sections) {
    const [head, ...body] = sec.split("\n");
    const name = head.replace(/^##\s*/, "").trim();
    const text = body.join("\n").trim();
    const plain = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const delay = /jour meme|dans la journee|le jour/.test(plain) ? 1 : /48 ?h/.test(plain) ? 2 : DEFAULT_FOLLOW_UP_DAYS;
    const item = { name, text, delay };
    list.push(item);
    const id = m.find(name);
    if (id && !bySupplier.has(id)) bySupplier.set(id, item);
  }
  const find = (supplierId: number | null, supplierName: string) => (supplierId ? bySupplier.get(supplierId) : undefined) ?? list.find((x) => m.find(x.name) === m.find(supplierName) && m.find(supplierName) != null);
  return { bySupplier, find };
}
