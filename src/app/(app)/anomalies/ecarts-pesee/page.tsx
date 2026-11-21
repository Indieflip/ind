import { redirect } from "next/navigation";
import { WEIGH_TYPE } from "@/lib/anomaly";

/** Ancien onglet « Écarts pesées » : les écarts sont dans les fiches d'anomalie de type « Écart de pesée » */
export default function OldWeighPage() {
  redirect(`/anomalies?${new URLSearchParams({ view: "liste", type: WEIGH_TYPE })}`);
}
