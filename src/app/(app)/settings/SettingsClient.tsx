"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addUserAction, setRestaurantAction, updateCategoryAction, updateUserAction } from "@/lib/actions/settings";
import { useI18n } from "@/lib/i18n/client";
import { PasswordInput } from "@/components/PasswordInput";
import { Icon } from "@/components/Icon";

export function RestaurantName({ initial }: { initial: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <label className="block max-w-md">
      <span className="label">{t.settings.restaurantName}</span>
      <input className="input" defaultValue={initial} disabled={pending} onBlur={(e) => e.target.value !== initial && start(() => setRestaurantAction(e.target.value))} />
    </label>
  );
}

export function UserRow({ user, isMe }: { user: { id: number; name: string; email: string; role: string; active: boolean }; isMe: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  return (
    <tr className={user.active ? "" : "opacity-50"}>
      <td className="font-medium">{user.name}{isMe && <span className="text-xs text-stone-400"> ({t.settings.you})</span>}</td>
      <td className="text-stone-600">{user.email}</td>
      <td>
        <select className="input py-1.5" defaultValue={user.role} disabled={isMe || pending} onChange={(e) => start(() => updateUserAction(user.id, { role: e.target.value }))}>
          {(["admin", "contributor", "viewer"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
      </td>
      <td>
        <button className={`badge ${user.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`} disabled={isMe || pending} onClick={() => start(() => updateUserAction(user.id, { active: !user.active }))}>
          {user.active ? t.settings.active : t.settings.disabled}
        </button>
      </td>
      <td>
        <div className="flex gap-1">
          <div className="w-44"><PasswordInput className="input py-1.5" minLength={8} placeholder="••••••••" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setDone(false); }} /></div>
          <button className="btn-secondary px-2 py-1.5" disabled={pw.length < 8 || pending} onClick={() => start(async () => { await updateUserAction(user.id, { password: pw }); setPw(""); setDone(true); })}>
            <Icon name="check" className="h-4 w-4" />
          </button>
          {done && <span className="self-center text-xs text-emerald-700">{t.common.saved}</span>}
        </div>
      </td>
    </tr>
  );
}

export function AddUser() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addUserAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-[1fr_1.3fr_1fr_1fr_auto] sm:items-end">
      <label><span className="label">{t.auth.name}</span><input name="name" className="input" required /></label>
      <label><span className="label">{t.auth.email}</span><input name="email" type="email" className="input" required /></label>
      <label><span className="label">{t.auth.password}</span><PasswordInput name="password" minLength={8} required autoComplete="new-password" placeholder={t.auth.passwordHint} /></label>
      <label>
        <span className="label">{t.settings.role}</span>
        <select name="role" className="input" defaultValue="contributor">
          {(["contributor", "viewer", "admin"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
      </label>
      <button className="btn-primary" disabled={pending}><Icon name="plus" className="h-4 w-4" />{t.settings.addUser}</button>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-5">{state.error === "exists" ? `${t.auth.email} ✗` : t.common.error}</p>}
    </form>
  );
}

export function CategoryRow({ c }: { c: { id: number; name: string; tempRequired: boolean; conformMax: number | null; reserveMax: number | null } }) {
  const [pending, start] = useTransition();
  return (
    <tr>
      <td className="font-medium">{c.name}</td>
      <td><input type="checkbox" className="h-4 w-4 accent-brand-600" defaultChecked={c.tempRequired} disabled={pending} onChange={(e) => start(() => updateCategoryAction(c.id, { tempRequired: e.target.checked }))} /></td>
      <td><input className="input w-24 py-1.5" inputMode="decimal" defaultValue={c.conformMax ?? ""} onBlur={(e) => start(() => updateCategoryAction(c.id, { conformMax: e.target.value }))} /></td>
      <td><input className="input w-24 py-1.5" inputMode="decimal" defaultValue={c.reserveMax ?? ""} onBlur={(e) => start(() => updateCategoryAction(c.id, { reserveMax: e.target.value }))} /></td>
    </tr>
  );
}
