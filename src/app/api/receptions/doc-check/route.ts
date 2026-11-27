import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { findDocDuplicate } from "@/lib/server/receptions";
import { receptionNos } from "@/lib/server/queries";

/** Ce numéro de BL / facture est-il déjà utilisé sur une autre réception du même fournisseur ? */
export async function GET(req: Request) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const u = new URL(req.url);
  const number = u.searchParams.get("number") ?? "";
  const supplierId = Number(u.searchParams.get("supplierId")) || null;
  const excludeId = Number(u.searchParams.get("exclude")) || null;
  const dup = await findDocDuplicate({ supplierId, supplierName: u.searchParams.get("supplierName") ?? "", numbers: [number], excludeId });
  if (!dup) return Response.json({ duplicate: null });
  const numbers = await receptionNos();
  return Response.json({ duplicate: { ...dup, seq: numbers.get(dup.receptionId) ?? null } });
}
