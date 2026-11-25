"use client";
import { Paren } from "@/components/Paren";
import { claimMailHref, type MailFiche, type MailParts } from "@/lib/claimMail";
import { DateField } from "@/components/DateField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followUpTodayAction, groupClaimsAction, moveAnomalyAction, setAnomalyReviewAction, updateAnomalyAction } from "@/lib/actions/anomalies";
import { useI18n } from "@/lib/i18n/client";
import { WAITING } from "@/lib/anomaly";
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

/**
 * Carte de la fiche : prochaine étape et gros boutons d'action. Chaque bouton fait avancer le statut et note l'action dans l'historique.
 * À traiter : Envoyer la réclamation (Outlook, en regroupant les autres fiches « À traiter » du fournisseur), Téléphone, Avoir / Régul.
 * En attente : Avoir / Régul, Retour mail, Livraison différée, Retour marchandise (+ Téléphone, retour à « À traiter »).
 */
export function ActionCard({ id, stage, resolution, editable, claimed, phone, supplier, nextDate, missingBl = false, mail, self, others = [], waitingFor = null }: {
  waitingFor?: string | null; missingBl?: boolean; id: number; stage: string; resolution: string | null; editable: boolean; claimed: string; phone: string; supplier: string; nextDate: string | null;
  mail: MailParts; self: MailFiche; others?: MailFiche[];
}) {
  const { t } = useI18n();
  const s = t.sheet;
  const c = s.card;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [credit, setCredit] = useState<null | { amount: string; number: string; date: string; kind: string }>(null);
  // Champ de détail déplié : appel / SMS (Téléphone) ou réponse du fournisseur (Retour mail)
  const [note, setNote] = useState<null | { kind: "phone" | "mail" | "noFollow"; text: string }>(null);
  // Autres fiches « À traiter » du même fournisseur : cochées d'office pour partir dans la même réclamation
  const [withOthers, setWithOthers] = useState<number[]>(others.map((o) => o.id));
  // Chaque action dit si elle a échoué (connexion, droits…) au lieu de ne rien faire
  const run = (fn: () => Promise<unknown>) => start(async () => {
    try {
      const res = (await fn()) as { error?: string } | undefined;
      if (res && typeof res === "object" && "error" in res && res.error) await appAlert(`${t.common.error} : ${res.error}`);
      router.refresh();
    } catch { await appAlert(t.sheet.saveFailed); }
  });
  const follow = (text: string) => run(() => followUpTodayAction(id, text));
  const close = async (res: "sans_suite" | "livraison" | "retour") => { if (await appConfirm(res === "sans_suite" ? c.confirmNoFollow : res === "retour" ? c.confirmReturn : c.confirmDelivery)) run(() => moveAnomalyAction(id, "cloturee", res)); };
  const st = stage === "reclamee" || stage === "a_verifier" ? "en_attente" : stage;

  // Mail de réclamation : la fiche + les fiches cochées du même fournisseur, en un seul message
  const fiches = [self, ...others.filter((o) => withOthers.includes(o.id))];
  const fmt = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const mailHref = claimMailHref(mail, fiches);
  const sendClaim = () => run(async () => {
    const ids = fiches.map((f) => f.id);
    if (ids.length > 1) await groupClaimsAction(ids);
    for (const x of ids) await followUpTodayAction(x, c.mailSent);
  });

  const next =
    st === "a_traiter" ? `${c.nextClaim} ${supplier}. ${c.nextClaimMail}`
    : st === "en_attente" ? (missingBl ? c.nextVerifyBl : `${c.nextWait}${nextDate ? ` ${c.nextFollowOn} ${nextDate}` : ""}.`)
    : st === "cloturee" ? `${c.closed} : ${resolution ? t.resolutions[resolution as "avoir"] : "—"}.`
    : c.cancelled;
  const big = "rounded-xl px-5 py-3 text-base font-semibold min-h-[48px] disabled:opacity-50";
  const primary = `${big} bg-brand-600 text-white hover:bg-brand-700`;
  const secondary = `${big} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`;
  const ghost = `${big} text-stone-500 hover:bg-stone-100`;
  const open = st === "a_traiter" || st === "en_attente";
  const creditBtn = (cls: string) => missingBl
    ? <button type="button" className={cls} disabled={pending} onClick={() => run(async () => { await followUpTodayAction(id, c.blReceivedNote); await moveAnomalyAction(id, "en_attente"); })}>📄 {c.blReceived}</button>
    : <button type="button" className={cls} disabled={pending} onClick={() => setCredit({ amount: claimed, number: "", date: new Date().toISOString().slice(0, 10), kind: "avoir" })}>€ {c.creditRegul}</button>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-brand-900">
        <span aria-hidden="true" className="text-lg">➜</span>
        <p className="text-[15px] leading-relaxed"><strong>{c.nextStep} :</strong> {next}</p>
      </div>
      {/* En attente de quoi : visible d'un coup d'œil, modifiable d'un clic */}
      {st === "en_attente" && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-semibold text-amber-900">{t.waiting.label} :</span>
          {WAITING.map((w) => (
            <button key={w} type="button" disabled={!editable || pending} onClick={() => run(() => updateAnomalyAction(id, { waitingFor: w }))}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${waitingFor === w ? "border-amber-500 bg-amber-100 text-amber-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"}`}>
              {t.waiting[w]}
            </button>
          ))}
        </div>
      )}
      {/* Autres fiches à traiter chez ce fournisseur : regroupées dans la même réclamation (un seul mail) */}
      {editable && st === "a_traiter" && others.length > 0 && !credit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-1.5 font-semibold text-amber-900">{c.othersTitle.replace("{n}", String(others.length))}</p>
          <ul className="space-y-1">
            {others.map((o) => (
              <li key={o.id}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={withOthers.includes(o.id)} onChange={(e) => setWithOthers(e.target.checked ? [...withOthers, o.id] : withOthers.filter((x) => x !== o.id))} />
                  <span><Paren text={o.label} />{o.amount != null ? ` · ${fmt(o.amount)}` : ""}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-amber-800">{c.othersHint}</p>
        </div>
      )}
      {editable && open && !credit && !note && (
        <div className="flex flex-wrap gap-2.5">
          {st === "a_traiter" && (
            <a href={mailHref} target="_blank" rel="noreferrer" className={`${primary} inline-flex items-center`} onClick={sendClaim}>✉ {c.sendClaim}{fiches.length > 1 ? ` (${fiches.length})` : ""}</a>
          )}
          {st === "en_attente" && creditBtn(primary)}
          {st === "en_attente" && <button type="button" className={secondary} disabled={pending} onClick={() => setNote({ kind: "mail", text: "" })}>✉ {c.mailReply}</button>}
          {st === "en_attente" && <button type="button" className={secondary} disabled={pending} onClick={() => close("livraison")}>{t.resolutions.livraison}</button>}
          {st === "en_attente" && !missingBl && <button type="button" className={secondary} disabled={pending} onClick={() => close("retour")}>{t.resolutions.retour}</button>}
          <button type="button" className={secondary} disabled={pending} onClick={() => setNote({ kind: "phone", text: "" })}>☎ {c.phone}</button>
          {st === "a_traiter" && creditBtn(secondary)}
          {st === "en_attente" && <button type="button" className={ghost} disabled={pending} onClick={async () => { if (await appConfirm(c.confirmBackToDo)) run(() => moveAnomalyAction(id, "a_traiter")); }}>← {t.stages.a_traiter}</button>}
          <button type="button" className={ghost} disabled={pending} onClick={() => setNote({ kind: "noFollow", text: "" })}>{t.resolutions.sans_suite}</button>
          {phone && <a href={`tel:${phone}`} className={`${ghost} inline-flex items-center`}>☎ {phone}</a>}
        </div>
      )}
      {/* Téléphone / Retour mail : détail de l'appel, du SMS ou de la réponse du fournisseur, noté dans l'historique */}
      {editable && note && (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <label className="block">
            {note.kind === "noFollow" && <p className="mb-1 text-sm font-medium text-stone-800">{c.confirmNoFollow}</p>}
            <span className="label">{note.kind === "phone" ? c.phoneDetail : note.kind === "mail" ? c.mailReplyDetail : c.noFollowDetail}</span>
            <textarea autoFocus className="input" rows={3} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder={note.kind === "phone" ? c.phonePlaceholder : note.kind === "mail" ? c.mailReplyPlaceholder : c.noFollowPlaceholder} />
          </label>
          <div className="flex gap-2">
            {note.kind === "noFollow" ? (
              // Sans suite : le détail est noté dans l'historique, puis la fiche est clôturée
              <button type="button" className="btn-primary" disabled={pending} onClick={() => { const n = note; setNote(null); run(async () => { await followUpTodayAction(id, `${t.resolutions.sans_suite}${n.text.trim() ? ` : ${n.text.trim()}` : ""}`); await moveAnomalyAction(id, "cloturee", "sans_suite"); }); }}>{c.closeNoFollow}</button>
            ) : (
              <button type="button" className="btn-primary" disabled={pending} onClick={() => { const n = note; setNote(null); follow(`${n.kind === "phone" ? c.phone : c.mailReply}${n.text.trim() ? ` : ${n.text.trim()}` : ""}`); }}>{t.common.save}</button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setNote(null)}>{t.common.cancel}</button>
          </div>
        </div>
      )}
      {editable && !open && (
        <button type="button" className={secondary} disabled={pending} onClick={async () => { if (await appConfirm(c.confirmReopen)) run(() => moveAnomalyAction(id, "en_attente")); }}>{c.reopen}</button>
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
