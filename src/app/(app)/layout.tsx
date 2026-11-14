import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { AppNav, type NavItem } from "@/components/AppNav";
import { getRestaurantName } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getDict();
  const r = user.role;
  const items: NavItem[] = [
    { href: "/receptions", label: t.nav.receptions, icon: "truck", show: can.viewReceptions(r) },
    { href: "/anomalies", label: t.nav.anomalies, icon: "alert", show: can.viewAnomalies(r) },
    { href: "/mercurial", label: t.nav.mercurial, icon: "list", show: can.viewMercurial(r) },
    { href: "/consolidation", label: t.nav.consolidation, icon: "layers", show: can.consolidate(r) },
    { href: "/prices", label: t.nav.prices, icon: "euro", show: can.viewPrices(r) },
    { href: "/suppliers", label: t.nav.suppliers, icon: "box", show: can.viewSuppliers(r) },
    { href: "/reporting", label: t.nav.reporting, icon: "chart", show: can.viewReporting(r) },
    { href: "/settings", label: t.nav.settings, icon: "gear", show: can.manageSettings(r) },
  ].filter((i) => i.show) as NavItem[];

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
        {user.role === "viewer" && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">{t.common.readOnly}</div>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
