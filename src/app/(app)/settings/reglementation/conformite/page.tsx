import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getDict } from "@/lib/i18n/server";
import { ConformityRow } from "../../SettingsClient";

export default async function ConformityPage() {
  const { t, locale } = await getDict();
  const categories = await getDb().select().from(schema.categories).orderBy(asc(schema.categories.position));
  return (
    <section className="card overflow-x-auto">
      <h2 className="px-4 pt-4 font-semibold">{t.settings.conformity}</h2>
      <p className="px-4 text-xs text-stone-500">{t.settings.conformityHint}</p>
      <table className="table mt-2">
        <thead>
          <tr>
            <th>{t.common.category}</th>
            <th className="min-w-64"><span className="badge bg-emerald-100 text-emerald-800">{t.decision.conform}</span></th>
            <th className="min-w-64"><span className="badge bg-amber-100 text-amber-900">{t.decision.reserve}</span></th>
            <th className="min-w-64"><span className="badge bg-red-100 text-red-800">{t.decision.refuse}</span></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <ConformityRow key={c.id} c={{ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr, conformRules: c.conformRules ?? "", reserveRules: c.reserveRules ?? "", refuseRules: c.refuseRules ?? "" }} />
          ))}
        </tbody>
      </table>
      <p className="px-4 pb-4 text-xs text-stone-500">{t.settings.thresholdsShown} <Link href="/protocoles?id=conformite" className="text-brand-700 underline">{t.protocols.conformity}</Link></p>
    </section>
  );
}
