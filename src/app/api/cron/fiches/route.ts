import { purgeOldExports, runDueExports } from "@/lib/server/sheets";

export const maxDuration = 120;

/**
 * Export automatique des fiches de réception (tâche planifiée Vercel, chaque soir) :
 * fiche du jour à partir de 23 h (heure de Paris), avec consolidation des bons du jour.
 * Les jours passés non exportés sont rattrapés.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  // Planifié à 22 h UTC : 23 h à Paris l'hiver (jour en cours exporté), minuit l'été (jour qui vient de finir exporté)
  const done = await runDueExports();
  await purgeOldExports();
  return Response.json({ exported: done });
}
