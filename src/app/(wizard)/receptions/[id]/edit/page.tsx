import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";
import { getDict } from "@/lib/i18n/server";
import { buildReservesText } from "@/components/reception/helpers";
import { EditReception } from "@/components/reception/EditReception";
import { buildEditDraft } from "@/lib/server/editDraft";
import { receptionNumbers } from "@/lib/server/queries";
import { recNo } from "@/lib/numbering";
import type { Draft, DraftLine } from "@/lib/reception-types";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (v == null ? "" : String(num(v) ?? v));

/** Date au format du champ datetime-local, heure de Paris */
function toLocalInput(d: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(d)
    .replace(" ", "T");
}

export default async function EditReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(can.editReception);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const rec = await db.query.receptions.findFirst({ where: eq(schema.receptions.id, id) });
  if (!rec) notFound();
  if (rec.consolidatedAt) redirect(`/receptions/${id}`);
  const { locale } = await getDict();
  const draft = await buildEditDraft(rec, locale);

  // Modification : une seule page simple (Livraison, Produits, Réserves), pas le parcours en étapes
  void user;
  const seq = (await receptionNumbers()).get(id);
  return <EditReception id={id} initialDraft={draft} number={recNo(rec.kind, seq)} />;
}
