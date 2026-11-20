import "server-only";
import { getSetting } from "@/lib/settings";
import { WEIGH_TYPE } from "@/lib/anomaly";

/** Liste des types de problème : celle enregistrée, sinon les types d'anomalie de l'application */
export async function problemTypes(defaults: string[]) {
  try {
    const v = JSON.parse((await getSetting("anomaly_problem_types")) ?? "null");
    if (Array.isArray(v) && v.length) return v.filter((x): x is string => typeof x === "string");
  } catch { /* liste par défaut */ }
  return defaults.includes(WEIGH_TYPE) ? defaults : [...defaults, WEIGH_TYPE];
}
