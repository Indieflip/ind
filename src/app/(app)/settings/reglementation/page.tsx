import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getDict } from "@/lib/i18n/server";
import { backupSettings } from "@/lib/server/backup";
import { CategoryRow } from "../SettingsClient";

export default async function RegulationPage() {
  const { t, locale } = await getDict();
  const s = t.settings;
  const [categories, bs] = await Promise.all([getDb().select().from(schema.categories).orderBy(asc(schema.categories.position)), backupSettings()]);
  return (
    <>
      <section id="seuils" className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{s.thresholds}</h2>
        <p className="px-4 text-xs text-stone-500">{s.thresholdsHint}</p>
        <table className="table mt-2">
          <thead>
            <tr><th>{t.common.category}</th><th>{s.tempRequired}</th><th>{s.conformMax}</th><th>{s.reserveMax}</th></tr>
          </thead>
          <tbody>
            {categories.map((c) => <CategoryRow key={c.id} c={{ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr, tempRequired: c.tempRequired, conformMax: c.conformMax, reserveMax: c.reserveMax }} />)}
          </tbody>
        </table>
        <p className="px-4 pb-4 text-xs text-stone-500">{s.thresholdsShown} <Link href="/protocoles?id=seuils" className="text-brand-700 underline">{t.protocols.thresholds}</Link></p>
      </section>
      <section className="card space-y-2 p-4 text-sm text-stone-700">
        <h2 className="font-semibold text-stone-900">{s.regulationTitle}</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{s.regHaccp}</li>
          <li>{s.regTrace}</li>
          <li>{s.regRetention.replace("{years}", String(bs.retentionYears))}</li>
          <li>{s.regRefuse}</li>
        </ul>
        <p className="text-xs text-stone-500">{s.regDisclaimer}</p>
      </section>
    </>
  );
}
