import { normalize } from "@/lib/search";

/** La procédure « Étude de marché » est affichée dans Dev > Développement commercial > Marché, pas dans Procédures */
export const isMarketStudy = (title: string) => /^etudes? de marche$/.test(normalize(title).trim());
