"use client";
import { appConfirm } from "@/components/Confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { clearDraft, getOutbox, loadDraft, syncOutbox } from "@/lib/client/offline";
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
      <div className="grid gap-2 sm:flex">
        {draft && (
          <Link href="/receptions/new" className="btn-primary btn-lg">
            <Icon name="truck" /> {t.receptions.resume}
            {draft.supplierName && <span className="font-normal opacity-80">· {draft.supplierName}</span>}
          </Link>
        )}
        <button
          className={`${draft ? "btn-secondary" : "btn-primary"} btn-lg`}
          onClick={async () => {
            if (draft) {
              if (!await appConfirm(t.wizard.discardConfirm)) return;
              await clearDraft();
            }
            router.push("/receptions/new?new=1");
          }}
        >
          <Icon name="plus" /> {t.receptions.new}
        </button>
      </div>
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
