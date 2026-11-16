"use client";
import { appConfirm, appAlert } from "@/components/Confirm";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addUserAction, changePasswordAction, setCompanyFieldAction, updateConformityAction, deleteUserAction, updateUserProfileAction, saveBackupSettingsAction, saveRightsAction, setRestaurantAction, updateCategoryAction, updateUserAction } from "@/lib/actions/settings";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  return (
    <tr className={`${user.active ? "" : "opacity-50"} hover:bg-stone-50`}>
      <td className="font-medium">
        <Link href={`/settings/utilisateurs/${user.id}`} className="text-brand-700 hover:underline">{user.name}</Link>
        {isMe && <span className="text-xs text-stone-400"> ({t.settings.you})</span>}
      </td>
      <td className="text-stone-600">{user.email}</td>
      <td>{t.roles[user.role as keyof typeof t.roles]}</td>
      <td><span className={`badge ${user.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{user.active ? t.settings.active : t.settings.disabled}</span></td>
      <td className="whitespace-nowrap text-right">
        <Link href={`/settings/utilisateurs/${user.id}`} className="btn-ghost px-2 py-1 text-xs"><Icon name="edit" className="h-3.5 w-3.5" /> {t.common.edit}</Link>
        {!isMe && (
          <button
            className="btn-ghost p-1.5 text-stone-400 hover:text-red-600"
            aria-label={t.common.delete}
            disabled={pending}
            onClick={async () => {
              if (!(await appConfirm(`${t.settings.deleteUserConfirm}\n${user.name}`))) return;
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

export function UserProfile({ user, isMe }: { user: { id: number; name: string; email: string; role: string; active: boolean }; isMe: boolean }) {
  const { t } = useI18n();
  const [v, setV] = useState(user);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <section className="card space-y-3 p-4">
      <h3 className="font-semibold">{t.settings.profile}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">{t.auth.name}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label><span className="label">{t.auth.email}</span><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
        <label>
          <span className="label">{t.settings.role}</span>
          <select className="input" value={v.role} disabled={isMe} onChange={(e) => setV({ ...v, role: e.target.value })}>
            {(["admin", "econome", "comptable", "invite"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.active} disabled={isMe} onChange={(e) => setV({ ...v, active: e.target.checked })} /> {t.settings.active}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await updateUserProfileAction(user.id, v);
          setMsg(r.error === "exists" ? `${t.auth.email} ✗` : r.error ? t.common.error : t.common.saved);
        })}>{t.common.save}</button>
        {msg && <span className="text-sm text-stone-600">{msg}</span>}
      </div>
    </section>
  );
}

/** Mot de passe : vérification par le mot de passe de l'administrateur connecté, nouveau ×2 */
export function UserPassword({ id, isMe }: { id: number; isMe: boolean }) {
  const { t } = useI18n();
  const s = t.settings;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="card space-y-3 p-4">
      <h3 className="font-semibold">{t.auth.password}</h3>
      <p className="text-xs text-stone-500">{s.passwordInfo}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">{isMe ? s.currentPassword : s.adminPassword}</span>
          <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          <span className="label">{s.newPasswordPh}</span>
          <PasswordInput autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} placeholder={t.auth.passwordHint} />
        </label>
        <label>
          <span className="label">{s.confirmPassword}</span>
          <PasswordInput autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={pending || !current || next.length < 8 || !again}
          onClick={() => start(async () => {
            const r = await changePasswordAction(id, current, next, again);
            if (r.ok) { setCurrent(""); setNext(""); setAgain(""); }
            setMsg(r.ok ? { ok: true, text: s.passwordChanged } : { ok: false, text: r.error === "current" ? s.wrongPassword : r.error === "mismatch" ? s.passwordMismatch : t.auth.passwordHint });
          })}
        >
          {s.changePassword}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </section>
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

/** Conditions Conforme / Réserve / Refus d'une catégorie (une condition par ligne, enregistré en quittant le champ) */
export function ConformityRow({ c }: { c: { id: number; name: string; conformRules: string; reserveRules: string; refuseRules: string } }) {
  const [, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const area = (key: "conformRules" | "reserveRules" | "refuseRules", tint: string) => (
    <td>
      <textarea
        className={`input min-h-32 text-xs leading-relaxed ${tint}`}
        defaultValue={c[key]}
        onBlur={(e) => {
          if (e.target.value === c[key]) return;
          start(async () => {
            await updateConformityAction(c.id, { [key]: e.target.value });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          });
        }}
      />
    </td>
  );
  return (
    <tr className="align-top">
      <td className="font-medium">{c.name}{saved && <Icon name="check" className="ml-1 inline h-4 w-4 text-emerald-600" />}</td>
      {area("conformRules", "bg-emerald-50/40")}
      {area("reserveRules", "bg-amber-50/40")}
      {area("refuseRules", "bg-red-50/40")}
    </tr>
  );
}

type CompanyKey = "company_legal_name" | "restaurant_name" | "company_address" | "company_phone" | "company_email" | "company_siret" | "company_vat";

/** Onglet Company : enregistrement de chaque champ en quittant le champ */
export function CompanyForm({ initial }: { initial: Record<CompanyKey, string> }) {
  const { t } = useI18n();
  const s = t.settings;
  const [, start] = useTransition();
  const [state, setState] = useState<Record<string, "saved" | "error" | undefined>>({});
  const field = (key: CompanyKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="label">
        {label}
        {state[key] === "saved" && <Icon name="check" className="ml-1 inline h-4 w-4 text-emerald-600" />}
        {state[key] === "error" && <span className="ml-1 text-xs text-red-600">{key === "company_siret" ? s.siretInvalid : key === "company_vat" ? s.vatInvalid : t.backup.emailInvalid}</span>}
      </span>
      <input
        className="input"
        defaultValue={initial[key]}
        onBlur={(e) => {
          if (e.target.value === initial[key]) return;
          start(async () => {
            const r = await setCompanyFieldAction(key, e.target.value);
            setState((x) => ({ ...x, [key]: r.ok ? "saved" : "error" }));
            if (r.ok) initial[key] = e.target.value;
          });
        }}
        {...props}
      />
    </label>
  );
  return (
    <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
      {field("company_legal_name", s.legalName, { placeholder: "SAS New York New York" })}
      {field("restaurant_name", s.restaurantName)}
      <div className="sm:col-span-2">{field("company_address", s.address, { placeholder: "1 Boulevard de la Croisette, 06400 Cannes" })}</div>
      {field("company_phone", s.phone, { type: "tel", placeholder: "04 93 00 00 00" })}
      {field("company_email", s.contactEmail, { type: "email", placeholder: "contact@exemple.fr" })}
      {field("company_siret", s.siret, { inputMode: "numeric", placeholder: "123 456 789 00012" })}
      {field("company_vat", s.vat, { placeholder: "FR12 345678901" })}
    </div>
  );
}
