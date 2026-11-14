import { requireUser } from "@/lib/auth";

// Import de ~2 000 lignes vers Neon : on laisse le temps à la fonction Vercel
export const maxDuration = 300;
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./ImportForm";

export default async function ImportPage() {
  await requireUser(can.editMercurial);
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.mercurial.tabImport} />
      <ImportForm />
    </>
  );
}
