import { normalize } from "./search";

/**
 * Déduit la catégorie de contrôle (seuils de température) à partir de la colonne « Nature »
 * du mercurial. « Surgelès » l'emporte (ex. « Surgelès, Poisson » → surgelés).
 */
export function categoryCodeFromNature(nature: string | null | undefined): string | null {
  const n = normalize(nature ?? "");
  if (!n) return null;
  if (n.includes("surgel")) return "frozen";
  if (n.includes("poisson") || n.includes("mer")) return "fish";
  if (n.includes("viande") || n.includes("charcut") || n.includes("volaille")) return "meat";
  if (n.includes("bof") || n.includes("cremerie") || n.includes("fromage") || n.includes("laitier")) return "dairy";
  if (n.includes("traiteur")) return "deli";
  if (n.includes("fruit") || n.includes("legume")) return "produce";
  if (n.includes("boisson")) return "drinks";
  if (n.includes("hygiene") || n.includes("consommable") || n.includes("ustensile")) return "hygiene";
  return "grocery";
}
