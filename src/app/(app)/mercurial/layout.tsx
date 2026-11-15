import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { SubTabs } from "@/components/SubTabs";

export default async function MercurialLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(can.viewMercurial);
  const { t } = await getDict();
  const tabs = [
    { href: "/mercurial", label: t.mercurial.tabProducts, exact: true },
    { href: "/mercurial/fournisseurs", label: t.mercurial.tabSuppliers },
    { href: "/mercurial/fruits-legumes", label: t.nav.fruitsVeg },
    { href: "/mercurial/viande-poisson", label: t.meatFish.tab },
    { href: "/mercurial/boulangerie", label: t.mercurial.tabBakery },
    { href: "/mercurial/mise-a-jour", label: t.mercurial.tabUpdates },
    ...(can.importFile(user.role) ? [{ href: "/mercurial/import", label: t.mercurial.tabImport }] : []),
  ];
  return (
    <>
      <SubTabs tabs={tabs} />
      {children}
    </>
  );
}
