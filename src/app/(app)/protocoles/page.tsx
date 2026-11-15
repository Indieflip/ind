import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ProtocolEditor, ProtocolView } from "./ProtocolClient";

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewProtocols);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const categories = await getDb().select().from(schema.categories).orderBy(asc(schema.categories.position));
  const showThresholds = one(sp.id) === "seuils";
  const list = await getDb()
    .select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content, updatedAt: schema.protocols.updatedAt, by: schema.users.name })
    .from(schema.protocols)
    .leftJoin(schema.users, eq(schema.users.id, schema.protocols.updatedBy))
    .orderBy(asc(schema.protocols.position), asc(schema.protocols.id));
  const editable = can.editProtocols(user.role);
  const creating = one(sp.new) === "1" && editable;
  const editing = one(sp.edit) === "1" && editable;
  const current = creating || showThresholds ? null : list.find((p) => String(p.id) === one(sp.id)) ?? list[0];

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
          <Link href="/protocoles?id=seuils" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${showThresholds ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
            <Icon name="thermo" className="h-4 w-4" /> {t.protocols.thresholds}
          </Link>
        </nav>
        <div className="min-w-0">
          {showThresholds ? (
            <article className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{t.protocols.thresholds}</h1>
                  <p className="text-sm text-stone-600">{t.protocols.thresholdsIntro}</p>
                </div>
                {can.manageSettings(user.role) && <Link href="/settings/reglementation#seuils" className="btn-secondary no-print"><Icon name="gear" className="h-4 w-4" /> {t.nav.settings}</Link>}
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>{t.common.category}</th><th className="text-center">{t.decision.conform}</th><th className="text-center">{t.decision.reserve}</th><th className="text-center">{t.protocols.refuseProposed}</th></tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium">{locale === "en" ? c.nameEn : c.nameFr}</td>
                        {c.tempRequired && c.conformMax != null && c.reserveMax != null ? (
                          <>
                            <td className="bg-emerald-50 text-center text-emerald-900">≤ {fmtNum(c.conformMax, locale, 1)} °C</td>
                            <td className="bg-amber-50 text-center text-amber-900">{fmtNum(c.conformMax, locale, 1)} → {fmtNum(c.reserveMax, locale, 1)} °C</td>
                            <td className="bg-red-50 text-center text-red-800">&gt; {fmtNum(c.reserveMax, locale, 1)} °C</td>
                          </>
                        ) : (
                          <td colSpan={3} className="text-center text-stone-500">{t.protocols.noReading}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-stone-700">
                <li>{t.protocols.ruleDlcExpired}</li>
                <li>{t.protocols.ruleDlcShort}</li>
                <li>{t.protocols.ruleQty}</li>
              </ul>
            </article>
          ) : creating ? (
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
