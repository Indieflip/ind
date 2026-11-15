import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DuplicateDocError, payloadSchema, saveReception } from "@/lib/server/receptions";

export async function POST(req: Request) {
  let user;
  try {
    user = await assertUser(can.receive);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as Error).message === "FORBIDDEN" ? 403 : 401 });
  }
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  let id;
  try {
    id = await saveReception(parsed.data, user);
  } catch (e) {
    if (e instanceof DuplicateDocError) return Response.json({ error: "duplicate_doc", duplicate: e.info }, { status: 409 });
    throw e;
  }
  revalidatePath("/receptions");
  return Response.json({ id });
}
