// Profils et droits (onglet « Droits utilisateurs » du fichier).
// Les droits sont modifiables par l'administrateur dans Réglages > Droits utilisateurs ;
// la matrice est chargée depuis la base à chaque requête (voir loadRights dans auth.ts).
export type Role = "admin" | "econome" | "comptable" | "invite";
export const PROFILES: Role[] = ["admin", "econome", "comptable", "invite"];
type Others = Exclude<Role, "admin">;

export const RIGHTS = [
  // Réceptions
  { key: "createReception", tab: "receptions", defaults: { econome: true, comptable: false, invite: true } },
  { key: "editReception", tab: "receptions", defaults: { econome: true, comptable: false, invite: true } },
  { key: "deleteReception", tab: "receptions", defaults: { econome: true, comptable: false, invite: true } },
  { key: "addNote", tab: "receptions", defaults: { econome: true, comptable: false, invite: true } },
  { key: "consolidate", tab: "consolidation", defaults: { econome: false, comptable: false, invite: false } },
  // Anomalies
  { key: "createAnomaly", tab: "anomalies", defaults: { econome: true, comptable: false, invite: true } },
  { key: "manageAnomalies", tab: "anomalies", defaults: { econome: false, comptable: false, invite: false } },
  // Mercurial
  { key: "importFile", tab: "mercurial", defaults: { econome: false, comptable: false, invite: false } },
  { key: "editMercurial", tab: "mercurial", defaults: { econome: false, comptable: false, invite: false } },
  { key: "createSupplier", tab: "mercurial", defaults: { econome: true, comptable: true, invite: true } },
  { key: "deleteSupplier", tab: "mercurial", defaults: { econome: false, comptable: false, invite: false } },
  { key: "editFv", tab: "fruitsVeg", defaults: { econome: false, comptable: false, invite: false } },
  { key: "editPrices", tab: "prices", defaults: { econome: false, comptable: false, invite: false } },
  // Consultation
  { key: "viewPrices", tab: "prices", defaults: { econome: true, comptable: true, invite: true } },
  // Protocoles
  { key: "editProtocols", tab: "protocols", defaults: { econome: false, comptable: false, invite: false } },
  // Réglages
  { key: "manageUsers", tab: "settings", defaults: { econome: false, comptable: false, invite: false } },
  { key: "manageRights", tab: "settings", defaults: { econome: false, comptable: false, invite: false } },
  { key: "backup", tab: "settings", defaults: { econome: false, comptable: false, invite: false } },
] as const;

export type RightKey = (typeof RIGHTS)[number]["key"];
export type RightsMatrix = Record<RightKey, Record<Others, boolean>>;

export function defaultMatrix(): RightsMatrix {
  return Object.fromEntries(RIGHTS.map((r) => [r.key, { ...r.defaults }])) as RightsMatrix;
}

export function mergeMatrix(stored: unknown): RightsMatrix {
  const m = defaultMatrix();
  if (stored && typeof stored === "object") {
    for (const r of RIGHTS) {
      const v = (stored as Record<string, Record<string, unknown>>)[r.key];
      if (v) for (const p of ["econome", "comptable", "invite"] as Others[]) if (typeof v[p] === "boolean") m[r.key][p] = v[p] as boolean;
    }
  }
  return m;
}

// Matrice courante (identique pour tous les utilisateurs, rechargée à chaque requête authentifiée)
let matrix: RightsMatrix = defaultMatrix();
export function setCurrentMatrix(m: RightsMatrix) {
  matrix = m;
}

export function has(role: Role, key: RightKey) {
  if (role === "admin") return true;
  return !!matrix[key]?.[role];
}

const all = (_r: Role) => true;

/** Vérifications utilisées dans les pages et actions */
export const can = {
  receive: (r: Role) => has(r, "createReception"),
  viewReceptions: all,
  editReception: (r: Role) => has(r, "editReception"),
  deleteDraftReception: (r: Role) => has(r, "deleteReception"),
  addNote: (r: Role) => has(r, "addNote"),
  consolidate: (r: Role) => has(r, "consolidate"),
  viewConsolidation: all,
  createAnomaly: (r: Role) => has(r, "createAnomaly"),
  viewAnomalies: all,
  manageAnomalies: (r: Role) => has(r, "manageAnomalies"),
  viewMercurial: all,
  viewSuppliers: all,
  editMercurial: (r: Role) => has(r, "editMercurial"),
  editSuppliers: (r: Role) => has(r, "editMercurial"),
  createSupplier: (r: Role) => has(r, "createSupplier"),
  /** Supprimer un fournisseur : administrateur seulement par défaut */
  deleteSupplier: (r: Role) => has(r, "deleteSupplier"),
  importFile: (r: Role) => has(r, "importFile"),
  viewFv: all,
  editFv: (r: Role) => has(r, "editFv"),
  viewPrices: (r: Role) => has(r, "viewPrices"),
  editPrices: (r: Role) => has(r, "editPrices"),
  viewReporting: all,
  viewProtocols: all,
  editProtocols: (r: Role) => has(r, "editProtocols"),
  /** Le menu Réglages est réservé à l'administrateur */
  manageSettings: (r: Role) => r === "admin",
  manageUsers: (r: Role) => has(r, "manageUsers"),
  manageRights: (r: Role) => has(r, "manageRights"),
  backup: (r: Role) => has(r, "backup"),
};
