"use server";
import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { can } from "@/lib/permissions";
import { importWorkbook, type ImportReport } from "@/lib/server/excelImport";

export async function importExcelAction(_p: { report?: ImportReport; error?: string } | undefined, form: FormData) {
  const user = await assertUser(can.importFile);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "nofile" };
  if (!/\.xlsx$/i.test(file.name)) return { error: "format" };
  try {
    const report = await importWorkbook(await file.arrayBuffer(), {
      mercurial: form.get("mercurial") === "on",
      maj: form.get("maj") === "on",
      fv: form.get("fv") === "on",
      bakery: form.get("bakery") === "on",
      locked: form.get("locked") === "on",
    });
    await getDb().insert(schema.imports).values({
      fileName: file.name,
      products: report.mercurial?.fileProducts ?? null,
      suppliers: report.mercurial?.fileSuppliers ?? null,
      details: report,
      createdBy: user.id,
    });
    revalidatePath("/", "layout");
    return { report };
  } catch (e) {
    console.error("import excel", e);
    return { error: "read" };
  }
}
