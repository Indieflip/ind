import { redirect } from "next/navigation";

/** Ancienne adresse : Viandes et poissons est maintenant dans Reporting */
export default async function OldMeatFishKind({ params }: { params: Promise<{ kind: string }> }) {
  redirect(`/reporting/viande-poisson/${encodeURIComponent((await params).kind)}`);
}
