import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/settings";

/**
 * Rappels de clôture : au moins une clôture de semaine tous les 7 jours, et une clôture de mois tous les 31 jours
 * (chaque rappel peut être désactivé dans l'onglet Clôture).
 */
export async function closingReminders() {
  const db = getDb();
  const [weekOn, monthOn, lastWeek, lastMonth] = await Promise.all([
    getSetting("closing_weekly"),
    getSetting("closing_monthly"),
    db.select({ at: schema.weeklyClosings.closedAt }).from(schema.weeklyClosings).where(eq(schema.weeklyClosings.period, "week")).orderBy(desc(schema.weeklyClosings.closedAt)).limit(1),
    db.select({ at: schema.weeklyClosings.closedAt }).from(schema.weeklyClosings).where(eq(schema.weeklyClosings.period, "month")).orderBy(desc(schema.weeklyClosings.closedAt)).limit(1),
  ]);
  const days = (d?: Date) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null);
  const w = days(lastWeek[0]?.at);
  const m = days(lastMonth[0]?.at);
  return {
    weeklyEnabled: weekOn !== "0",
    monthlyEnabled: monthOn !== "0",
    weekDue: weekOn !== "0" && (w == null || w >= 7),
    monthDue: monthOn !== "0" && (m == null || m >= 31),
    lastWeekDays: w,
    lastMonthDays: m,
  };
}
