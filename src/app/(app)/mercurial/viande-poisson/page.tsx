import { redirect } from "next/navigation";

/** Ancienne adresse : Viandes et poissons est maintenant dans Reporting */
export default function OldMeatFish() {
  redirect("/reporting/viande-poisson");
}
