import { redirect } from "next/navigation";

/** L'onglet Consolidation est supprimé : les bons sont consolidés par l'export automatique du soir */
export default function Moved() {
  redirect("/receptions/fiches");
}
