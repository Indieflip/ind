"use client";
import { Icon } from "./Icon";

/**
 * Schéma des étapes de l'application (Dev > Développement commercial > Marché).
 * Mis à jour à chaque évolution de l'application, comme Dev > Développement (voir CLAUDE.md).
 */
const PHONE_STEPS: { title: string; items: string[]; gate?: string; auto?: string }[] = [
  {
    title: "1. Livraison",
    items: ["Photo du BL / facture lue automatiquement (ou « Pas de BL »)", "Fournisseur, date et heure", "Numéro document : BL, facture, bon reprise / retour (doublon refusé)", "T° du camion, propreté du véhicule"],
    auto: "Brouillon enregistré automatiquement",
  },
  {
    title: "2. Contrôle des produits",
    items: ["Q facturée, Q contrôlée, unité", "T° produit, DLC / DDM, lot, note", "Photo de l'étiquette (lot / DLC) par produit dont la nature la demande", "Prix unitaire (obligatoire)", "Acceptée / Refus proposé automatiquement", "Refus et / ou Retour : motif (= type d'anomalie), quantité + unité"],
  },
  {
    title: "3. Validation",
    items: ["Récapitulatif", "Texte des réserves à recopier sur le BL", "Enregistrement (hors ligne possible)"],
    gate: "Pas d'enregistrement sans prix, décision ou DLC obligatoire ; une fois l'info complétée, la fiche s'enregistre sans refaire les étapes",
  },
];

const AUTO: { title: string; items: string[] }[] = [
  { title: "Anomalies créées", items: ["Refus, retour marchandise, manque, quantité en trop", "Bon de reprise BR (même formulaire, 3 étapes) : chaque produit repris → fiche d'anomalie du type du motif, en attente d'avoir, ou mise à jour de celle de la livraison d'origine", "T° au-delà du seuil + marge, DLC dépassée", "Prix ≥ +10 % au-dessus du mercurial, prix bloqué", "Véhicule sale, BL manquant"] },
  { title: "Prix et mercurial", items: ["Mercurial mis à jour avec le prix du bon", "Variation de prix enregistrée", "Historique du Mercurial repris dans le Suivi des prix"] },
  { title: "Pesée et suivis", items: ["Écarts de pesée (au kg, tares et perte acceptable du produit déduites), une anomalie « Écart de pesée » par bon", "Suivi viande / poisson, boulangerie", "N° d'anomalie et de réclamation"] },
];

const STAGES: { label: string; text: string; color: string }[] = [
  { label: "À traiter", text: "Créée, rien n'est encore fait", color: "border-t-red-500" },
  { label: "En attente", text: "Réclamation envoyée (mail Outlook regroupant les fiches du fournisseur, ou téléphone) ; retour fournisseur, avoir / régul, livraison ou retour marchandise ; relance au délai du fournisseur ; « En attente de » (retour fournisseur, avoir, livraison, retour marchandise, vérification facturation) visible d'un coup d'œil sur la fiche et dans les listes", color: "border-t-amber-500" },
  { label: "Clôturée", text: "Avec sa résolution", color: "border-t-brand-600" },
];

const NIGHT: { when: string; title: string; text: string }[] = [
  { when: "23 h", title: "Export automatique de la fiche de réception", text: "Fiche des bons du jour, N° annuel, contenu figé, PDF et Excel." },
  { when: "23 h", title: "Consolidation des bons du jour", text: "Seules les fiches de réception sont figées (preuve pour un contrôle sanitaire) ; les fiches d'anomalie restent modifiables." },
  { when: "À la demande", title: "Export manuel", text: "Bons choisis librement, mention « Export manuel », ajouté à l'historique." },
  { when: "5 ans", title: "Archivage", text: "Exports supprimés après 5 ans ; avant, uniquement après export par l'administrateur." },
];

const PILOT: { title: string; items: string[]; planned?: boolean }[] = [
  { title: "Reporting", items: ["Économies obtenues et en attente", "Par fournisseur, mois, type", "Suivi des prix et évolution par mois", "Achats par fournisseur et par période", "Viandes et poissons"] },
  { title: "Mercurial et protocoles", items: ["Produits, prix min / max, prix bloqués", "Fiche produit : historique des prix et des anomalies, modifications du Mercurial, réceptions", "Procédures : réception (avant, contrôle avec refus et pesée, saisie), réclamation, réglementation", "Procédures rédigées par l'équipe"] },
  { title: "Commandes fournisseurs", items: ["Commande depuis le mercurial", "Lignes pré-remplies à la réception", "Commandé / livré / facturé"], planned: true },
];

function Section({ n, title, when, tone, children }: { n: number; title: string; when: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex flex-wrap items-baseline gap-2 text-lg font-bold">
        {n}. {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{when}</span>
      </h3>
      {children}
    </section>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-0.5 pl-4 text-sm text-stone-600">{items.map((x) => <li key={x}>{x}</li>)}</ul>
);

export function AppFlowContent() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-600" />Saisie sur téléphone</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky-600" />Automatique</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />Suivi au bureau</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-violet-500" />Chaque soir / prévu</span>
      </div>

      <Section n={1} title="La réception" when="Téléphone" tone="bg-brand-50 text-brand-700">
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PHONE_STEPS.map((s, i) => (
            <li key={s.title} className="relative space-y-2 rounded-xl border border-stone-200 bg-white p-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
              <h4 className="font-semibold">{s.title}</h4>
              <List items={s.items} />
              {s.auto && <p className="text-xs font-medium text-sky-700">{s.auto}</p>}
              {s.gate && <p className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{s.gate}</p>}
              {i < PHONE_STEPS.length - 1 && <span className="absolute -right-2.5 top-4 hidden font-bold text-stone-400 xl:block">→</span>}
            </li>
          ))}
        </ol>
      </Section>

      <Section n={2} title="À l'enregistrement" when="Automatique" tone="bg-sky-50 text-sky-700">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AUTO.map((c) => (
            <div key={c.title} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4"><h4 className="font-semibold">{c.title}</h4><List items={c.items} /></div>
          ))}
        </div>
      </Section>

      <Section n={3} title="Le suivi d'une anomalie" when="Bureau" tone="bg-amber-50 text-amber-800">
        <div className="flex flex-wrap items-stretch gap-2">
          {STAGES.map((s, i) => (
            <div key={s.label} className="flex min-w-0 flex-1 basis-40 items-stretch gap-2">
              <div className={`min-w-0 flex-1 rounded-lg border border-t-4 border-stone-200 bg-white p-3 ${s.color}`}>
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-stone-500">{s.text}</p>
              </div>
              {i < STAGES.length - 1 && <span className="self-center font-bold text-stone-400">→</span>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-brand-600 px-2.5 py-1 text-brand-700">Avoir / régularisation (montant, N°, date)</span>
          <span className="rounded-full border border-brand-600 px-2.5 py-1 text-brand-700">Livraison différée</span>
          <span className="rounded-full border border-stone-300 px-2.5 py-1 text-stone-600">Sans suite</span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">→ Économie justifiée dans Reporting</span>
        </div>
        <p className="text-sm text-stone-600">Rappels sur l'Accueil et en bandeau : réclamations à relancer, vérifications d'avoir sans réclamation après 7 jours (à traiter) ou 15 jours (à vérifier).</p>
      </Section>

      <Section n={4} title="Chaque soir" when="23 h" tone="bg-violet-50 text-violet-700">
        <div className="grid grid-cols-[auto_1fr] gap-x-4">
          {NIGHT.map((x, i) => (
            <div key={x.title} className="contents">
              <p className="whitespace-nowrap pt-0.5 text-sm font-bold text-violet-700">{x.when}</p>
              <div className={`border-l-2 border-stone-200 pl-4 ${i < NIGHT.length - 1 ? "pb-4" : ""}`}>
                <p className="font-semibold">{x.title}</p>
                <p className="text-sm text-stone-600">{x.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={5} title="Pour piloter" when="Bureau" tone="bg-stone-100 text-stone-700">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PILOT.map((c) => (
            <div key={c.title} className={`space-y-2 rounded-xl border p-4 ${c.planned ? "border-dashed border-violet-400 bg-violet-50" : "border-stone-200 bg-white"}`}>
              {c.planned && <p className="text-xs font-semibold text-violet-700">Prévu</p>}
              <h4 className="font-semibold">{c.title}</h4>
              <List items={c.items} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
