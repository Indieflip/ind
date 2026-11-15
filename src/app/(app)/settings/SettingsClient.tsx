"use client";
import { appConfirm, appAlert } from "@/components/Confirm";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addUserAction, deleteUserAction, saveBackupSettingsAction, saveRightsAction, setRestaurantAction, updateCategoryAction, updateUserAction } from "@/lib/actions/settings";
import { useRouter } from "next/navigation";
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
          {(["admin", "econome", "comptable", "invite"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
      </td>
      <td>
        <button className={`badge ${user.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`} disabled={isMe || pending} onClick={() => start(() => updateUserAction(user.id, { active: !user.active }))}>
          {user.active ? t.settings.active : t.settings.disabled}
        </button>
      </td>
      <td>
        <div className="flex gap-1">
          <div className="w-44"><PasswordInput className="input py-1.5" minLength={8} placeholder={t.settings.newPasswordPh} autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setDone(false); }} /></div>
          <button className="btn-secondary px-2 py-1.5" disabled={pw.length < 8 || pending} onClick={() => start(async () => { await updateUserAction(user.id, { password: pw }); setPw(""); setDone(true); })}>
            <Icon name="check" className="h-4 w-4" />
          </button>
          {done && <span className="self-center text-xs text-emerald-700">{t.common.saved}</span>}
        </div>
      </td>
      <td className="text-right">
        {!isMe && (
          <button
            className="btn-ghost p-1.5 text-stone-400 hover:text-red-600"
            aria-label={t.common.delete}
            disabled={pending}
            onClick={async () => {
              if (!await appConfirm(`${t.settings.deleteUserConfirm}\n${user.name}`)) return;
              start(async () => {
                const r = await deleteUserAction(user.id);
                if (r.error === "used") await appAlert(t.settings.deleteUserUsed);
              });
            }}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
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
        <select name="role" className="input" defaultValue="econome">
          {(["econome", "invite", "comptable", "admin"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
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

type Others = "econome" | "comptable" | "invite";

export function RightsEditor({ rights, matrix }: { rights: { key: string; tab: string }[]; matrix: Record<string, Record<Others, boolean>> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [m, setM] = useState(matrix);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const profiles: Others[] = ["econome", "comptable", "invite"];
  const tabLabel = (tab: string) => (t.nav as Record<string, string>)[tab] ?? tab;
  return (
    <div className="p-4">
      <table className="table">
        <thead>
          <tr>
            <th>{t.rights.tab}</th>
            <th>{t.rights.right}</th>
            <th className="text-center">{t.roles.admin}</th>
            {profiles.map((p) => <th key={p} className="text-center">{t.roles[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rights.map((r) => (
            <tr key={r.key}>
              <td className="text-stone-500">{tabLabel(r.tab)}</td>
              <td>{(t.rights as Record<string, string>)[r.key] ?? r.key}</td>
              <td className="text-center"><input type="checkbox" checked disabled className="h-4 w-4" /></td>
              {profiles.map((p) => (
                <td key={p} className="text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={!!m[r.key]?.[p]}
                    onChange={(e) => { setSaved(false); setM((x) => ({ ...x, [r.key]: { ...x[r.key], [p]: e.target.checked } })); }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { await saveRightsAction(m); setSaved(true); router.refresh(); })}>
          <Icon name="check" className="h-4 w-4" /> {t.common.save}
        </button>
        {saved && <span className="text-sm text-emerald-700">{t.rights.saved}</span>}
      </div>
    </div>
  );
}

export function BackupSettings({ initial, emailReady }: { initial: { email: string; frequencyDays: number; retentionYears: number }; emailReady: boolean }) {
  const { t } = useI18n();
  const b = t.backup;
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-3 rounded-lg bg-stone-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">{b.email}</span>
          <input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="compta@…" />
        </label>
        <label>
          <span className="label">{b.frequency}</span>
          <input className="input" type="number" min={1} max={90} value={v.frequencyDays} onChange={(e) => setV({ ...v, frequencyDays: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">{b.retention}</span>
          <input className="input" type="number" min={1} max={30} value={v.retentionYears} onChange={(e) => setV({ ...v, retentionYears: Number(e.target.value) })} />
        </label>
      </div>
      <p className="text-xs text-stone-600">{b.retentionHint}</p>
      <p className={`text-xs ${emailReady ? "text-emerald-700" : "text-amber-800"}`}>{emailReady ? b.emailReady : b.emailNotReady}</p>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveBackupSettingsAction(v);
          setMsg(r.error ? b.emailInvalid : t.common.saved);
        })}>{t.common.save}</button>
        {msg && <span className="text-sm text-stone-600">{msg}</span>}
      </div>
    </div>
  );
}
