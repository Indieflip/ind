import { getDict } from "@/lib/i18n/server";
import { getRestaurantName } from "@/lib/settings";
import { RestaurantName } from "./SettingsClient";

export default async function CompanyPage() {
  const { t } = await getDict();
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{t.settings.restaurant}</h2>
      <RestaurantName initial={await getRestaurantName()} />
    </section>
  );
}
