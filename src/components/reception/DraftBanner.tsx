"use client";
import { appConfirm } from "@/components/Confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { getOutbox, loadDraft, syncOutbox } from "@/lib/client/offline";
import type { Draft } from "@/lib/reception-types";
import { Icon } from "../Icon";

/** Boutons « Nouvelle réception » / « Reprendre » + envoi des réceptions gardées hors ligne */
export function DraftBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => setDraft(d && (d.supplierName || d.lines.length || d.blPhotos.length) ? d : null));
    const sync = async () => {
      if ((await getOutbox()).length === 0) return;
      setSyncing(true);
      const left = await syncOutbox();
      setPending(left);
      setSyncing(false);
      router.refresh();
    };
    getOutbox().then((o) => setPending(o.length));
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [router]);

  return (
    <div className="no-print mb-4 space-y-2">
      {pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex items-center gap-2"><Icon name="cloudOff" /> <strong>{pending}</strong> {t.receptions.pendingSync}</span>
          <button
            className="btn-secondary py-1.5"
            disabled={syncing}
            onClick={async () => { setSyncing(true); setPending(await syncOutbox()); setSyncing(false); router.refresh(); }}
          >
            {syncing ? t.common.loading : t.receptions.syncNow}
          </button>
        </div>
      )}
      {/* Une ligne par type de fiche : bouton « nouvelle » + la fiche / le bon en cours sur le téléphone, à reprendre */}
      {([
        { kind: "livraison" as const, href: "/receptions/new?new=1", resume: "/receptions/new", label: t.receptions.new, icon: <Icon name="plus" />, cls: "btn-primary", tag: t.wizard.inProgressFiche, tone: "border-brand-200 bg-brand-50 text-brand-800" },
        { kind: "reprise" as const, href: "/receptions/new?new=1&kind=reprise", resume: "/receptions/new?kind=reprise", label: t.returnSlip.button, icon: <span aria-hidden>↩</span>, cls: "btn-primary !bg-amber-500 hover:!bg-amber-600", tag: t.wizard.inProgressBr, tone: "border-amber-300 bg-amber-50 text-amber-900" },
      ]).map((row) => {
        const cur = draft && (draft.kind ?? "livraison") === row.kind ? draft : null;
        return (
          <div key={row.kind} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <Link href={row.href} className={`${row.cls} btn-lg w-full justify-start sm:w-auto sm:min-w-[16rem]`}>{row.icon} {row.label}</Link>
            {cur && (
              <Link href={row.resume} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm sm:flex-1 ${row.tone}`}>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-80">{row.tag}</span>
                  <span className="block truncate font-semibold">{cur.supplierName || "—"}{cur.lines.length ? ` · ${cur.lines.length} ${t.returnSlip.products}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-semibold underline">{t.wizard.resumeLine} <Icon name="chevronRight" className="h-4 w-4" /></span>
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DeleteDraftButton({ id, confirmText, label }: { id: number; confirmText: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-ghost p-1.5 text-stone-400 hover:text-red-600"
      aria-label={label}
      disabled={busy}
      onClick={async () => {
        if (!await appConfirm(confirmText)) return;
        setBusy(true);
        await fetch(`/api/drafts/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      <Icon name="trash" className="h-4 w-4" />
    </button>
  );
}
