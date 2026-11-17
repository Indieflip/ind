import { redirect } from "next/navigation";

/** Ancienne adresse de l'historique */
export default function Moved() {
  redirect("/receptions/fiches");
}
