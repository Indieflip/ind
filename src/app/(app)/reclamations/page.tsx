import { redirect } from "next/navigation";
import type { SP } from "@/lib/server/queries";

/** Ancienne adresse : les réclamations sont maintenant un onglet du menu Anomalies */
export default async function OldClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])));
  redirect(`/anomalies/reclamations${q.size ? `?${q}` : ""}`);
}
