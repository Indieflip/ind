import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

/** Ancien lien d'un bon de reprise : le bon est maintenant une fiche (sorte « reprise ») */
export default async function ReturnSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const rec = await getDb().query.receptions.findFirst({ where: eq(schema.receptions.clientUuid, `br-slip-${id}`), columns: { id: true } });
  if (!rec) notFound();
  redirect(`/receptions/${rec.id}`);
}
