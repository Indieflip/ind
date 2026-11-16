import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { canSeeDev } from "@/lib/server/dev";
import { PageHeader } from "@/components/ui";
import { DevBoard } from "./DevClient";
import { one, type SP } from "@/lib/server/queries";

/** Onglet Dev : objectifs de l'application, points en attente, idées, réalisé — tout est modifiable */
export default async function DevPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!(await canSeeDev(user))) notFound();
  const { t, locale } = await getDict();
  const items = await getDb().select().from(schema.devItems).orderBy(asc(schema.devItems.position), asc(schema.devItems.id));
  const reserved = !!(await getSetting("dev_users"));
  return (
    <>
      <PageHeader title={t.dev.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.dev.intro}</p>
      <DevBoard
        reserved={reserved}
        tab={one((await searchParams).tab) ?? "pending"}
        items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, detail: i.detail ?? "", owner: i.owner ?? "", priority: i.priority ?? "", updated: fmtDateTime(i.updatedAt, locale), updatedSort: i.updatedAt.toISOString() }))}
      />
    </>
  );
}
