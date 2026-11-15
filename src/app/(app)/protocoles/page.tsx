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
import { ContainersTable } from "./ContainersTable";
import { normalize } from "@/lib/search";
import { num } from "@/lib/format";

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewProtocols);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const categories = await getDb().select().from(schema.categories).orderBy(asc(schema.categories.position));
  const showThresholds = one(sp.id) === "seuils";
  const showConformity = one(sp.id) === "conformite";
  const list = await getDb()
    .select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content, updatedAt: schema.protocols.updatedAt, by: schema.users.name })
    .from(schema.protocols)
    .leftJoin(schema.users, eq(schema.users.id, schema.protocols.updatedBy))
    .orderBy(asc(schema.protocols.position), asc(schema.protocols.id));
  const editable = can.editProtocols(user.role);
  const creating = one(sp.new) === "1" && editable;
  const editing = one(sp.edit) === "1" && editable;
  const current = creating || showThresholds || showConformity ? null : list.find((p) => String(p.id) === one(sp.id)) ?? list[0];
  // Le protocole « Process pèse » affiche la liste des contenants (tares)
  const isWeighing = !!current && normalize(current.title) === "process pese";
  const containers = isWeighing ? await getDb().select().from(schema.containers).orderBy(asc(schema.containers.position), asc(schema.containers.id)) : [];

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
          <Link href="/protocoles?id=conformite" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${showConformity ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
            <Icon name="check" className="h-4 w-4" /> {t.protocols.conformity}
          </Link>
        </nav>
        <div className="min-w-0">
          {showConformity ? (
            <article className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{t.protocols.conformity}</h1>
                  <p className="text-sm text-stone-600">{t.protocols.conformityIntro}</p>
                </div>
                {can.manageSettings(user.role) && <Link href="/settings/reglementation/conformite" className="btn-secondary no-print"><Icon name="gear" className="h-4 w-4" /> {t.nav.settings}</Link>}
              </div>
              <div className="space-y-4">
                {categories.map((c) => (
                  <section key={c.id} className="rounded-xl border border-stone-200">
                    <h2 className="border-b border-stone-200 bg-stone-50 px-4 py-2 font-semibold">{locale === "en" ? c.nameEn : c.nameFr}</h2>
                    <div className="grid gap-px bg-stone-200 sm:grid-cols-3">
                      {([["conform", c.conformRules, "bg-emerald-50 text-emerald-900"], ["reserve", c.reserveRules, "bg-amber-50 text-amber-900"], ["refuse", c.refuseRules, "bg-red-50 text-red-900"]] as const).map(([d, rules, cls]) => (
                        <div key={d} className={`p-3 ${cls}`}>
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide">{t.decision[d]}</p>
                          <ul className="list-disc space-y-0.5 pl-4 text-sm">
                            {(rules ?? "").split(/\r?\n/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ) : showThresholds ? (
            <article className="card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{t.protocols.thresholds}</h1>
                  <p className="text-sm text-stone-600">{t.protocols.thresholdsIntro}</p>
                </div>
                {can.manageSettings(user.role) && <Link href="/settings/reglementation" className="btn-secondary no-print"><Icon name="gear" className="h-4 w-4" /> {t.nav.settings}</Link>}
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
                {isWeighing && (
                  <ContainersTable
                    editable={editable}
                    rows={containers.map((x) => ({ id: x.id, supplier: x.supplier ?? "", product: x.product ?? "", tare: num(x.tare), container: x.container ?? "" }))}
                  />
                )}
              </article>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
