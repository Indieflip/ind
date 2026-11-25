import Link from "next/link";
import { WEIGH_TYPE } from "@/lib/anomaly";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, fmtMoney, num } from "@/lib/format";
import { one, receptionNumbers, type SP } from "@/lib/server/queries";
import { globalSearch } from "@/lib/server/search";
import { PageHeader } from "@/components/ui";
import { GlobalSearch } from "@/components/GlobalSearch";

const docText = (docs: { type: string; number: string }[] | null, bl: string | null) =>
  docs?.length ? docs.map((d) => `${d.type === "facture" ? "Facture" : d.type === "autre" ? "Doc." : "BL"} ${d.number}`).join(" · ") : bl ? `BL ${bl}` : "—";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const s = t.search;
  const q = (one((await searchParams).q) ?? "").trim();
  const [res, numbers] = await Promise.all([q ? globalSearch(q) : null, receptionNumbers()]);
  const r = user.role;
  const sections = res
    ? [
        can.viewReceptions(r) && res.receptions.length > 0 && (
          <Section key="rec" title={t.nav.receptions} count={res.receptions.length}>
            {res.receptions.map((x) => (
              <Item key={x.id} href={`/receptions/${x.id}`} title={`${numbers.get(x.id) ?? ""}. ${x.supplierName}`} meta={`${fmtDateTime(x.deliveredAt, locale)} · ${docText(x.documents, x.blNumber)}${x.consolidatedAt ? ` · ${t.receptions.consolidated}` : ""}`} />
            ))}
          </Section>
        ),
        can.viewAnomalies(r) && res.anomalies.length > 0 && (
          <Section key="ano" title={t.nav.anomalies} count={res.anomalies.length}>
            {res.anomalies.map((x) => (
              <Item key={x.id} href={x.receptionId ? `/receptions/${x.receptionId}` : "/anomalies"} title={`${x.supplierName}${x.productName ? ` · ${x.productName}` : ""}`} meta={`${fmtDate(x.createdAt, locale)}${x.reference ? ` · ${x.reference}` : ""} · ${t.anomalies.statuses[x.status]} — ${x.description}`} />
            ))}
          </Section>
        ),
        can.viewAnomalies(r) && res.gaps.length > 0 && (
          <Section key="gap" title={t.weigh.title} count={res.gaps.length}>
            {res.gaps.map((x) => (
              <Item key={x.id} href={x.receptionId ? `/receptions/${x.receptionId}` : `/anomalies?${new URLSearchParams({ view: "liste", type: WEIGH_TYPE })}`} title={x.product} meta={`${fmtDate(x.date, locale)} · ${x.supplierRef ?? ""}${x.gapAmount ? ` · ${fmtMoney(num(x.gapAmount), locale)}` : ""}`} />
            ))}
          </Section>
        ),
        can.viewAnomalies(r) && res.claims.length > 0 && (
          <Section key="claims" title={t.claims.title} count={res.claims.length}>
            {res.claims.map((x) => (
              <Item key={x.id} href="/anomalies/reclamations" title={`${t.claims.number} ${x.id} · ${x.supplierName ?? ""}`} meta={`${fmtDate(x.date, locale)}${x.reference ? ` · ${x.reference}` : ""} · ${t.claims.statuses[x.status as "en_cours"] ?? x.status} — ${x.subject}`} />
            ))}
          </Section>
        ),
        can.viewMercurial(r) && res.products.length > 0 && (
          <Section key="prod" title={t.mercurial.products} count={res.products.length}>
            {res.products.map((x) => (
              <Item key={x.id} href={`/mercurial/fournisseurs/${x.supplierId}`} title={x.name} meta={`${x.supplier} · ${x.unit} · ${x.priceMin && x.priceMin !== x.price ? `${fmtMoney(num(x.priceMin), locale)} – ` : ""}${fmtMoney(num(x.price), locale)}`} />
            ))}
          </Section>
        ),
        can.viewMercurial(r) && res.suppliers.length > 0 && (
          <Section key="sup" title={t.search.suppliers} count={res.suppliers.length}>
            {res.suppliers.map((x) => <Item key={x.id} href={`/mercurial/fournisseurs/${x.id}`} title={x.name} />)}
          </Section>
        ),
        can.viewMercurial(r) && res.maj.length > 0 && (
          <Section key="maj" title={t.maj.title} count={res.maj.length}>
            {res.maj.map((x) => <Item key={x.id} href={x.productId ? `/mercurial/produits/${x.productId}` : "/mercurial"} title={x.item ?? "—"} meta={`${x.date ? fmtDate(x.date, locale) : ""} · ${x.detail ?? ""}${x.reference ? ` · ${x.reference}` : ""}`} />)}
          </Section>
        ),
        can.viewProtocols(r) && res.protocols.length > 0 && (
          <Section key="pro" title={t.nav.protocols} count={res.protocols.length}>
            {res.protocols.map((x) => <Item key={x.id} href={`/protocoles?id=${x.id}`} title={x.title} />)}
          </Section>
        ),
      ].filter(Boolean)
    : [];
  return (
    <>
      <PageHeader title={s.title} />
      <GlobalSearch value={q} label={s.title} placeholder={s.placeholder} button={s.button} />
      {!q ? (
        <p className="text-sm text-stone-500">{s.hint}</p>
      ) : sections.length === 0 ? (
        <p className="card p-6 text-center text-sm text-stone-500">{s.none} « {q} ».</p>
      ) : (
        <div className="space-y-4">{sections}</div>
      )}
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-semibold">{title} <span className="font-normal text-stone-500">({count}{count >= 50 ? "+" : ""})</span></h2>
      <ul className="divide-y divide-stone-100">{children}</ul>
    </section>
  );
}

function Item({ href, title, meta }: { href: string; title: string; meta?: string }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2.5 hover:bg-stone-50">
        <span className="font-medium text-brand-700">{title}</span>
        {meta && <span className="block truncate text-xs text-stone-500">{meta}</span>}
      </Link>
    </li>
  );
}
