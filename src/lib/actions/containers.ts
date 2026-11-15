"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { num } from "@/lib/format";

export interface ContainerInput { supplier: string; product: string; tare: string; container: string }

const values = (d: ContainerInput) => {
  const n = num(d.tare);
  return { supplier: d.supplier.trim() || null, product: d.product.trim() || null, tare: n != null ? String(n) : null, container: d.container.trim() || null, updatedAt: new Date() };
};

export async function addContainerAction(d: ContainerInput) {
  await assertUser(can.editProtocols);
  if (!d.product.trim() && !d.container.trim()) return { error: "empty" };
  await getDb().insert(schema.containers).values(values(d));
  revalidatePath("/protocoles");
  return { ok: true };
}

export async function updateContainerAction(id: number, d: ContainerInput) {
  await assertUser(can.editProtocols);
  await getDb().update(schema.containers).set(values(d)).where(eq(schema.containers.id, id));
  revalidatePath("/protocoles");
  return { ok: true };
}

export async function deleteContainerAction(id: number) {
  await assertUser(can.editProtocols);
  await getDb().delete(schema.containers).where(eq(schema.containers.id, id));
  revalidatePath("/protocoles");
}
