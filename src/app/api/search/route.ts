import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, sentence } from "@/lib/format";
import { globalSearch } from "@/lib/server/search";
import { receptionNumbers } from "@/lib/server/queries";

/** Suggestions de la recherche globale, au fil de la saisie */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ results: [] }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const res = await globalSearch(q);
  if (!res) return Response.json({ results: [] });
  const r = user.role;
  const numbers = await receptionNumbers();
  const out: { group: string; title: string; meta: string; href: string }[] = [];
  if (can.viewReceptions(r))
    for (const x of res.receptions.slice(0, 5))
      out.push({ group: "receptions", title: `${numbers.get(x.id) ?? ""}. ${sentence(x.supplierName)}`, meta: `${fmtDate(x.deliveredAt)} · ${(x.documents ?? []).map((d) => d.number).join(" · ") || x.blNumber || ""}`, href: `/receptions/${x.id}` });
  if (can.viewMercurial(r)) {
    for (const x of res.suppliers.slice(0, 3)) out.push({ group: "suppliers", title: sentence(x.name), meta: "", href: `/mercurial/fournisseurs/${x.id}` });
    for (const x of res.products.slice(0, 5)) out.push({ group: "products", title: x.name, meta: sentence(x.supplier), href: `/mercurial/fournisseurs/${x.supplierId}` });
  }
  if (can.viewAnomalies(r))
    for (const x of res.anomalies.slice(0, 4)) out.push({ group: "anomalies", title: `${sentence(x.supplierName)}${x.productName ? ` · ${x.productName}` : ""}`, meta: x.description.slice(0, 80), href: x.receptionId ? `/receptions/${x.receptionId}` : "/anomalies" });
  if (can.viewProtocols(r)) for (const x of res.protocols.slice(0, 2)) out.push({ group: "protocols", title: x.title, meta: "", href: `/protocoles?id=${x.id}` });
  return Response.json({ results: out });
}
