import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { loadAnomalies, savingsOf } from "@/lib/server/savings";
import { isClaimMode } from "@/lib/anomaly";
import { PROJECT_TEMPLATE } from "./projectTemplate";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { canSeeDev } from "@/lib/server/dev";
import { PageHeader } from "@/components/ui";
import { DevBoard } from "./DevClient";
import { one, type SP } from "@/lib/server/queries";
import { isMarketStudy } from "@/lib/protocols";
import { COMPETITORS, type Competitor } from "./competitors";

/** Onglet Dev : objectifs de l'application, points en attente, idées, réalisé — tout est modifiable */
export default async function DevPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!(await canSeeDev(user))) notFound();
  const { t, locale } = await getDict();
  const items = await getDb().select().from(schema.devItems).orderBy(asc(schema.devItems.position), asc(schema.devItems.id));
  const reserved = !!(await getSetting("dev_users"));
  const raw = one((await searchParams).tab) ?? "pending";
  const tab = raw === "rules" ? "fields" : raw; // l'ancien onglet Règles est réparti dans Développement
  const fieldsTab = tab === "fields" ? await characteristics() : null;
  const project = tab === "project" ? await projectData(locale) : undefined;
  // Comparatif des concurrents : version modifiée dans l'application, sinon celle du tableau « Appli »
  const competitors = tab === "project" ? await loadCompetitors() : undefined;
  // Développement commercial > Marché : la procédure « Étude de marché » (rédigée par l'équipe) s'affiche ici
  const study = tab === "project" ? (await getDb().select({ id: schema.protocols.id, title: schema.protocols.title, content: schema.protocols.content }).from(schema.protocols)).find((p) => isMarketStudy(p.title)) ?? null : undefined;
  return (
    <>
      <PageHeader title={t.dev.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.dev.intro}</p>
      <DevBoard
        reserved={reserved}
        tab={tab}
        fields={fieldsTab?.fields}
        points={fieldsTab?.points}
        project={project}
        study={study}
        competitors={competitors}
        items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, detail: i.detail ?? "", owner: i.owner ?? "", priority: i.priority ?? "", task: i.task ?? "", updated: fmtDateTime(i.updatedAt, locale), updatedSort: i.updatedAt.toISOString() }))}
      />
    </>
  );
}

/** Dev > Développement : champs des fiches */
async function characteristics() {
  const fields = await getDb().select().from(schema.devFields).orderBy(asc(schema.devFields.position), asc(schema.devFields.id));
  let points: Record<string, string> = {};
  try { points = JSON.parse((await getSetting("dev_char_points")) ?? "{}") ?? {}; } catch { points = {}; }
  return { points, fields: fields.map((f) => ({ id: f.id, form: f.form, section: f.section ?? "", field: f.field, required: f.required, rule: f.rule ?? "", message: f.message ?? "", position: f.position })) };
}

/** Dev > Projet : document, hypothèses de coût et chiffres clés calculés en direct */
async function projectData(locale: string) {
  const db = getDb();
  const [doc, roiRaw, anomalies, counts] = await Promise.all([
    getSetting("dev_project_doc"),
    getSetting("dev_project_roi"),
    loadAnomalies(),
    db.execute<{ first: string | null; receptions: number; lines: number; prices: number; sheets: number; users: number }>(sql`
      select least((select min(delivered_at) from receptions), (select min(created_at) from anomalies))::text as first,
        (select count(*)::int from receptions) as receptions,
        (select count(*)::int from reception_lines) as lines,
        (select count(*)::int from price_changes where type <> 'new_product') as prices,
        (select count(distinct sheet_id)::int from reception_sheet_versions where status = 'validated') as sheets,
        (select count(*)::int from users where active) as users`),
  ]);
  const c = counts.rows[0];
  const sv = savingsOf(anomalies);
  const first = c.first ? new Date(c.first) : null;
  const months = first ? Math.max(1, Math.round(((Date.now() - first.getTime()) / 86_400_000 / 30.44) * 10) / 10) : 1;
  const roi = { monthlyCost: 0, hoursPerWeek: 3, hourlyRate: 20, sites: 1, ...(roiRaw ? JSON.parse(roiRaw) : {}) };
  return {
    doc: doc ?? PROJECT_TEMPLATE,
    roi,
    kpis: {
      since: first ? fmtDate(first, locale) : null, months, receptions: c.receptions, lines: c.lines,
      anomalies: anomalies.filter((a) => !a.informative).length, claims: anomalies.filter((a) => isClaimMode(a.mode)).length,
      obtained: sv.obtained, pending: sv.pending.amount, rate: sv.rate, priceChanges: c.prices, sheets: c.sheets, users: c.users,
    },
  };
}

async function loadCompetitors(): Promise<Competitor[]> {
  try {
    const v = JSON.parse((await getSetting("dev_competitors")) ?? "null");
    if (Array.isArray(v)) return v as Competitor[];
  } catch { /* liste d'origine */ }
  return COMPETITORS;
}
