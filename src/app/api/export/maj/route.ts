import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dictFor } from "@/lib/i18n";
import { csvResponse } from "@/lib/format";

export async function GET() {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const m = dictFor(user.locale).maj;
  const rows = await getDb().select().from(schema.majLog).orderBy(asc(schema.majLog.position));
  const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
  return csvResponse("suivi-maj.csv", [[m.date, m.nature, m.item, m.detail, m.reference, m.claim], ...rows.map((r) => [fmt(r.date), r.nature, r.item, r.detail, r.reference, r.claim])]);
}
