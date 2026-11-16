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
  if (!/\.xls[xm]$/i.test(file.name)) return { error: "format" };
  try {
    const report = await importWorkbook(await file.arrayBuffer(), {
      mercurial: form.get("mercurial") !== "off",
      maj: form.get("maj") !== "off",
      fv: form.get("fv") !== "off",
      bakery: form.get("bakery") !== "off",
      locked: form.get("locked") !== "off",
      gaps: form.get("gaps") !== "off",
      anomalies: form.get("anomalies") !== "off",
      process: form.get("process") !== "off",
      info: form.get("info") !== "off",
    });
    await getDb().insert(schema.imports).values({
      fileName: file.name,
      products: report.mercurial?.fileProducts ?? report.meatFish?.products ?? null,
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
