/** Une fiche dans le mail : sa livraison (date, document) et ses produits (désignation, détail, montant) */
export interface MailFiche { id: number; label: string; delivery: string; doc: string; docDate: string; products: { name: string; detail: string; amount: number | null }[]; amount: number | null }
/** Textes du modèle de mail de réclamation */
export interface MailParts { to: string; subject: string; hello: string; intro: string; deliveryOf: string; docOf: string; total: string; ask: string; bye: string; signature: string; compose: string }

const fmt = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Mail de réclamation (modèle commun, adapté à tous les cas) :
 * une partie par livraison (date, BL / facture et sa date), chaque produit avec son détail et son montant, puis le total.
 */
export function claimMailHref(mail: MailParts, fiches: MailFiche[]) {
  // Livraisons dans l'ordre des dates (JJ/MM/AA)
  const key = (d: string) => { const m = /(\d{2})\/(\d{2})\/(\d{2,4})/.exec(d); return m ? `${m[3].slice(-2)}${m[2]}${m[1]}` : d; };
  const sorted = [...fiches].sort((a, b) => key(a.delivery).localeCompare(key(b.delivery)));
  const blocks = new Map<string, MailFiche["products"]>();
  for (const f of sorted) {
    const head = `${mail.deliveryOf} ${f.delivery}${f.doc ? ` (${f.doc}${f.docDate ? ` ${mail.docOf} ${f.docDate}` : ""})` : ""} :`;
    blocks.set(head, [...(blocks.get(head) ?? []), ...f.products]);
  }
  const total = fiches.reduce((x, f) => x + (f.amount ?? 0), 0);
  const body = [
    mail.hello, "", mail.intro, "",
    ...[...blocks].flatMap(([head, ps]) => [head, ...ps.flatMap((p) => [`- ${p.name}`, `  → ${p.detail}${p.amount != null ? ` – ${fmt(p.amount)}` : ""}`]), ""]),
    ...(total > 0 ? [`${mail.total} : ${fmt(total)}`, ""] : []),
    mail.ask, "", mail.bye, mail.signature,
  ].join("\n");
  return `${mail.compose}?to=${encodeURIComponent(mail.to)}&subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(body)}`;
}
