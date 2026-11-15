import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { AppNav, type NavItem } from "@/components/AppNav";
import { getRestaurantName } from "@/lib/settings";
import { backupSettings, lastBackup } from "@/lib/server/backup";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getDict();
  const r = user.role;
  const items: NavItem[] = [
    { href: "/receptions", label: t.nav.receptions, icon: "truck", show: can.viewReceptions(r) },
    { href: "/consolidation", label: t.nav.consolidation, icon: "layers", show: can.viewConsolidation(r) },
    { href: "/anomalies", label: t.nav.anomalies, icon: "alert", show: can.viewAnomalies(r) },
    { href: "/mercurial", label: t.nav.mercurial, icon: "list", show: can.viewMercurial(r) },
    { href: "/prices", label: t.nav.prices, icon: "euro", show: can.viewPrices(r) },
    { href: "/reporting", label: t.nav.reporting, icon: "chart", show: true },
    { href: "/protocoles", label: t.nav.protocols, icon: "book", show: can.viewProtocols(r) },
    { href: "/settings", label: t.nav.settings, icon: "gear", show: r === "admin" },
  ].filter((i) => i.show) as NavItem[];

  // Rappel de sauvegarde pour l'administrateur quand l'envoi automatique n'a pas pris le relais
  let backupReminder: string | null = null;
  if (can.backup(r)) {
    const [last, bs] = await Promise.all([lastBackup(), backupSettings()]);
    const days = last ? Math.floor((Date.now() - last.createdAt.getTime()) / 86_400_000) : null;
    if (days == null) backupReminder = t.backup.reminderNever;
    else if (days >= bs.frequencyDays) backupReminder = `${t.backup.reminder} ${days} ${t.backup.daysAgo}.`;
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
      />
      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        {!can.receive(user.role) && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">{t.common.readOnly}</div>
        )}
        {backupReminder && (
          <div className="no-print flex flex-wrap items-center justify-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-900">
            {backupReminder}
            <a href="/settings/import-export#sauvegarde" className="font-semibold underline">{t.backup.reminderLink}</a>
          </div>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
