"use client";
import { DateField } from "@/components/DateField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followUpTodayAction, moveAnomalyAction, setAnomalyReviewAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { appAlert, appConfirm } from "@/components/Confirm";
import { MoneyInput } from "@/components/MoneyInput";

export const REVIEWS = ["a_verifier", "verifiee", "a_voir"] as const;
export const reviewStyles: Record<string, string> = {
  a_verifier: "border-amber-400 bg-amber-50 text-amber-900",
  verifiee: "border-emerald-500 bg-emerald-50 text-emerald-800",
  a_voir: "border-sky-400 bg-sky-50 text-sky-900",
};

/** Contrôle de la fiche par l'utilisateur : À vérifier / Vérifiée / À voir (un nouveau clic efface) */
export function ReviewButtons({ id, value, editable }: { id: number; value: string | null; editable: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [cur, setCur] = useState(value);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-stone-500">{t.sheet.reviewLabel} :</span>
      {REVIEWS.map((r) => (
        <button
          key={r}
          type="button"
          disabled={!editable || pending}
          onClick={() => { const next = cur === r ? "" : r; setCur(next || null); start(async () => { try { await setAnomalyReviewAction(id, next); router.refresh(); } catch { setCur(value); await appAlert(t.sheet.saveFailed); } }); }}
          className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition ${cur === r ? reviewStyles[r] : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}
        >
          {t.sheet.reviews[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * Carte de la fiche : prochaine étape et gros boutons d'action. Chaque bouton fait avancer le statut
 * et note la date de dernière action ; « Avoir reçu » demande le montant puis clôture.
 */
export function ActionCard({ id, stage, resolution, editable, claimed, mailHref, phone, supplier, nextDate, missingBl = false }: {
  missingBl?: boolean; id: number; stage: string; resolution: string | null; editable: boolean; claimed: string; mailHref: string; phone: string; supplier: string; nextDate: string | null;
}) {
  const { t } = useI18n();
  const s = t.sheet;
  const c = s.card;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [credit, setCredit] = useState<null | { amount: string; number: string; date: string; kind: string }>(null);
  // Chaque action dit si elle a échoué (connexion, droits…) au lieu de ne rien faire
  const run = (fn: () => Promise<unknown>) => start(async () => {
    try {
      const res = (await fn()) as { error?: string } | undefined;
      if (res && typeof res === "object" && "error" in res && res.error) await appAlert(`${t.common.error} : ${res.error}`);
      router.refresh();
    } catch { await appAlert(t.sheet.saveFailed); }
  });
  const follow = (note: string) => run(() => followUpTodayAction(id, note));
  const close = async (res: "sans_suite" | "livraison" | "retour") => { if (await appConfirm(res === "sans_suite" ? c.confirmNoFollow : res === "retour" ? c.confirmReturn : c.confirmDelivery)) run(() => moveAnomalyAction(id, "cloturee", res)); };

  const next =
    stage === "a_traiter" ? `${c.nextClaim} ${supplier}. ${c.nextClaimMail}`
    : stage === "reclamee" ? `${c.nextWait}${nextDate ? ` ${c.nextFollowOn} ${nextDate}` : ""}.`
    : stage === "a_verifier" ? (missingBl ? c.nextVerifyBl : c.nextVerify)
    : stage === "cloturee" ? `${c.closed} : ${resolution ? t.resolutions[resolution as "avoir"] : "—"}.`
    : c.cancelled;
  const big = "rounded-xl px-5 py-3 text-base font-semibold min-h-[48px] disabled:opacity-50";
  const primary = `${big} bg-brand-600 text-white hover:bg-brand-700`;
  const secondary = `${big} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`;
  const ghost = `${big} text-stone-500 hover:bg-stone-100`;
  const open = stage === "a_traiter" || stage === "reclamee" || stage === "a_verifier";

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-brand-900">
        <span aria-hidden="true" className="text-lg">➜</span>
        <p className="text-[15px] leading-relaxed"><strong>{c.nextStep} :</strong> {next}</p>
      </div>
      {editable && open && !credit && (
        <div className="flex flex-wrap gap-2.5">
          {stage === "a_traiter" && (
            <a href={mailHref} className={`${primary} inline-flex items-center`} onClick={() => follow(c.mailSent)}>✉ {c.sendClaim}</a>
          )}
          {stage === "a_traiter" && <button type="button" className={secondary} disabled={pending} onClick={() => follow(c.called)}>☎ {c.iCalled}</button>}
          {stage !== "a_traiter" && <button type="button" className={secondary} disabled={pending} onClick={() => follow(c.followed)}>↻ {c.iFollowed}</button>}
          {/* Bon de livraison manquant : pas d'avoir, on note que le BL est arrivé (simple indication, le BL reste à vérifier) */}
          {missingBl ? (
            stage !== "a_verifier" && <button type="button" className={stage === "a_traiter" ? secondary : primary} disabled={pending} onClick={() => run(async () => { await followUpTodayAction(id, c.blReceivedNote); await moveAnomalyAction(id, "a_verifier"); })}>📄 {c.blReceived}</button>
          ) : (
            <button type="button" className={stage === "a_traiter" ? secondary : primary} disabled={pending} onClick={() => setCredit({ amount: claimed, number: "", date: new Date().toISOString().slice(0, 10), kind: "avoir" })}>€ {c.creditReceived}</button>
          )}
          {stage !== "a_traiter" && <button type="button" className={secondary} disabled={pending} onClick={() => close("livraison")}>{t.resolutions.livraison}</button>}
          {!missingBl && <button type="button" className={secondary} disabled={pending} onClick={() => close("retour")}>{t.resolutions.retour}</button>}
          <button type="button" className={ghost} disabled={pending} onClick={() => close("sans_suite")}>{t.resolutions.sans_suite}</button>
          {phone && <a href={`tel:${phone}`} className={`${ghost} inline-flex items-center`}>☎ {phone}</a>}
        </div>
      )}
      {editable && !open && (
        <button type="button" className={secondary} disabled={pending} onClick={async () => { if (await appConfirm(c.confirmReopen)) run(() => moveAnomalyAction(id, "reclamee")); }}>{c.reopen}</button>
      )}
      {credit && (
        <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-4">
          <div className="flex flex-wrap gap-2 sm:col-span-4">
            {(["avoir", "facture"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setCredit({ ...credit, kind: k })} className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${credit.kind === k ? "border-emerald-600 bg-white text-emerald-800" : "border-stone-200 bg-white text-stone-500"}`}>{s.creditKinds[k]}</button>
            ))}
          </div>
          <label><span className="label">{s.creditAmount} *</span><MoneyInput value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} /></label>
          <label><span className="label">{credit.kind === "facture" ? s.invoiceNumber : s.creditNumber}</span><input className="input" value={credit.number} onChange={(e) => setCredit({ ...credit, number: e.target.value })} /></label>
          <label><span className="label">{credit.kind === "facture" ? s.invoiceDate : s.creditDate}</span><DateField today value={credit.date} onChange={(x) => setCredit({ ...credit, date: x })} /></label>
          <div className="flex items-end gap-2">
            <button type="button" className="btn-primary" disabled={pending || !credit.amount.trim()} onClick={() => run(async () => { await updateAnomalyAction(id, { stage: "cloturee", resolution: "avoir", creditAmount: credit.amount, creditNumber: credit.number, creditDate: credit.date, creditKind: credit.kind, lastActionAt: new Date().toISOString().slice(0, 10) }); setCredit(null); })}>{c.closeWithCredit}</button>
            <button type="button" className="btn-ghost" onClick={() => setCredit(null)}>{t.common.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
