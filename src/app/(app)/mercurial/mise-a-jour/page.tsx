import { redirect } from "next/navigation";

/** L'historique des modifications du Mercurial est dans la fiche de chaque produit */
export default function OldMajPage() {
  redirect("/mercurial");
}
