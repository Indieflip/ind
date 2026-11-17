import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { SubTabs } from "@/components/SubTabs";
import { PageHeader } from "@/components/ui";

/** Réglages : réservé au profil administrateur */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser((r) => r === "admin");
  const { t } = await getDict();
  const s = t.settings;
  return (
    <>
      <PageHeader title={s.title} />
      <SubTabs
        tabs={[
          { href: "/settings", label: s.tabCompany, exact: true },
          { href: "/settings/utilisateurs", label: s.tabUsers },
          { href: "/settings/import-export", label: s.tabImportExport },
        ]}
      />
      <div className="space-y-6">{children}</div>
    </>
  );
}
