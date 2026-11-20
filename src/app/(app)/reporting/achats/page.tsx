import { redirect } from "next/navigation";
import { one, type SP } from "@/lib/server/queries";

/** Ancienne adresse : les achats par fournisseur sont dans l'onglet Reporting */
export default async function OldPurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const f = one((await searchParams).f);
  redirect(`/reporting${f ? `?af=${encodeURIComponent(f)}` : ""}#achats`);
}
