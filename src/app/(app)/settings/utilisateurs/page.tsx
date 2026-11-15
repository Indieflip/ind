import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { mergeMatrix, RIGHTS } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { AddUser, RightsEditor, UserRow } from "../SettingsClient";

export default async function UsersPage() {
  const me = await requireUser((r) => r === "admin");
  const { t } = await getDict();
  const [users, rightsRaw] = await Promise.all([
    getDb().select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, active: schema.users.active }).from(schema.users).orderBy(asc(schema.users.name)),
    getSetting("rights"),
  ]);
  let stored: unknown = null;
  try { stored = rightsRaw ? JSON.parse(rightsRaw) : null; } catch {}
  const s = t.settings;
  return (
    <>
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{s.users}</h2>
        <p className="px-4 text-xs text-stone-500">{s.passwordInfo}</p>
        <table className="table mt-2">
          <thead>
            <tr><th>{t.auth.name}</th><th>{t.auth.email}</th><th>{s.role}</th><th>{t.common.status}</th><th>{s.resetPassword}</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.id} user={u} isMe={u.id === me.id} />)}
          </tbody>
        </table>
        <div className="border-t border-stone-100 p-4"><AddUser /></div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">{t.rights.title}</h2>
        <p className="px-4 text-xs text-stone-500">{t.rights.intro}</p>
        <RightsEditor rights={RIGHTS.map((r) => ({ key: r.key, tab: r.tab }))} matrix={mergeMatrix(stored)} />
      </section>
    </>
  );
}
