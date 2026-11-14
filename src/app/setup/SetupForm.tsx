"use client";
import { useActionState } from "react";
import { setupAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import { PasswordInput } from "@/components/PasswordInput";

export function SetupForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{t.auth.restaurant}</label>
        <input className="input" name="restaurant" defaultValue="New York New York · Cannes" />
      </div>
      <div>
        <label className="label">{t.auth.name}</label>
        <input className="input" name="name" required />
      </div>
      <div>
        <label className="label">{t.auth.email}</label>
        <input className="input" name="email" type="email" required autoComplete="username" />
      </div>
      <div>
        <label className="label">{t.auth.password}</label>
        <PasswordInput name="password" minLength={8} required autoComplete="new-password" />
        <p className="mt-1 text-xs text-stone-500">{t.auth.passwordHint}</p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.common.error}</p>}
      <button className="btn-primary btn-lg w-full" disabled={pending}>{t.auth.createAdmin}</button>
    </form>
  );
}
