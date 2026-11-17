import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { SubTabs } from "@/components/SubTabs";

/** Accueil : tâches du jour + demandes à l'administrateur */
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const { t } = await getDict();
  return (
    <>
      <SubTabs tabs={[{ href: "/accueil", label: t.nav.home, exact: true }, { href: "/accueil/demandes", label: t.nav.requests }]} />
      {children}
    </>
  );
}
