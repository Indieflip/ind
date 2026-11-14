// Matrice des droits — un seul endroit à modifier si besoin.
export type Role = "admin" | "contributor" | "viewer";

export const can = {
  /** Faire / reprendre une réception */
  receive: (r: Role) => r === "admin" || r === "contributor",
  /** Voir l'historique des réceptions */
  viewReceptions: (_r: Role) => true,
  deleteReception: (r: Role) => r === "admin",
  /** Onglet Suivi des prix */
  viewPrices: (r: Role) => r === "admin" || r === "viewer",
  editPrices: (r: Role) => r === "admin",
  /** Mercurial / fournisseurs */
  viewSuppliers: (_r: Role) => true,
  editSuppliers: (r: Role) => r === "admin",
  /** Anomalies */
  viewAnomalies: (_r: Role) => true,
  createAnomaly: (r: Role) => r === "admin" || r === "contributor",
  manageAnomalies: (r: Role) => r === "admin",
  viewReporting: (r: Role) => r === "admin" || r === "viewer",
  manageSettings: (r: Role) => r === "admin",
};
