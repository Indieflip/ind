"use client";
import { useMemo, useState, useTransition } from "react";
import { updateMajClaimAction } from "@/lib/actions/maj";
import { useI18n } from "@/lib/i18n/client";
import { fmtDate } from "@/lib/format";
import { matches } from "@/lib/search";
import { SearchSuggest } from "@/components/SearchSuggest";

interface Row { id: number; date: string | null; nature: string | null; item: string | null; detail: string | null; reference: string | null; claim: string | null }

/** Historique « Suivi MAJ » repris du fichier Excel, mêmes colonnes */
export function MajLog({ rows, editable }: { rows: Row[]; editable: boolean }) {
  const { t, locale } = useI18n();
  const m = t.maj;
  const [q, setQ] = useState("");
  const [nature, setNature] = useState("");
  const [limit, setLimit] = useState(50);
  const natures = useMemo(() => [...new Set(rows.map((r) => r.nature).filter(Boolean) as string[])].sort(), [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (!nature || r.nature === nature) && (!q || matches(`${r.item ?? ""} ${r.detail ?? ""} ${r.reference ?? ""}`, q))),
    [rows, q, nature],
  );
  const options = useMemo(() => [...new Set(rows.map((r) => (r.item ?? "").split("\n")[0]).filter(Boolean))], [rows]);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="mr-auto">
          <h2 className="font-semibold">{m.title}</h2>
          <p className="text-xs text-stone-500">{m.intro}</p>
        </div>
        <div className="w-64">
          <SearchSuggest options={options} placeholder={t.common.search} submitOnPick={false} onValueChange={(v) => { setQ(v); setLimit(50); }} />
        </div>
        <select className="input w-44 py-2" value={nature} onChange={(e) => setNature(e.target.value)}>
          <option value="">{m.nature} : {t.common.all}</option>
          {natures.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <a className="btn-secondary py-2" href="/api/export/maj">{t.common.exportCsv}</a>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>{m.date}</th><th>{m.nature}</th><th>{m.item}</th><th>{m.detail}</th><th>{m.reference}</th><th className="min-w-56">{m.claim}</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.date ? fmtDate(r.date, locale) : ""}</td>
                <td>{r.nature}</td>
                <td className="whitespace-pre-wrap">{r.item}</td>
                <td className="whitespace-pre-wrap">{r.detail}</td>
                <td className="whitespace-pre-wrap text-stone-600">{r.reference}</td>
                <td>{editable ? <Claim id={r.id} initial={r.claim ?? ""} /> : r.claim}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="p-3 text-center">
          <button className="btn-secondary" onClick={() => setLimit((l) => l + 100)}>{m.more} ({filtered.length - limit})</button>
        </div>
      )}
    </section>
  );
}

function Claim({ id, initial }: { id: number; initial: string }) {
  const [v, setV] = useState(initial);
  const [, start] = useTransition();
  return <input className="input py-1.5 text-sm" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== initial && start(() => updateMajClaimAction(id, v))} />;
}
