import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = await getDb().query.files.findFirst({ where: eq(schema.files.id, id) });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.dataBase64, "base64"), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=31536000, immutable" },
  });
}
