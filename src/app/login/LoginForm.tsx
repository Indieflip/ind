"use client";
import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">{t.auth.email}</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">{t.auth.password}</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.auth.invalid}</p>}
      <button className="btn-primary btn-lg w-full" disabled={pending}>{pending ? t.common.loading : t.auth.signIn}</button>
    </form>
  );
}
