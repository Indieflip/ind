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
import { ProtocolNav } from "./ProtocolNav";
import { ClaimProcedure, ConformityFlow, ReceptionProcedure, RegulationProcedure } from "./Procedures";
import { CategoryClassSelect, ThresholdsEditor } from "./ThresholdsEditor";
import { ConformityRow } from "../settings/SettingsClient";
import { backupSettings } from "@/lib/server/backup";
import { RETENTION_YEARS } from "@/lib/server/sheets";
import { normalize } from "@/lib/search";
import { num } from "@/lib/format";

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(can.viewProtocols);
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const categories = await getDb().select().from(schema.categories).orderBy(asc(schema.categories.position));
  // « Seuils de température » fait désormais partie du protocole Conformité
  const showConformity = one(sp.id) === "conformite" || one(sp.id) === "seuils";
  const showProc = one(sp.id) === "proc-reception" ? "reception" : one(sp.id) === "proc-reclamation" ? "reclamation" : one(sp.id) === "proc-reglementation" ? "reglementation" : null;
  const isAdmin = user.role === "admin";
  const editingConformity = showConformity && isAdmin && one(sp.edit) === "1";
  const [classes, retentionYears] = await Promise.all([
    getDb().select().from(schema.tempClasses).orderBy(asc(schema.tempClasses.position), asc(schema.tempClasses.id)),
    showConformity || showProc ? backupSettings().then((b) => b.retentionYears) : Promise.resolve(0),
  ]);
  const deg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), locale, 1)} °C`;
  const list = await getDb()
    .select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content, folder: schema.protocols.folder, updatedAt: schema.protocols.updatedAt, by: schema.users.name })
    .from(schema.protocols)
    .leftJoin(schema.users, eq(schema.users.id, schema.protocols.updatedBy))
    .orderBy(asc(schema.protocols.position), asc(schema.protocols.id));
  const editable = can.editProtocols(user.role);
  // Un protocole « Réglementation(s) » rédigé à la main s'affiche dans la procédure Réglementation (« Vos notes »)
  const isRegulation = (title: string) => /^r[eé]glementations?$/i.test(title.trim());
  const regulationNotes = list.find((x) => isRegulation(x.title));
  const ownList = list.filter((x) => !isRegulation(x.title));
  const creating = one(sp.new) === "1" && editable;
  const editing = one(sp.edit) === "1" && editable;
  // ?titre=… : ouvre un protocole par son titre (liens « Procédure » des pages Réceptions et Anomalies)
  const byTitle = one(sp.titre) ? list.find((p) => p.title.toLowerCase() === one(sp.titre)!.toLowerCase()) : undefined;
  const current = creating || showConformity || showProc ? null : byTitle ?? list.find((p) => String(p.id) === one(sp.id)) ?? ownList[0];
  // Le protocole « Process pèse » affiche la liste des contenants (tares)
  const isWeighing = !!current && normalize(current.title) === "process pese";
  const containers = isWeighing || showProc === "reception" ? await getDb().select().from(schema.containers).orderBy(asc(schema.containers.position), asc(schema.containers.id)) : [];
  const containerRows = containers.map((x) => ({ id: x.id, supplier: x.supplier ?? "", product: x.product ?? "", tare: num(x.tare), container: x.container ?? "" }));

  return (
    <>
      <PageHeader title={t.protocols.title}>
        {editable && <Link href="/protocoles?new=1" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> {t.protocols.new}</Link>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ProtocolNav list={ownList.map((x) => ({ id: x.id, title: x.title }))} currentId={creating || showConformity || showProc ? null : current?.id ?? null} conformity={showConformity} proc={showProc} editable={editable} />
        <div className="min-w-0">
          {showProc === "reception" ? (
            <article className="card p-5 sm:p-8"><ReceptionProcedure containers={containerRows} editable={editable} /></article>
          ) : showProc === "reclamation" ? (
            <article className="card p-5 sm:p-8"><ClaimProcedure /></article>
          ) : showProc === "reglementation" ? (
            <article className="card p-5 sm:p-8">
              <RegulationProcedure retentionYears={RETENTION_YEARS} notes={regulationNotes ? (
                <>
                  <ProtocolView content={regulationNotes.content} />
                  {editable && <Link href={`/protocoles?id=${regulationNotes.id}&edit=1`} className="btn-secondary no-print mt-4"><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</Link>}
                </>
              ) : undefined} />
            </article>
          ) : showConformity ? (
            <article className="card p-5 sm:p-8">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.protocols.conformityProcTitle}</h1>
                  <p className="max-w-2xl text-stone-600">{t.protocols.conformityProcIntro}</p>
                  <p className="text-xs font-medium text-brand-700">{t.devFields.autoUpdated}</p>
                </div>
                {isAdmin && (editingConformity
                  ? <Link href="/protocoles?id=conformite" className="btn-primary no-print"><Icon name="check" className="h-4 w-4" /> {t.protocols.doneEditing}</Link>
                  : <Link href="/protocoles?id=conformite&edit=1" className="btn-secondary no-print"><Icon name="edit" className="h-4 w-4" /> {t.common.edit}</Link>)}
              </div>

              {!editingConformity && <ConformityFlow />}

              <h2 className="mb-1 mt-8 text-lg font-bold">{t.protocols.thresholdsTable}</h2>
              <p className="mb-3 text-sm text-stone-600">{t.protocols.thresholdsTableIntro}</p>
              {editingConformity ? (
                <ThresholdsEditor classes={classes} />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t.protocols.tempClass}</th>
                        <th>{t.protocols.appliedTo}</th>
                        <th className="text-center">{t.wizard.accepted}</th>
                        <th className="text-center">{t.protocols.margin}</th>
                        <th className="text-center">{t.decision.refuse}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classes.map((k) => {
                        const cats = categories.filter((c) => c.tempClassId === k.id).map((c) => (locale === "en" ? c.nameEn : c.nameFr));
                        return (
                          <tr key={k.id} className={cats.length ? "bg-brand-50/40" : ""}>
                            <td className="font-medium">{k.label}</td>
                            <td className="text-sm">{cats.length ? cats.map((c) => <span key={c} className="badge mr-1 bg-brand-100 text-brand-800">{c}</span>) : <span className="text-stone-400">—</span>}</td>
                            <td className="whitespace-nowrap text-center font-semibold text-emerald-800">≤ {deg(k.maxTemp)}</td>
                            <td className="whitespace-nowrap text-center text-sky-800">{k.reserveMax != null ? `+${fmtNum(Math.round((k.reserveMax - k.maxTemp) * 10) / 10, locale, 1)} °C (${t.protocols.upTo} ${deg(k.reserveMax)})` : t.protocols.noMargin}</td>
                            <td className="whitespace-nowrap text-center font-semibold text-red-700">&gt; {deg(k.reserveMax ?? k.maxTemp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <ul className="mt-3 space-y-1 text-xs text-stone-600">
                {t.protocols.marginNotes.map((x, i) => <li key={i}>• {x}</li>)}
                <li>• {t.protocols.noReadingFor} {categories.filter((c) => !c.tempClassId).map((c) => (locale === "en" ? c.nameEn : c.nameFr)).join(", ") || "—"}.</li>
              </ul>

              <h2 className="mb-1 mt-8 text-lg font-bold">{t.protocols.procRef2}</h2>
              <p className="mb-3 text-sm text-stone-600">{t.protocols.byCategoryIntro2}</p>
              <div className="space-y-2">
                {categories.map((c) => (
                  <details key={c.id} open={editingConformity} className="group rounded-xl border border-stone-200 bg-white">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 group-open:rounded-b-none group-open:border-b group-open:border-stone-200">
                      <h3 className="font-semibold"><span className="mr-1 inline-block text-stone-400 transition group-open:rotate-90">▸</span>{locale === "en" ? c.nameEn : c.nameFr}</h3>
                      {editingConformity && <div className="w-full max-w-md"><CategoryClassSelect categoryId={c.id} value={c.tempClassId} classes={classes} /></div>}
                    </summary>
                    {editingConformity ? (
                      <table className="table"><tbody><ConformityRow c={{ id: c.id, name: t.protocols.rules, conformRules: c.conformRules ?? "", reserveRules: c.reserveRules ?? "", refuseRules: c.refuseRules ?? "" }} /></tbody></table>
                    ) : (
                      <div className="grid gap-px bg-stone-200 sm:grid-cols-3">
                        {([["conform", c.conformRules, "bg-emerald-50 text-emerald-900"], ["reserve", c.reserveRules, "bg-sky-50 text-sky-900"], ["refuse", c.refuseRules, "bg-red-50 text-red-900"]] as const).map(([d, rules, cls]) => (
                          <div key={d} className={`p-3 ${cls}`}>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide">{d === "reserve" ? t.protocols.acceptedWithGap : d === "conform" ? t.wizard.accepted : t.decision[d]}</p>
                            <ul className="list-disc space-y-0.5 pl-4 text-sm">
                              {(rules ?? "").split(/\r?\n/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                ))}
              </div>
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
                    rows={containerRows}
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
