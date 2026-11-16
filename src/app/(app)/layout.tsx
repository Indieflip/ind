import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { AppNav, type NavItem } from "@/components/AppNav";
import { Notice } from "@/components/Notice";
import { canSeeDev } from "@/lib/server/dev";
import { getRestaurantName } from "@/lib/settings";
import { backupSettings, lastBackup } from "@/lib/server/backup";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { supplierProcesses } from "@/lib/server/followup";
import { daysSince, DEFAULT_FOLLOW_UP_DAYS } from "@/lib/anomaly";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getDict();
  const r = user.role;
  // Demandes à l'administrateur en attente
  let pendingRequests = 0;
  if (r === "admin") {
    try {
      const [row] = await getDb().select({ n: count() }).from(schema.adminRequests).where(eq(schema.adminRequests.status, "open"));
      pendingRequests = row?.n ?? 0;
    } catch { /* base indisponible */ }
  }
  const devVisible = await canSeeDev(user);
  const items: NavItem[] = [
    { href: "/accueil", label: t.nav.home, icon: "home", show: true },
    { href: "/receptions", label: t.nav.receptions, icon: "truck", show: can.viewReceptions(r) },
    { href: "/mercurial", label: t.nav.mercurial, icon: "list", show: can.viewMercurial(r) },
    { href: "/prices", label: t.nav.prices, icon: "euro", show: can.viewPrices(r) },
    { href: "/anomalies", label: t.nav.anomalies, icon: "alert", show: can.viewAnomalies(r) },
    { href: "/reporting", label: t.nav.reporting, icon: "chart", show: true },
    { href: "/consolidation", label: t.nav.consolidation, icon: "layers", show: can.viewConsolidation(r) },
    { href: "/protocoles", label: t.nav.protocols, icon: "book", show: can.viewProtocols(r) },
    { href: "/demandes", label: t.nav.requests, icon: "inbox", show: true, badge: r === "admin" ? pendingRequests : 0 },
    { href: "/settings", label: t.nav.settings, icon: "gear", show: r === "admin" },
    { href: "/dev", label: t.nav.dev, icon: "sparkle", show: devVisible },
  ].filter((i) => i.show) as NavItem[];

  // Rappel de sauvegarde pour l'administrateur quand l'envoi automatique n'a pas pris le relais
  let backupReminder: string | null = null;
  if (can.backup(r)) {
    const [last, bs] = await Promise.all([lastBackup(), backupSettings()]);
    const days = last ? Math.floor((Date.now() - last.createdAt.getTime()) / 86_400_000) : null;
    if (days == null) backupReminder = t.backup.reminderNever;
    else if (days >= bs.frequencyDays) backupReminder = `${t.backup.reminder} ${days} ${t.backup.daysAgo}.`;
  }

  // Rappel quotidien : réclamations sans nouvelle action depuis le délai du fournisseur (3 jours par défaut)
  let dueAnomalies = 0;
  if (can.manageAnomalies(r)) {
    const a = schema.anomalies;
    try {
      const open = await getDb()
        .select({ id: a.id, supplierId: a.supplierId, supplierName: a.supplierName, lastActionAt: a.lastActionAt, createdAt: a.createdAt })
        .from(a)
        .where(and(isNull(a.consolidatedAt), inArray(a.stage, ["reclamee", "a_verifier"]), ne(a.mode, "verification")));
      if (open.length) {
        const processes = await supplierProcesses();
        const now = new Date();
        dueAnomalies = open.filter((x) => daysSince(x.lastActionAt, x.createdAt, now) >= (processes.find(x.supplierId, x.supplierName)?.delay ?? DEFAULT_FOLLOW_UP_DAYS)).length;
      }
    } catch { /* base indisponible : pas de rappel */ }
  }

  return (
    <div className="min-h-dvh lg:flex">
      <AppNav
        items={items}
        userName={user.name}
        roleLabel={t.roles[user.role]}
        logoutLabel={t.nav.logout}
        restaurant={await getRestaurantName()}
        appName={t.app.name}
        moreLabel={t.nav.more}
        search={{ label: t.search.title, placeholder: t.search.placeholderShort, button: t.search.button }}
      />
      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        {!can.receive(user.role) && (
          <Notice id="readonly" version="1" closeLabel={t.common.close} className="border-amber-200 bg-amber-50 text-amber-900">{t.common.readOnly}</Notice>
        )}
        {backupReminder && (
          <Notice id="backup" version={String(backupReminder)} closeLabel={t.common.close} className="border-sky-200 bg-sky-50 text-sky-900">
            {backupReminder}
            <a href="/settings/import-export#sauvegarde" className="font-semibold underline">{t.backup.reminderLink}</a>
          </Notice>
        )}
        {pendingRequests > 0 && (
          <Notice id="requests" version={pendingRequests} closeLabel={t.common.close} className="border-violet-200 bg-violet-50 text-violet-900">
            <strong>{pendingRequests}</strong> {t.requests.pending}
            <a href="/demandes" className="font-semibold underline">{t.anomalies.reminderLink}</a>
          </Notice>
        )}
        {dueAnomalies > 0 && (
          <Notice id="due" version={dueAnomalies} closeLabel={t.common.close} className="border-red-200 bg-red-50 text-red-900">
            <strong>{dueAnomalies}</strong> {t.kanban.lateBanner}
            <a href="/anomalies" className="font-semibold underline">{t.anomalies.reminderLink}</a>
          </Notice>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
