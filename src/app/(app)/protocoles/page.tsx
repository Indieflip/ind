import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ProtocolEditor, ProtocolView } from "./ProtocolClient";

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewProtocols);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const list = await getDb()
    .select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content, updatedAt: schema.protocols.updatedAt, by: schema.users.name })
    .from(schema.protocols)
    .leftJoin(schema.users, eq(schema.users.id, schema.protocols.updatedBy))
    .orderBy(asc(schema.protocols.position), asc(schema.protocols.id));
  const editable = can.editProtocols(user.role);
  const creating = one(sp.new) === "1" && editable;
  const editing = one(sp.edit) === "1" && editable;
  const current = creating ? null : list.find((p) => String(p.id) === one(sp.id)) ?? list[0];

  return (
    <>
      <PageHeader title={t.protocols.title}>
        {editable && <Link href="/protocoles?new=1" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> {t.protocols.new}</Link>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav className="no-print card h-fit p-2">
          {list.length === 0 && <p className="p-2 text-sm text-stone-500">{t.protocols.empty}</p>}
          {list.map((p) => (
            <Link key={p.id} href={`/protocoles?id=${p.id}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${current?.id === p.id && !creating ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
              <Icon name="book" className="h-4 w-4" /> {p.title}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {creating ? (
            <ProtocolEditor id={null} title="" content="" />
          ) : current ? (
            editing ? (
              <ProtocolEditor id={current.id} title={current.title} content={current.content} />
            ) : (
              <article className="card p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h1 className="text-2xl font-bold">{current.title}</h1>
                    <p className="text-xs text-stone-500">{t.protocols.updated} {fmtDateTime(current.updatedAt, locale)}{current.by ? ` · ${current.by}` : ""}</p>
                  </div>
                  {editable && <Link href={`/protocoles?id=${current.id}&edit=1`} className="btn-secondary no-print"><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</Link>}
                </div>
                <ProtocolView content={current.content} />
              </article>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
