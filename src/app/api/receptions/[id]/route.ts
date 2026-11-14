import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LockedError, payloadSchema, updateReception } from "@/lib/server/receptions";

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
    throw e;
  }
  if (res == null) return Response.json({ error: "not_found" }, { status: 404 });
  revalidatePath("/receptions");
  revalidatePath(`/receptions/${id}`);
  return Response.json({ id });
}
