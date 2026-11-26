import "server-only";
import { getSetting } from "@/lib/settings";
import { WEIGH_TYPE } from "@/lib/anomaly";

/** Liste de mots : toujours rangée de A à Z */
const az = (l: string[]) => [...new Set(l)].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

/** Liste des types de problème : celle enregistrée, sinon les types d'anomalie de l'application */
export async function problemTypes(defaults: string[]) {
  try {
    const v = JSON.parse((await getSetting("anomaly_problem_types")) ?? "null");
    if (Array.isArray(v) && v.length) return az(v.filter((x): x is string => typeof x === "string"));
  } catch { /* liste par défaut */ }
  return az(defaults.includes(WEIGH_TYPE) ? defaults : [...defaults, WEIGH_TYPE]);
}
