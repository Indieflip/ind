import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { getRestaurantName } from "@/lib/settings";
import { blobEnabled } from "@/lib/storage";
import { PageHeader } from "@/components/ui";
import { AddUser, CategoryRow, RestaurantName, UserRow } from "./SettingsClient";

export default async function SettingsPage() {
  const me = await requireUser(can.manageSettings);
  const { t, locale } = await getDict();
  const db = getDb();
  const [users, categories, restaurant] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active }).from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    getRestaurantName(),
  ]);
  const ai = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} />

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">{t.settings.restaurant}</h2>
        <RestaurantName initial={restaurant} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{t.settings.users}</h2>
        <table className="table mt-2">
          <thead>
            <tr><th>{t.auth.name}</th><th>{t.auth.email}</th><th>{t.settings.role}</th><th>{t.common.status}</th><th>{t.settings.resetPassword}</th></tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.id} user={u} isMe={u.id === me.id} />)}
          </tbody>
        </table>
        <div className="border-t border-stone-100 p-4"><AddUser /></div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{t.settings.thresholds}</h2>
        <p className="px-4 text-xs text-stone-500">{t.settings.thresholdsHint}</p>
        <table className="table mt-2">
          <thead>
            <tr><th>{t.common.category}</th><th>{t.settings.tempRequired}</th><th>{t.settings.conformMax}</th><th>{t.settings.reserveMax}</th></tr>
          </thead>
          <tbody>
            {categories.map((c) => <CategoryRow key={c.id} c={{ id: c.id, name: locale === "en" ? c.nameEn : c.nameFr, tempRequired: c.tempRequired, conformMax: c.conformMax, reserveMax: c.reserveMax }} />)}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">{t.settings.integrations}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3">
            <dt>{t.settings.blReading}</dt>
            <dd className={ai ? "font-semibold text-emerald-700" : "text-stone-500"}>{ai ? t.settings.enabled : t.settings.notConfigured}</dd>
          </div>
          <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3">
            <dt>{t.settings.photoStorage}</dt>
            <dd className={blobEnabled() ? "font-semibold text-emerald-700" : "text-amber-700"}>{blobEnabled() ? t.settings.blobOk : t.settings.blobFallback}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
