import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDict } from "@/lib/i18n/server";
import { SubTabs } from "@/components/SubTabs";

export default async function AnomaliesLayout({ children }: { children: React.ReactNode }) {
  await requireUser(can.viewAnomalies);
  const { t } = await getDict();
  return (
    <>
      {/* Onglets : Anomalies | Réclamations (ancien menu Réclamations) */}
      <SubTabs tabs={[{ href: "/anomalies", label: t.anomalies.title, exact: true }, { href: "/anomalies/reclamations", label: t.claims.title }]} />
      {children}
    </>
  );
}
