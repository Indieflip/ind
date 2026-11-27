"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { recNo } from "@/lib/numbering";
import { nextSeq } from "@/lib/server/receptions";
import { dictFor } from "@/lib/i18n";

/**
 * Fiche de réception saisie par erreur (c'était un bon de reprise) : devient un bon de reprise BR (même fiche, même formulaire).
 * Produits, informations et fiches d'anomalie gardés ; quantité reprise = Retour / Refus saisis, sinon Q Contrôlée / Q Facturée ;
 * la fiche quitte les livraisons (pesées, suivi viande / poisson, boulangerie). Fiche non consolidée seulement.
 */
export async function convertReceptionToReturnSlipAction(receptionId: number) {
  const user = await assertUser(can.editReception);
  const t = dictFor(user.locale);
  const db = getDb();
  const res = await db.transaction(async (tx) => {
    const rec = await tx.query.receptions.findFirst({ where: eq(schema.receptions.id, receptionId) });
    if (!rec) return { error: "not_found" as const };
    if (rec.consolidatedAt) return { error: "consolidated" as const };
    if (rec.kind === "reprise") return { ok: true as const, id: rec.id, no: "" };
    const seq = await nextSeq(tx, "reprise", rec.deliveredAt);
    const no = recNo("reprise", seq);
    await tx.update(schema.receptions).set({ kind: "reprise", seq, truckTemp: null, vehicleClean: null, updatedBy: user.id, updatedAt: new Date() }).where(eq(schema.receptions.id, rec.id));
    await tx.execute(sql`update reception_lines set
        return_qty = coalesce(return_qty, refuse_qty, qty_received, qty_ordered),
        return_unit = coalesce(nullif(return_unit, ''), nullif(refuse_unit, ''), unit),
        refuse_qty = null, refuse_unit = null, decision = 'conform'
      where reception_id = ${rec.id}`);
    // Plus une livraison : ni pesées, ni suivi viande / poisson, ni boulangerie
    await tx.delete(schema.weighGaps).where(eq(schema.weighGaps.receptionId, rec.id));
    await tx.delete(schema.meatFishEntries).where(eq(schema.meatFishEntries.receptionId, rec.id));
    await tx.delete(schema.bakeryEntries).where(eq(schema.bakeryEntries.receptionId, rec.id));
    // Fiches d'anomalie gardées : note datée ; écart de pesée figé (plus recalculé)
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
    const ddmmyy = `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(2, 4)}`;
    const anomalies = await tx.select().from(schema.anomalies).where(eq(schema.anomalies.receptionId, rec.id));
    for (const a of anomalies) {
      await tx.update(schema.anomalies).set({
        followUp: [a.followUp, `${ddmmyy} : ${t.returnSlip.convertedFollow} ${no}`].filter(Boolean).join("\n"),
        ...(a.source === "weigh" ? { groupKey: null } : {}),
      }).where(eq(schema.anomalies.id, a.id));
    }
    return { ok: true as const, id: rec.id, no };
  });
  revalidatePath("/receptions", "layout");
  revalidatePath("/anomalies", "layout");
  return res;
}
