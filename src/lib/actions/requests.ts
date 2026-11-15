"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";

/** Demande envoyée à l'administrateur par n'importe quel profil */
export async function sendRequestAction(_p: { ok?: boolean; error?: string } | undefined, form: FormData) {
  const user = await assertUser();
  const subject = String(form.get("subject") ?? "").trim();
  if (!subject) return { error: "subject" };
  await getDb().insert(schema.adminRequests).values({
    subject: subject.slice(0, 300),
    message: String(form.get("message") ?? "").trim().slice(0, 4000) || null,
    url: String(form.get("url") ?? "").trim().slice(0, 500) || null,
    createdBy: user.id,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Traitement par l'administrateur : faite / refusée, avec une réponse */
export async function handleRequestAction(id: number, status: "open" | "done" | "refused", response: string) {
  const user = await assertUser((r) => r === "admin");
  await getDb()
    .update(schema.adminRequests)
    .set({ status, response: response.trim() || null, handledBy: status === "open" ? null : user.id, handledAt: status === "open" ? null : new Date() })
    .where(eq(schema.adminRequests.id, id));
  revalidatePath("/", "layout");
}
