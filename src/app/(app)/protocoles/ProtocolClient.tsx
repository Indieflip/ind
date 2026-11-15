"use client";
import { appConfirm } from "@/components/Confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProtocolAction, saveProtocolAction } from "@/lib/actions/protocols";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

/** Affichage simple : « ## » = titre, « • » / « - » / « * » = puce, ligne finissant par « : » = sous-titre */
export function ProtocolView({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let table: string[][] = [];
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...body] = table;
    blocks.push(
      <div key={blocks.length} className="mb-3 overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs text-stone-600"><tr>{head.map((c, i) => <th key={i} className="px-2 py-1.5">{c}</th>)}</tr></thead>
          <tbody>{body.map((r, i) => <tr key={i} className="border-t border-stone-100 align-top">{r.map((c, j) => <td key={j} className="whitespace-pre-line px-2 py-1.5">{c.replace(/ \/\/ /g, "\n")}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    table = [];
  };
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="mb-3 ml-5 list-disc space-y-1 text-stone-800">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("|")) { flush(); table.push(line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); continue; }
    flushTable();
    const bullet = /^[•\-*]\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (!line) continue;
    const h = /^#{1,3}\s+(.*)$/.exec(line);
    if (h) blocks.push(<h2 key={blocks.length} className="mb-2 mt-5 text-lg font-bold text-brand-700 first:mt-0">{h[1]}</h2>);
    else if (line.endsWith(":")) blocks.push(<h3 key={blocks.length} className="mb-1 mt-3 font-semibold">{line}</h3>);
    else blocks.push(<p key={blocks.length} className="mb-2 text-stone-800">{line}</p>);
  }
  flush();
  flushTable();
  return <div className="max-w-3xl">{blocks}</div>;
}

export function ProtocolEditor({ id, title, content }: { id: number | null; title: string; content: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [ti, setTi] = useState(title);
  const [co, setCo] = useState(content);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3 p-5">
      <label className="block"><span className="label">{t.protocols.name}</span><input className="input text-lg font-semibold" value={ti} onChange={(e) => setTi(e.target.value)} /></label>
      <div className="grid gap-4 xl:grid-cols-2">
        <label className="block">
          <span className="label">{t.protocols.content}</span>
          <textarea className="input min-h-96 font-mono text-sm" value={co} onChange={(e) => setCo(e.target.value)} />
          <span className="mt-1 block text-xs text-stone-500">{t.protocols.formatHint}</span>
        </label>
        <div className="hidden rounded-lg border border-dashed border-stone-300 p-4 xl:block"><ProtocolView content={co} /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!ti.trim() || pending} onClick={() => start(async () => {
          const r = await saveProtocolAction(id, ti, co);
          if (r.id) router.push(`/protocoles?id=${r.id}`);
        })}>
          <Icon name="check" className="h-4 w-4" /> {t.common.save}
        </button>
        <button className="btn-ghost" onClick={() => router.push(id ? `/protocoles?id=${id}` : "/protocoles")}>{t.common.cancel}</button>
        {id && (
          <button className="btn-ghost ml-auto text-red-600" disabled={pending} onClick={async () => await appConfirm(t.protocols.deleteConfirm) && start(async () => { await deleteProtocolAction(id); router.push("/protocoles"); })}>
            <Icon name="trash" className="h-4 w-4" /> {t.common.delete}
          </button>
        )}
      </div>
    </div>
  );
}
