import Link from "next/link";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtMoney } from "@/lib/format";
import { daysSince, DEFAULT_FOLLOW_UP_DAYS, isClaimMode, stageOf, verificationDue } from "@/lib/anomaly";
import { backupSettings, lastBackup } from "@/lib/server/backup";
import { supplierProcesses } from "@/lib/server/followup";
import { canSeeDev } from "@/lib/server/dev";
import { backfillSheets, canValidateSheets, sheetsAwaitingValidation } from "@/lib/server/sheets";
import { Icon } from "@/components/Icon";

interface Task { key: string; label: string; detail?: string; count?: number; href: string; tone: "red" | "amber" | "sky" | "stone"; icon: string }

/** Accueil : tout ce qui attend une action (anomalies, réclamations, clôtures, sauvegarde, demandes…) */
export default async function HomePage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const h = t.home;
  const r = user.role;
  const db = getDb();
  const a = schema.anomalies;
  const tasks: Task[] = [];
  const money = (n: number) => fmtMoney(n, locale);

  // Réceptions : brouillons en cours, bons à consolider
  if (can.receive(r)) {
    const [d] = await db.select({ n: count() }).from(schema.receptionDrafts);
    if (d.n) tasks.push({ key: "drafts", label: h.drafts, count: d.n, href: "/receptions", tone: "amber", icon: "truck" });
  }
  if (can.consolidate(r)) {
    const [c] = await db.select({ n: count() }).from(schema.receptions).where(isNull(schema.receptions.consolidatedAt));
    if (c.n) tasks.push({ key: "toConsolidate", label: h.receptionsToConsolidate, count: c.n, href: "/consolidation", tone: "stone", icon: "layers" });
  }

  // Anomalies et réclamations
  if (can.viewAnomalies(r)) {
    const open = await db.select().from(a).where(and(isNull(a.consolidatedAt), or(eq(a.stage, "a_traiter"), eq(a.stage, "reclamee"), eq(a.stage, "a_verifier"))));
    const processes = await supplierProcesses();
    const now = new Date();
    const todo = open.filter((x) => stageOf(x.stage) === "a_traiter");
    const late = open.filter((x) => stageOf(x.stage) !== "a_traiter" && isClaimMode(x.mode) && daysSince(x.lastActionAt, x.createdAt, now) >= (processes.find(x.supplierId, x.supplierName)?.delay ?? DEFAULT_FOLLOW_UP_DAYS));
    const toCheck = open.filter((x) => stageOf(x.stage) === "a_verifier");
    const noAmount = open.filter((x) => x.claimedAmount == null);
    const verify = open.filter((x) => verificationDue(x.stage, x.mode, daysSince(x.lastActionAt, x.createdAt, now)));
    const sum = (xs: typeof open) => xs.reduce((s, x) => s + Number(x.claimedAmount ?? 0), 0);
    if (late.length) tasks.push({ key: "late", label: h.late, detail: money(sum(late)), count: late.length, href: "/anomalies", tone: "red", icon: "alert" });
    if (todo.length) tasks.push({ key: "todo", label: h.anomaliesTodo, detail: money(sum(todo)), count: todo.length, href: "/anomalies", tone: "red", icon: "alert" });
    if (toCheck.length) tasks.push({ key: "check", label: h.toCheck, detail: money(sum(toCheck)), count: toCheck.length, href: "/anomalies/reclamations", tone: "sky", icon: "search" });
    if (verify.length) tasks.push({ key: "verify", label: h.verifyDue, detail: money(sum(verify)), count: verify.length, href: "/anomalies", tone: "sky", icon: "search" });
    if (noAmount.length) tasks.push({ key: "noAmount", label: h.noAmount, count: noAmount.length, href: "/anomalies/reclamations?f=sans-montant", tone: "amber", icon: "euro" });
    const [credits] = await db.select({ n: count() }).from(a).where(and(eq(a.stage, "cloturee"), eq(a.resolution, "avoir"), isNull(a.creditAmount)));
    if (credits.n) tasks.push({ key: "creditMissing", label: h.creditMissing, count: credits.n, href: "/anomalies/reclamations", tone: "amber", icon: "euro" });
  }

  // Fiche de réception de marchandises : au moins une par jour, validée par un responsable désigné
  await backfillSheets();
  if (await canValidateSheets(user)) {
    const n = await sheetsAwaitingValidation();
    if (n) tasks.push({ key: "sheetValidate", label: t.rsheet.toValidate, count: n, href: "/receptions/fiches", tone: "amber", icon: "check" });
  }

  // Sauvegarde
  if (can.backup(r)) {
    const [last, bs] = await Promise.all([lastBackup(), backupSettings()]);
    const d = last ? Math.floor((Date.now() - last.createdAt.getTime()) / 86_400_000) : null;
    if (d == null || d >= bs.frequencyDays) tasks.push({ key: "backup", label: h.backup, detail: d == null ? h.never : `${h.lastOne} ${d} ${t.kanban.days}`, href: "/settings/import-export#sauvegarde", tone: "sky", icon: "download" });
  }

  // Demandes à l'administrateur
  if (r === "admin") {
    const [q] = await db.select({ n: count() }).from(schema.adminRequests).where(eq(schema.adminRequests.status, "open"));
    if (q.n) tasks.push({ key: "requests", label: h.requests, count: q.n, href: "/demandes", tone: "sky", icon: "inbox" });
  }

  // Mercurial : produits sans unité
  if (can.editMercurial(r)) {
    const [u] = await db.select({ n: count() }).from(schema.products).where(and(eq(schema.products.active, true), sql`coalesce(${schema.products.unit}, '') = ''`));
    if (u.n) tasks.push({ key: "units", label: h.noUnit, count: u.n, href: "/mercurial", tone: "stone", icon: "list" });
  }

  // Dev : points en attente prioritaires
  if (await canSeeDev(user)) {
    const [p] = await db.select({ n: count() }).from(schema.devItems).where(and(eq(schema.devItems.kind, "pending"), eq(schema.devItems.priority, "haute")));
    if (p.n) tasks.push({ key: "dev", label: h.devHigh, count: p.n, href: "/dev", tone: "stone", icon: "sparkle" });
  }

  const tones: Record<Task["tone"], string> = {
    red: "border-l-red-500 bg-red-50/50",
    amber: "border-l-amber-400 bg-amber-50/50",
    sky: "border-l-sky-400 bg-sky-50/50",
    stone: "border-l-stone-300 bg-white",
  };
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", timeZone: "Europe/Paris" }).format(new Date()));
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{hour < 18 ? h.hello : h.evening} {user.name.split(" ")[0]}</h1>
      <p className="mb-5 text-sm text-stone-600">{tasks.length ? `${tasks.length} ${h.waiting}` : h.allGood}</p>
      {tasks.length === 0 ? (
        <div className="card flex items-center gap-3 p-6 text-emerald-800"><Icon name="check" className="h-6 w-6" /> {h.allGoodLong}</div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tasks.map((x) => (
            <li key={x.key}>
              <Link href={x.href} className={`card flex items-center gap-3 border-l-4 p-4 transition hover:shadow-md ${tones[x.tone]}`}>
                <Icon name={x.icon} className="h-6 w-6 shrink-0 text-stone-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{x.label}</p>
                  {x.detail && <p className="text-sm text-stone-600">{x.detail}</p>}
                </div>
                {x.count != null && <span className="text-2xl font-bold tabular-nums">{x.count}</span>}
                <span className="text-stone-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {can.receive(r) && <Link href="/receptions/new?new=1" className="btn-primary"><Icon name="plus" className="h-4 w-4" /> {t.receptions.new}</Link>}
        <Link href="/anomalies" className="btn-secondary">{t.nav.anomalies}</Link>
        <Link href="/reporting/economies" className="btn-secondary">{t.savings.title}</Link>
      </div>
    </>
  );
}
