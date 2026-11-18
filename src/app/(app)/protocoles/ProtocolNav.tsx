"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

interface P { id: number; title: string }

/** Menu des protocoles : les protocoles rédigés, puis les procédures (pages visuelles) */
export function ProtocolNav({ list, currentId, conformity, proc = null }: { list: P[]; currentId: number | null; conformity: boolean; proc?: string | null; editable?: boolean }) {
  const { t } = useI18n();
  const p = t.protocols;
  const link = (href: string, on: boolean, icon: string, label: string) => (
    <Link key={href} href={href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${on ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}>
      <Icon name={icon} className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
    </Link>
  );
  return (
    <nav className="no-print card h-fit p-2">
      <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">{p.procedures}</p>
      {link("/protocoles?id=proc-reception", proc === "reception", "truck", p.procReception)}
      {link("/protocoles?id=proc-reclamation", proc === "reclamation", "inbox", p.procClaim)}
      {link("/protocoles?id=conformite", conformity, "check", p.conformity)}
      {link("/protocoles?id=proc-reglementation", proc === "reglementation", "file", p.procRegulation)}
      {list.length > 0 && (
        <>
          <div className="my-1 border-t border-stone-100" />
          <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">{p.title}</p>
          {list.map((x) => link(`/protocoles?id=${x.id}`, currentId === x.id, "book", x.title))}
        </>
      )}
    </nav>
  );
}
