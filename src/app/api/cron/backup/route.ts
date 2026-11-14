import { getDb, schema } from "@/db";
import { backupSettings, buildBackup, emailBackup, lastBackup } from "@/lib/server/backup";

export const maxDuration = 120;

/**
 * Sauvegarde automatique (tâche planifiée Vercel, chaque jour).
 * Envoie le fichier par e-mail quand la fréquence choisie est atteinte, si l'envoi est configuré
 * (RESEND_API_KEY + adresse dans Réglages). Sinon l'administrateur voit un rappel dans l'application.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const settings = await backupSettings();
  const last = await lastBackup();
  const due = !last || Date.now() - last.createdAt.getTime() >= settings.frequencyDays * 86_400_000 - 3_600_000;
  if (!due) return Response.json({ skipped: "not_due" });
  if (!process.env.RESEND_API_KEY || !settings.email) return Response.json({ skipped: "email_not_configured" });
  const file = await buildBackup();
  await emailBackup(settings.email, file);
  await getDb().insert(schema.backups).values({ kind: "auto", fileName: file.fileName, size: file.buffer.length, emailedTo: settings.email });
  return Response.json({ sent: settings.email });
}
