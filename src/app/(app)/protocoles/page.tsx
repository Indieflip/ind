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
import { CategoryClassSelect, ThresholdsEditor } from "./ThresholdsEditor";
import { ConformityRow } from "../settings/SettingsClient";
import { backupSettings } from "@/lib/server/backup";
import { normalize } from "@/lib/search";
import { num } from "@/lib/format";

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewProtocols);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const categories = await getDb().select().from(schema.categories).orderBy(asc(schema.categories.position));
  // « Seuils de température » fait désormais partie du protocole Conformité
  const showConformity = one(sp.id) === "conformite" || one(sp.id) === "seuils";
  const isAdmin = user.role === "admin";
  const editingConformity = showConformity && isAdmin && one(sp.edit) === "1";
  const [classes, retentionYears] = await Promise.all([
    getDb().select().from(schema.tempClasses).orderBy(asc(schema.tempClasses.position), asc(schema.tempClasses.id)),
    showConformity ? backupSettings().then((b) => b.retentionYears) : Promise.resolve(0),
  ]);
  const deg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), locale, 1)} °C`;
  const list = await getDb()
    .select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content, updatedAt: schema.protocols.updatedAt, by: schema.users.name })
    .from(schema.protocols)
    .leftJoin(schema.users, eq(schema.users.id, schema.protocols.updatedBy))
    .orderBy(asc(schema.protocols.position), asc(schema.protocols.id));
  const editable = can.editProtocols(user.role);
  const creating = one(sp.new) === "1" && editable;
  const editing = one(sp.edit) === "1" && editable;
  const current = creating || showConformity ? null : list.find((p) => String(p.id) === one(sp.id)) ?? list[0];
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
                {isAdmin && (editingConformity
                  ? <Link href="/protocoles?id=conformite" className="btn-primary no-print"><Icon name="check" className="h-4 w-4" /> {t.protocols.doneEditing}</Link>
                  : <Link href="/protocoles?id=conformite&edit=1" className="btn-secondary no-print"><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</Link>)}
              </div>

              <h2 className="mb-1 text-lg font-semibold">{t.protocols.thresholds}</h2>
              <p className="mb-2 text-sm text-stone-600">{t.protocols.thresholdsIntro}</p>
              {editingConformity ? (
                <ThresholdsEditor classes={classes} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>{t.protocols.tempClass}</th><th className="text-center">{t.decision.conform}</th><th className="text-center">{t.decision.reserve}</th><th className="text-center">{t.protocols.refuseProposed}</th></tr></thead>
                    <tbody>
                      {classes.map((k) => (
                        <tr key={k.id}>
                          <td className="font-medium">{k.label}</td>
                          <td className="bg-emerald-50 text-center font-semibold text-emerald-900">≤ {deg(k.maxTemp)}</td>
                          <td className="bg-amber-50 text-center text-amber-900">{k.reserveMax != null ? `${deg(k.maxTemp)} → ${deg(k.reserveMax)}` : "—"}</td>
                          <td className="bg-red-50 text-center text-red-800">&gt; {deg(k.reserveMax ?? k.maxTemp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2 className="mb-1 mt-6 text-lg font-semibold">{t.protocols.byCategory}</h2>
              <p className="mb-2 text-sm text-stone-600">{t.protocols.byCategoryIntro}</p>
              <div className="space-y-4">
                {categories.map((c) => {
                  const k = classes.find((x) => x.id === c.tempClassId);
                  const tempLines = {
                    conform: k ? `${t.protocols.tempLine} ≤ ${deg(k.maxTemp)}` : null,
                    reserve: k && k.reserveMax != null ? `${t.protocols.tempLine} ${deg(k.maxTemp)} → ${deg(k.reserveMax)}` : null,
                    refuse: k ? `${t.protocols.tempLine} > ${deg(k.reserveMax ?? k.maxTemp)}` : null,
                  };
                  return (
                    <section key={c.id} className="rounded-xl border border-stone-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2">
                        <h3 className="font-semibold">{locale === "en" ? c.nameEn : c.nameFr}</h3>
                        {editingConformity ? (
                          <div className="w-full max-w-md"><CategoryClassSelect categoryId={c.id} value={c.tempClassId} classes={classes} /></div>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-stone-600"><Icon name="thermo" className="h-3.5 w-3.5" /> {k ? `${k.label} · ≤ ${deg(k.maxTemp)}` : t.protocols.noReading}</span>
                        )}
                      </div>
                      {editingConformity ? (
                        <table className="table"><tbody><ConformityRow c={{ id: c.id, name: t.protocols.rules, conformRules: c.conformRules ?? "", reserveRules: c.reserveRules ?? "", refuseRules: c.refuseRules ?? "" }} /></tbody></table>
                      ) : (
                        <div className="grid gap-px bg-stone-200 sm:grid-cols-3">
                          {([["conform", c.conformRules, "bg-emerald-50 text-emerald-900"], ["reserve", c.reserveRules, "bg-amber-50 text-amber-900"], ["refuse", c.refuseRules, "bg-red-50 text-red-900"]] as const).map(([d, rules, cls]) => (
                            <div key={d} className={`p-3 ${cls}`}>
                              <p className="mb-1 text-xs font-bold uppercase tracking-wide">{t.decision[d]}</p>
                              <ul className="list-disc space-y-0.5 pl-4 text-sm">
                                {tempLines[d] && <li className="font-semibold">{tempLines[d]}</li>}
                                {(rules ?? "").split(/\r?\n/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              <h2 className="mb-1 mt-6 text-lg font-semibold">{t.protocols.otherRules}</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
                <li>{t.protocols.ruleDlcExpired}</li>
                <li>{t.protocols.ruleDlcShort}</li>
                <li>{t.protocols.ruleQty}</li>
              </ul>
              <h2 className="mb-1 mt-6 text-lg font-semibold">{t.settings.regulationTitle}</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
                <li>{t.settings.regHaccp}</li>
                <li>{t.settings.regTrace}</li>
                <li>{t.settings.regRetention.replace("{years}", String(retentionYears))}</li>
                <li>{t.settings.regRefuse}</li>
              </ul>
              <p className="mt-2 text-xs text-stone-500">{t.settings.regDisclaimer}</p>
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
