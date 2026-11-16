"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { closeWeekAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { appConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";

export function CloseWeekButton({ week, count }: { week: string; count: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-primary"
      disabled={pending}
      onClick={async () => {
        if (!(await appConfirm(`${t.weekly.confirm} (${count})`, { danger: false }))) return;
        start(async () => { await closeWeekAction(week); router.refresh(); });
      }}
    >
      <Icon name="layers" className="h-4 w-4" /> {t.weekly.close} ({count})
    </button>
  );
}
