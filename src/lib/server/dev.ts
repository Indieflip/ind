import "server-only";
import { getSetting } from "@/lib/settings";
import type { SessionUser } from "@/lib/auth";

/** Onglet Dev : réservé aux comptes choisis (par défaut, aux administrateurs) */
export async function canSeeDev(user: SessionUser | null) {
  if (!user) return false;
  const ids = (await getSetting("dev_users"))?.split(",").map(Number).filter(Boolean) ?? [];
  return ids.length ? ids.includes(user.id) : user.role === "admin";
}
