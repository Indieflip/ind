import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can, mergeMatrix, RIGHTS } from "@/lib/permissions";
import { getRestaurantName, getSetting } from "@/lib/settings";
import { blobEnabled } from "@/lib/storage";
import { backupSettings } from "@/lib/server/backup";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { AddUser, BackupSettings, CategoryRow, RestaurantName, RightsEditor, UserRow } from "./SettingsClient";

export default async function SettingsPage() {
  const me = await requireUser(can.manageSettings);
  const { t, locale } = await getDict();
  const db = getDb();
  const isAdmin = me.role === "admin";
  const [users, categories, restaurant, rightsRaw, backups, bs] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active }).from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    getRestaurantName(),
    getSetting("rights"),
    db
      .select({ id: schema.backups.id, createdAt: schema.backups.createdAt, kind: schema.backups.kind, fileName: schema.backups.fileName, size: schema.backups.size, emailedTo: schema.backups.emailedTo, by: schema.users.name })
      .from(schema.backups)
      .leftJoin(schema.users, eq(schema.users.id, schema.backups.createdBy))
      .orderBy(desc(schema.backups.createdAt))
      .limit(50),
    backupSettings(),
  ]);
  let stored: unknown = null;
  try { stored = rightsRaw ? JSON.parse(rightsRaw) : null; } catch {}
  const matrix = mergeMatrix(stored);
  const ai = !!process.env.ANTHROPIC_API_KEY;
  const emailReady = !!process.env.RESEND_API_KEY && !!process.env.CRON_SECRET;
  const s = t.settings;

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} />

      {isAdmin && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{s.restaurant}</h2>
          <RestaurantName initial={restaurant} />
        </section>
      )}

      {can.manageUsers(me.role) && (
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-4 font-semibold">{s.users}</h2>
          <table className="table mt-2">
            <thead>
              <tr><th>{t.auth.name}</th><th>{t.auth.email}</th><th>{s.role}</th><th>{t.common.status}</th><th>{s.resetPassword}</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => <UserRow key={u.id} user={u} isMe={u.id === me.id} />)}
            </tbody>
          </table>
          <div className="border-t border-stone-100 p-4"><AddUser /></div>
        </section>
      )}

      {can.manageRights(me.role) && (
        <section className="card overflow-x-auto">
          <h2 className="px-4 pt-4 font-semibold">{t.rights.title}</h2>
          <p className="px-4 text-xs text-stone-500">{t.rights.intro}</p>
          <RightsEditor rights={RIGHTS.map((r) => ({ key: r.key, tab: r.tab }))} matrix={matrix} />
        </section>
      )}

      {isAdmin && (
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
        </section>
      )}

      {can.backup(me.role) && (
        <section id="sauvegarde" className="card p-4">
          <h2 className="font-semibold">{t.backup.title}</h2>
          <p className="mb-3 text-sm text-stone-600">{t.backup.intro}</p>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <a href="/api/backup" className="btn-primary">{t.backup.download}</a>
            <span className="text-sm text-stone-600">
              {backups[0] ? `${t.backup.last} ${fmtDateTime(backups[0].createdAt, locale)}` : t.backup.never}
            </span>
          </div>
          <BackupSettings initial={bs} emailReady={emailReady} />
          <h3 className="mb-1 mt-5 text-sm font-semibold">{t.backup.history}</h3>
          {backups.length === 0 ? (
            <p className="text-sm text-stone-500">{t.backup.never}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{t.backup.date}</th><th>{t.backup.kind}</th><th>{t.backup.file}</th><th className="text-right">{t.backup.size}</th><th>{t.backup.by}</th></tr></thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(b.createdAt, locale)}</td>
                      <td>{b.kind === "auto" ? `${t.backup.auto}${b.emailedTo ? ` → ${b.emailedTo}` : ""}` : t.backup.manual}</td>
                      <td className="text-stone-600">{b.fileName}</td>
                      <td className="text-right tabular-nums">{b.size ? `${Math.round(b.size / 1024)} Ko` : "—"}</td>
                      <td className="text-stone-600">{b.by ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{s.integrations}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3">
              <dt>{s.blReading}</dt>
              <dd className={ai ? "font-semibold text-emerald-700" : "text-stone-500"}>{ai ? s.enabled : s.notConfigured}</dd>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3">
              <dt>{s.photoStorage}</dt>
              <dd className={blobEnabled() ? "font-semibold text-emerald-700" : "text-amber-700"}>{blobEnabled() ? s.blobOk : s.blobFallback}</dd>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3">
              <dt>{t.backup.emailSending}</dt>
              <dd className={emailReady ? "font-semibold text-emerald-700" : "text-stone-500"}>{emailReady ? s.enabled : s.notConfigured}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
