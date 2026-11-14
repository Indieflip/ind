"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/client";

export function LocaleSwitch({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={`inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs font-semibold ${className}`}>
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await setLocaleAction(l); router.refresh(); })}
          className={`rounded-md px-2.5 py-1 uppercase ${locale === l ? "bg-brand-600 text-white" : "text-stone-600"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
