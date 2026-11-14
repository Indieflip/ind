import { getDb, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildBackup } from "@/lib/server/backup";

export const maxDuration = 120;

/** Téléchargement manuel de la sauvegarde complète (Excel) */
export async function GET() {
  const user = await getUser();
  if (!user || !can.backup(user.role)) return new Response("Forbidden", { status: 403 });
  const file = await buildBackup();
  await getDb().insert(schema.backups).values({ kind: "manual", fileName: file.fileName, size: file.buffer.length, createdBy: user.id });
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${file.fileName}"`,
    },
  });
}
