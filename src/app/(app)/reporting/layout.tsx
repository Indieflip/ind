import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { SubTabs } from "@/components/SubTabs";

export default async function ReportingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getDict();
  const tabs = [
    { href: "/reporting", label: t.reporting.title, exact: true },
    ...(can.viewAnomalies(user.role) ? [{ href: "/reporting/economies", label: t.savings.title }] : []),
    ...(can.viewPrices(user.role) ? [{ href: "/reporting/prix", label: t.prices.title }] : []),
  ];
  return (
    <>
      <SubTabs tabs={tabs} />
      {children}
    </>
  );
}
