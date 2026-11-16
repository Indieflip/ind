import { redirect } from "next/navigation";
import { qs } from "@/components/ui";
import type { SP } from "@/lib/server/queries";

/** Ancienne adresse : l'onglet est passé dans Reporting */
export default async function Moved({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  redirect(`/reporting/economies${qs(flat)}`);
}
