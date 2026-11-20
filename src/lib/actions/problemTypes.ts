"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { setSetting } from "@/lib/settings";

/**
 * Types de problème des fiches d'anomalie (liste modifiable) : enregistre la liste ;
 * un type renommé est renommé aussi dans les fiches qui l'utilisent.
 */
export async function saveProblemTypesAction(list: string[], renames: { from: string; to: string }[] = []) {
  await assertUser(can.manageAnomalies);
  const clean = [...new Set(list.map((x) => x.trim()).filter(Boolean))].slice(0, 100);
  await setSetting("anomaly_problem_types", JSON.stringify(clean));
  for (const r of renames) {
    if (r.from.trim() && r.to.trim() && r.from !== r.to) await getDb().update(schema.anomalies).set({ problemType: r.to.trim() }).where(eq(schema.anomalies.problemType, r.from));
  }
  revalidatePath("/anomalies", "layout");
  return { ok: true, list: clean };
}
