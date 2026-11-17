// Règles de contrôle automatique (manuel, page 4). Pur : utilisable côté client et serveur.
export type Decision = "conform" | "reserve" | "refuse";

export interface CategoryRule {
  id: number;
  tempRequired: boolean;
  conformMax: number | null;
  reserveMax: number | null;
}

export interface LineInput {
  qtyOrdered?: number | null;
  qtyReceived?: number | null;
  temperature?: number | null;
  dlc?: string | null; // AAAA-MM-JJ
  categoryId?: number | null;
  /** Température du camion (étape 2) : contrôlée pour les produits à température */
  truckTemp?: number | null;
}

export type IssueCode =
  | "temp_missing"
  | "temp_limit"
  | "temp_over"
  | "truck_over"
  | "dlc_expired"
  | "dlc_short"
  | "qty_less"
  | "qty_more";

export interface Evaluation {
  decision: Decision;
  issues: IssueCode[];
  qtyDiff: number | null;
}

function todayISO(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Limite au-delà de laquelle le produit est refusé : seuil + marge acceptable (sinon le seuil lui-même) */
export const tempLimit = (c: { conformMax: number | null; reserveMax: number | null }) => (c.reserveMax ?? c.conformMax);

/**
 * Conformité produit (deux choix : Conforme / Refus) :
 * - Refus proposé si T° produit ou T° camion au-delà du seuil (+ marge acceptable), ou DLC dépassée ;
 * - Conforme sinon. Écart de quantité, DLC courte, T° dans la marge : signalés, sans changer la décision.
 */
export function evaluateLine(line: LineInput, category: CategoryRule | undefined, now = new Date()): Evaluation {
  let decision: Decision = "conform";
  const issues: IssueCode[] = [];

  if (category?.tempRequired && category.conformMax != null) {
    const limit = tempLimit(category)!;
    if (line.temperature == null || Number.isNaN(line.temperature)) {
      issues.push("temp_missing");
    } else if (line.temperature > limit) {
      issues.push("temp_over");
      decision = "refuse";
    } else if (line.temperature > category.conformMax) {
      issues.push("temp_limit");
    }
    if (line.truckTemp != null && !Number.isNaN(line.truckTemp) && line.truckTemp > limit) {
      issues.push("truck_over");
      decision = "refuse";
    }
  }

  if (line.dlc) {
    const today = todayISO(now);
    if (line.dlc < today) {
      issues.push("dlc_expired");
      decision = "refuse";
    } else if (line.dlc <= addDays(today, 2)) {
      issues.push("dlc_short");
    }
  }

  let qtyDiff: number | null = null;
  if (line.qtyOrdered != null && line.qtyReceived != null && !Number.isNaN(line.qtyOrdered) && !Number.isNaN(line.qtyReceived)) {
    qtyDiff = Math.round((line.qtyReceived - line.qtyOrdered) * 1000) / 1000;
    if (qtyDiff < 0) issues.push("qty_less");
    else if (qtyDiff > 0) issues.push("qty_more");
  }

  return { decision, issues, qtyDiff };
}

export function priceDiffPct(price: number | null | undefined, mercurial: number | null | undefined): number | null {
  if (price == null || mercurial == null || mercurial === 0 || Number.isNaN(price)) return null;
  return Math.round(((price - mercurial) / mercurial) * 1000) / 10;
}

export type ReceptionStatus = "conform" | "with_reserves" | "partial_refusal" | "refused";

export function receptionStatus(decisions: Decision[]): ReceptionStatus {
  if (decisions.length === 0) return "conform";
  const refused = decisions.filter((d) => d === "refuse").length;
  if (refused === decisions.length) return "refused";
  if (refused > 0) return "partial_refusal";
  if (decisions.some((d) => d === "reserve")) return "with_reserves";
  return "conform";
}
