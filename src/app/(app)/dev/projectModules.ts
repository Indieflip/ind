/**
 * Dev > Développement commercial > Projet : modules de l'application.
 * Mis à jour à chaque évolution (voir CLAUDE.md), comme le schéma de l'application.
 */
export const MODULES_LIVE: { icon: string; title: string; items: string[] }[] = [
  { icon: "truck", title: "Réception guidée", items: ["Photo du BL lue automatiquement", "Signatures livreur et réceptionnaire", "T°, DLC, lot ; photo d'étiquette obligatoire (viandes, poissons, surgelés)", "Décision Acceptée / Refus proposée", "Brouillon automatique, hors ligne"] },
  { icon: "alert", title: "Anomalies", items: ["Créées automatiquement (refus, manque, T°, DLC, prix)", "Écarts de pesée avec tares", "Une fiche par anomalie, avec son historique"] },
  { icon: "inbox", title: "Réclamations", items: ["Relances au délai de chaque fournisseur", "Avoirs et régularisations vérifiés", "Rappels sur l'Accueil"] },
  { icon: "chart", title: "Économies et Reporting", items: ["Économies justifiées, par fournisseur et par mois", "Suivi des prix", "Viandes et poissons"] },
  { icon: "list", title: "Mercurial", items: ["Fiche produit : prix, anomalies, modifications, réceptions", "Prix bloqués, fruits et légumes au prix du mois, boulangerie", "Comptes fournisseurs et process de réclamation"] },
  { icon: "file", title: "Fiche de réception (DDPP)", items: ["Exportée chaque soir à 23 h, PDF et Excel", "Figée, N° annuel, archivée 5 ans", "Export manuel à la demande"] },
  { icon: "book", title: "Procédures", items: ["Réception (contrôles, refus, pesée, conformité)", "Réclamation", "Réglementation"] },
  { icon: "gear", title: "Administration", items: ["Rôles et droits", "Sauvegardes automatiques", "Demandes à l'administrateur"] },
];

export type ModuleTodo = { icon: string; title: string; why: string; what: string[]; priority: "haute" | "moyenne" | "basse"; effort: "S" | "M" | "L" };

/** Modules importants à ajouter, du plus prioritaire au moins prioritaire */
export const MODULES_TODO: ModuleTodo[] = [
  { icon: "list", title: "Commandes fournisseurs", priority: "haute", effort: "M", why: "Boucler la chaîne commandé → livré → facturé ; argument n° 1 face aux concurrents.", what: ["Commande depuis le Mercurial, envoi par mail", "Lignes pré-remplies à la réception", "Écart commandé / livré automatique"] },
  { icon: "file", title: "Factures et rapprochement", priority: "haute", effort: "L", why: "Facturation électronique obligatoire en réception pour toutes les entreprises depuis septembre 2026.", what: ["Import des factures électroniques", "Rapprochement BL / facture / commande", "Avoirs détectés automatiquement"] },
  { icon: "layers", title: "Plusieurs établissements", priority: "haute", effort: "L", why: "Prérequis pour vendre l'application à d'autres restaurants et aux groupes.", what: ["Comptes séparés par client", "Paramétrage par établissement", "Tableau de bord groupe"] },
  { icon: "box", title: "Inventaire", priority: "moyenne", effort: "M", why: "Valoriser le stock et mesurer le coût matière réel.", what: ["Comptage sur téléphone par zone", "Valorisation au prix du Mercurial", "Écart avec l'inventaire précédent"] },
  { icon: "thermo", title: "Relevés de températures (HACCP complet)", priority: "moyenne", effort: "S", why: "Couvrir tout le plan de maîtrise sanitaire, pas seulement la réception.", what: ["Chambres froides et vitrines", "Alertes hors seuil", "Export pour la DDPP"] },
  { icon: "search", title: "Rappels de produits (traçabilité aval)", priority: "moyenne", effort: "S", why: "Retrouver en un clic les lots concernés par une alerte RappelConso.", what: ["Recherche par lot et DLC", "Liste des réceptions concernées", "Fiche d'action"] },
  { icon: "camera", title: "Lecture des étiquettes", priority: "moyenne", effort: "S", why: "Moins de saisie : lot, DLC et poids pré-remplis.", what: ["Lecture de la photo d'étiquette", "Pré-remplissage à l'étape 3"] },
  { icon: "euro", title: "Fiches techniques et coût matière", priority: "basse", effort: "L", why: "Calculer le coût d'un plat à partir des prix réels.", what: ["Recettes et grammages", "Coût mis à jour avec le Mercurial", "Marge par plat"] },
  { icon: "chart", title: "Rapport mensuel au gérant", priority: "basse", effort: "S", why: "Rendre visibles chaque mois les économies et les hausses de prix.", what: ["Envoi par mail le 1er du mois", "Économies, fournisseurs à problèmes, hausses"] },
];
