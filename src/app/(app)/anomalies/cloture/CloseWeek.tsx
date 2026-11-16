"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { closeWeekAction, setClosingReminderAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

export function CloseWeekButton({ week, count, period }: { week: string; count: number; period: "week" | "month" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-primary"
      disabled={pending}
      onClick={async () => {
        if (!(await appConfirm(`${period === "month" ? t.weekly.confirmMonth : t.weekly.confirm} (${count})`, { danger: false }))) return;
        start(async () => { await closeWeekAction(week, period); router.refresh(); });
      }}
    >
      <Icon name="layers" className="h-4 w-4" /> {period === "month" ? t.weekly.closeMonth : t.weekly.close} ({count})
    </button>
  );
}

/** Fréquences de clôture : rappel si pas de clôture de semaine depuis 7 jours / de mois depuis 31 jours */
export function ReminderSettings({ weekly, monthly }: { weekly: boolean; monthly: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (p: "week" | "month", on: boolean) => start(async () => { await setClosingReminderAction(p, on); router.refresh(); });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <span className="font-semibold">{t.weekly.frequencies}</span>
      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={weekly} disabled={pending} onChange={(e) => toggle("week", e.target.checked)} /> {t.weekly.remindWeekly}</label>
      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={monthly} disabled={pending} onChange={(e) => toggle("month", e.target.checked)} /> {t.weekly.remindMonthly}</label>
    </div>
  );
}
