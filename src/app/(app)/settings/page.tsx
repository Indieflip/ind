import { getDict } from "@/lib/i18n/server";
import { getSetting } from "@/lib/settings";
import { CompanyForm } from "./SettingsClient";

export default async function CompanyPage() {
  const { t } = await getDict();
  const keys = ["company_legal_name", "restaurant_name", "company_address", "company_phone", "company_email", "company_siret", "company_vat"] as const;
  const values = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, (await getSetting(k)) ?? ""]))) as Record<(typeof keys)[number], string>;
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{t.settings.restaurant}</h2>
      <CompanyForm initial={values} />
    </section>
  );
}
