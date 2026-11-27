import { redirect } from "next/navigation";

/** Bon de reprise / retour : même formulaire qu'une livraison (fiche de réception de sorte « reprise ») */
export default async function NewReturnSlipPage({ searchParams }: { searchParams: Promise<{ reception?: string }> }) {
  const origin = Number((await searchParams).reception) || null;
  redirect(`/receptions/new?kind=reprise${origin ? `&new=1&origin=${origin}` : ""}`);
}
