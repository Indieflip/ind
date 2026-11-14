import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { storeFile } from "@/lib/storage";

const MAX = 4 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "photos").replace(/[^a-z0-9-]/gi, "") || "photos";
  if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "too large" }, { status: 413 });
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) return Response.json({ error: "bad type" }, { status: 415 });
  const url = await storeFile(Buffer.from(await file.arrayBuffer()), file.type, folder);
  return Response.json({ url });
}
