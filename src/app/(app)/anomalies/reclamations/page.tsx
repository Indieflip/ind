import { redirect } from "next/navigation";
import type { SP } from "@/lib/server/queries";

/** Ancienne adresse : les réclamations ont maintenant leur propre menu */
export default async function OldClaimsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])));
  redirect(`/reclamations${q.size ? `?${q}` : ""}`);
}
