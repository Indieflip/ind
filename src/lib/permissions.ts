// Matrice des droits — un seul endroit à modifier si besoin.
export type Role = "admin" | "contributor" | "viewer";

export const can = {
  /** Faire / reprendre une réception */
  receive: (r: Role) => r === "admin" || r === "contributor",
  /** Voir l'historique des réceptions */
  viewReceptions: (_r: Role) => true,
  /** Modifier un bon déjà enregistré */
  editReception: (r: Role) => r === "admin" || r === "contributor",
  /** Supprimer un bon non consolidé (erreur de saisie, doublon) */
  deleteDraftReception: (r: Role) => r === "admin" || r === "contributor",
  /** Consolider = valider un bon (il devient non modifiable) */
  consolidate: (r: Role) => r === "admin",
  viewConsolidation: (_r: Role) => true,
  /** Ajouter une note sur un bon consolidé */
  addNote: (r: Role) => r === "admin" || r === "contributor",
  /** Protocoles */
  viewProtocols: (_r: Role) => true,
  editProtocols: (r: Role) => r === "admin",
  /** Fruits et légumes */
  viewFv: (_r: Role) => true,
  editFv: (r: Role) => r === "admin",
  /** Mercurial (fournisseur, produit, unité, prix) */
  viewMercurial: (_r: Role) => true,
  editMercurial: (r: Role) => r === "admin",
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
