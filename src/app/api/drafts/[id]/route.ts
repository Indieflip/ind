import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const row = await getDb().query.receptionDrafts.findFirst({ where: eq(schema.receptionDrafts.id, Number((await params).id)) });
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ id: row.id, data: row.data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertUser(can.deleteDraftReception);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  await getDb().delete(schema.receptionDrafts).where(eq(schema.receptionDrafts.id, Number((await params).id)));
  revalidatePath("/receptions");
  return Response.json({ ok: true });
}
