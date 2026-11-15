import { getDict } from "@/lib/i18n/server";
import { SubTabs } from "@/components/SubTabs";

export default async function RegulationLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getDict();
  return (
    <>
      <SubTabs
        tabs={[
          { href: "/settings/reglementation", label: t.protocols.thresholds, exact: true },
          { href: "/settings/reglementation/conformite", label: t.settings.conformity },
        ]}
      />
      <div className="space-y-6">{children}</div>
    </>
  );
}
