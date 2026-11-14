import "server-only";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/db";

export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Enregistre un fichier et renvoie son URL. Vercel Blob si configuré, sinon base de données. */
export async function storeFile(data: Buffer, contentType: string, folder: string): Promise<string> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("pdf") ? "pdf" : "jpg";
  if (blobEnabled()) {
    const res = await put(`${folder}/${randomUUID()}.${ext}`, data, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return res.url;
  }
  const id = randomUUID();
  await getDb().insert(schema.files).values({ id, contentType, dataBase64: data.toString("base64") });
  return `/api/files/${id}`;
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}
