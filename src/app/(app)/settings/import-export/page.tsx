import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getDict } from "@/lib/i18n/server";
import { blobEnabled } from "@/lib/storage";
import { backupSettings } from "@/lib/server/backup";
import { fmtDateTime } from "@/lib/format";
import { BackupSettings } from "../SettingsClient";

export default async function ImportExportPage() {
  const { t, locale } = await getDict();
  const s = t.settings;
  const [backups, bs] = await Promise.all([
    getDb()
      .select({ id: schema.backups.id, createdAt: schema.backups.createdAt, kind: schema.backups.kind, fileName: schema.backups.fileName, size: schema.backups.size, emailedTo: schema.backups.emailedTo, by: schema.users.name })
      .from(schema.backups)
      .leftJoin(schema.users, eq(schema.users.id, schema.backups.createdBy))
      .orderBy(desc(schema.backups.createdAt))
      .limit(50),
    backupSettings(),
  ]);
  const ai = !!process.env.ANTHROPIC_API_KEY;
  const emailReady = !!process.env.RESEND_API_KEY && !!process.env.CRON_SECRET;
  return (
    <>
      <section id="sauvegarde" className="card p-4">
        <h2 className="font-semibold">{t.backup.title}</h2>
        <p className="mb-3 text-sm text-stone-600">{t.backup.intro}</p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <a href="/api/backup" className="btn-primary">{t.backup.download}</a>
          <Link href="/mercurial/import" className="btn-secondary">{t.mercurial.importTitle}</Link>
          <span className="text-sm text-stone-600">{backups[0] ? `${t.backup.last} ${fmtDateTime(backups[0].createdAt, locale)}` : t.backup.never}</span>
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
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">{s.integrations}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3"><dt>{s.blReading}</dt><dd className={ai ? "font-semibold text-emerald-700" : "text-stone-500"}>{ai ? s.enabled : s.notConfigured}</dd></div>
          <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3"><dt>{s.photoStorage}</dt><dd className={blobEnabled() ? "font-semibold text-emerald-700" : "text-amber-700"}>{blobEnabled() ? s.blobOk : s.blobFallback}</dd></div>
          <div className="flex justify-between gap-2 rounded-lg bg-stone-50 p-3"><dt>{t.backup.emailSending}</dt><dd className={emailReady ? "font-semibold text-emerald-700" : "text-stone-500"}>{emailReady ? s.enabled : s.notConfigured}</dd></div>
        </dl>
      </section>
    </>
  );
}
