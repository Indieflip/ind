import { redirect } from "next/navigation";

/** L'onglet Réglementation a été supprimé : seuils et conformité sont dans le protocole Conformité */
export default function Moved() {
  redirect("/protocoles?id=conformite");
}
