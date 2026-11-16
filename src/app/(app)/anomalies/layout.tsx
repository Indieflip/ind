import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { SubTabs } from "@/components/SubTabs";

export default async function AnomaliesLayout({ children }: { children: React.ReactNode }) {
  await requireUser(can.viewAnomalies);
  const { t } = await getDict();
  return (
    <>
      <SubTabs tabs={[{ href: "/anomalies", label: t.anomalies.title, exact: true }, { href: "/anomalies/ecarts-pesee", label: t.weigh.title }, { href: "/anomalies/reclamations", label: t.claims.title }]} />
      {children}
    </>
  );
}
