import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { UserPassword, UserProfile } from "../../SettingsClient";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser((r) => r === "admin");
  const { t, locale } = await getDict();
  const id = Number((await params).id);
  const user = Number.isInteger(id) ? await getDb().query.users.findFirst({ where: eq(schema.users.id, id) }) : undefined;
  if (!user) notFound();
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/settings/utilisateurs" className="btn-ghost -ml-2 px-2"><Icon name="chevronLeft" className="h-4 w-4" /> {t.settings.users}</Link>
      <h2 className="text-xl font-bold">{user.name}{user.id === me.id && <span className="ml-2 text-sm font-normal text-stone-500">({t.settings.you})</span>}</h2>
      <p className="text-xs text-stone-500">{t.settings.createdOn} {fmtDateTime(user.createdAt, locale)}</p>
      <UserProfile user={{ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active }} isMe={user.id === me.id} />
      <UserPassword id={user.id} isMe={user.id === me.id} />
    </div>
  );
}
