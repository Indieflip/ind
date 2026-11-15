import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MajLog } from "./MajLog";

/** Mercurial > Mise à jour Mercurial : historique des modifications (ex-« Suivi MAJ ») */
export default async function MercurialUpdatesPage() {
  const user = await requireUser(can.viewMercurial);
  const rows = await getDb().select().from(schema.majLog).orderBy(asc(schema.majLog.position));
  return (
    <MajLog
      rows={rows.map((r) => ({ id: r.id, date: r.date, nature: r.nature, item: r.item, detail: r.detail, reference: r.reference, claim: r.claim }))}
      editable={can.editPrices(user.role)}
    />
  );
}
