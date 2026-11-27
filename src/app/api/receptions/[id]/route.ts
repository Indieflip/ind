import { revalidatePath } from "next/cache";
import { syncWeighAnomalies } from "@/lib/server/weighAnomalies";
import { invalidate } from "@/lib/server/throttle";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DuplicateDocError, LockedError, payloadSchema, updateReception } from "@/lib/server/receptions";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await assertUser(can.editReception);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as Error).message === "FORBIDDEN" ? 403 : 401 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  let res;
  try {
    res = await updateReception(id, parsed.data, user);
  } catch (e) {
    if (e instanceof LockedError) return Response.json({ error: "consolidated" }, { status: 409 });
    if (e instanceof DuplicateDocError) return Response.json({ error: "duplicate_doc", duplicate: e.info }, { status: 409 });
    throw e;
  }
  if (res == null) return Response.json({ error: "not_found" }, { status: 404 });
  // Écarts de pesée du bon → fiche d'anomalie « Écart de pesée » tout de suite (les pages ne le refont plus à chaque ouverture)
  await syncWeighAnomalies({ receptionId: id }).catch(() => invalidate("weigh-anomalies"));
  invalidate("product-links");
  revalidatePath("/receptions");
  revalidatePath(`/receptions/${id}`);
  return Response.json({ id });
}
