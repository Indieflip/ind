import { redirect } from "next/navigation";

/** Les demandes sont désormais un onglet de l'Accueil */
export default function Moved() {
  redirect("/accueil/demandes");
}
