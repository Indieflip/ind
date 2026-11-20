/** Ligne de l'historique du Mercurial qui marque la création d'un compte fournisseur (« Rajout fournisseur », « Rajout prestataire », « Nouveau fournisseur ») */
export function isSupplierCreation(...texts: (string | null | undefined)[]) {
  const t = texts.filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(rajout|ajout|nouveau|nouvel)\s+(fournisseur|prestataire)/.test(t);
}

/** Ligne d'information sur un fournisseur (« Informations complémentaires prestataires ») : pas un produit */
export function isSupplierInfo(...texts: (string | null | undefined)[]) {
  const t = texts.filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /informations? complementaires? (prestataires?|fournisseurs?)/.test(t);
}
