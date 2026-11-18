import { Icon } from "@/components/Icon";

/**
 * Procédures visuelles (Protocoles > Procédures) : réception, réclamation, conformité des produits.
 * Mises à jour avec l'application (voir CLAUDE.md), comme le schéma de l'application.
 */

type Step = { title: string; icon: string; you: string[]; app?: string[]; block?: string };

function Header({ title, intro, meta }: { title: string; intro: string; meta: [string, string][] }) {
  return (
    <header className="mb-8 space-y-3">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-stone-600">{intro}</p>
      <div className="flex flex-wrap gap-2">
        {meta.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm">
            <span className="text-stone-500">{k}</span> <span className="font-medium">{v}</span>
          </span>
        ))}
      </div>
      <p className="text-xs font-medium text-brand-700">Mise à jour automatiquement</p>
    </header>
  );
}

/** Frise verticale : un nœud numéroté par étape, deux colonnes « Vous » / « L'application » */
function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4">
          <div className="flex flex-col items-center">
            <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm ring-4 ring-brand-50">{i + 1}</span>
            {i < steps.length - 1 && <span className="w-0.5 flex-1 bg-gradient-to-b from-brand-300 to-stone-200" />}
          </div>
          <div className="mb-2 min-w-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
              <Icon name={s.icon} className="h-5 w-5 text-brand-600" />
              <h3 className="font-semibold">{s.title}</h3>
            </div>
            <div className={`grid gap-px bg-stone-100 ${s.app ? "md:grid-cols-2" : ""}`}>
              <div className="bg-white p-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-700">Vous</p>
                <ul className="space-y-1.5 text-sm">
                  {s.you.map((x) => <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{x}</li>)}
                </ul>
              </div>
              {s.app && (
                <div className="bg-sky-50/60 p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-700">L'application</p>
                  <ul className="space-y-1.5 text-sm text-stone-700">
                    {s.app.map((x) => <li key={x} className="flex gap-2"><span className="mt-1 text-sky-600">↻</span>{x}</li>)}
                  </ul>
                </div>
              )}
            </div>
            {s.block && <p className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700"><Icon name="alert" className="h-3.5 w-3.5" /> {s.block}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Problems({ items }: { items: [string, string][] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-bold">Si ça coince</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="font-semibold">{k}</p>
            <p className="mt-1 text-sm text-stone-600">{v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Réception ---------------------------------------------------------------- */

const RECEPTION: Step[] = [
  { title: "Photos et signatures", icon: "camera", you: ["Photo du BL ou de la facture, à plat, une par page (ou « Pas de BL »)", "Photo de l'étiquette (lot, DLC) des produits frais", "Signature du livreur, ou « Livreur parti sans signer »", "Votre signature"], app: ["Lit le BL : fournisseur, N° et produits pré-remplis"], block: "Pas d'étape 2 sans signature du livreur ou case cochée" },
  { title: "La livraison", icon: "truck", you: ["Vérifier le fournisseur, la date et le N° du document", "Relever la T° du camion et noter s'il est propre"], app: ["Enregistre un brouillon", "Refuse un N° de document déjà saisi"] },
  { title: "Les produits", icon: "thermo", you: ["Compter ou peser : Q contrôlée", "T° à cœur des produits frais et surgelés", "DLC et lot (viandes, poissons, surgelés)", "Prix unitaire", "Vérifier la décision : Acceptée ou Refus (motif + photo)"], app: ["Propose Acceptée ou Refus selon les seuils", "Signale les écarts de quantité et de prix"], block: "Pas d'enregistrement sans prix, décision ou DLC obligatoire" },
  { title: "La validation", icon: "check", you: ["Relire le récapitulatif", "Recopier le texte des réserves sur le BL", "« Enregistrer la réception »"], app: ["Crée les anomalies et met à jour les prix", "Enregistre même sans réseau"] },
];

export function ReceptionProcedure() {
  return (
    <div>
      <Header
        title="Procédure de réception"
        intro="Une livraison en 4 étapes sur le téléphone. L'application vous guide et vous bloque, avec un message, si quelque chose manque."
        meta={[["Pour qui", "toute personne qui réceptionne"], ["Où", "Réceptions › Nouvelle réception"], ["Durée", "5 à 10 min"]]}
      />
      <Timeline steps={RECEPTION} />
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <Icon name="cloudOff" className="mt-0.5 h-5 w-5 shrink-0" />
        <p><strong>Chaque soir à 23 h</strong>, la fiche de réception du jour est exportée et les bons sont consolidés : ils ne sont plus modifiables.</p>
      </div>
      <Problems
        items={[
          ["Pas de BL", "« Pas de BL / saisie manuelle » à l'étape 1 : une anomalie BL manquant est créée."],
          ["Le livreur est parti", "Cocher « Livreur parti sans signer »."],
          ["Produit trop chaud, DLC dépassée, emballage abîmé", "Refus + motif + photo. Le livreur reprend le produit, on l'écrit sur le BL."],
          ["Produit manquant ou en trop", "Saisir la quantité réellement livrée : l'écart est réclamé automatiquement."],
          ["Pas de réseau", "Terminer quand même : la réception part dès que le réseau revient."],
          ["Je dois m'interrompre", "« Enregistrement brouillon » : le brouillon reste dans le tableau des réceptions."],
          ["Erreur vue après coup", "Corriger avant 23 h. Après, le bon est consolidé : prévenir le responsable."],
        ]}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Réclamation ---------------------------------------------------------------- */

const STATUS: { label: string; color: string }[] = [
  { label: "À traiter", color: "bg-red-100 text-red-800 ring-red-200" },
  { label: "Réclamée", color: "bg-amber-100 text-amber-900 ring-amber-200" },
  { label: "À vérifier sur facture", color: "bg-sky-100 text-sky-800 ring-sky-200" },
  { label: "Clôturée", color: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
];

const CLAIMS: Step[] = [
  { title: "Nouvelle anomalie · À traiter", icon: "alert", you: ["Ouvrir la fiche depuis l'Accueil ou le tableau de bord", "Vérifier le montant réclamé et le type de suivi"], app: ["Crée l'anomalie à la réception, avec photo et montant", "Affiche le process du fournisseur (encadré orange)"] },
  { title: "Réclamer · Réclamée", icon: "inbox", you: ["Suivre le process du fournisseur : bouton mail, téléphone…", "Passer l'anomalie en « Réclamée »"], app: ["Prépare le mail avec l'adresse « Réclamation » du fournisseur"] },
  { title: "Relancer", icon: "layers", you: ["Sans réponse : relancer le fournisseur", "Cliquer « Relancé aujourd'hui »"], app: ["Rappel sur l'Accueil après le délai du fournisseur (3 jours par défaut)"] },
  { title: "Vérifier · À vérifier sur facture", icon: "search", you: ["L'avoir ou la régularisation est annoncé : le contrôler sur la facture"], app: ["Rappel des avoirs et factures à vérifier"] },
  { title: "Clôturer · Clôturée", icon: "check", you: ["Choisir la résolution", "Avoir : saisir le montant, le N° et la date"], app: ["Compte l'économie dans Reporting › Économies"] },
];

export function ClaimProcedure() {
  return (
    <div>
      <Header
        title="Procédure de réclamation"
        intro="Chaque anomalie avance de gauche à droite jusqu'à sa clôture. L'Accueil vous dit chaque jour quoi traiter."
        meta={[["Pour qui", "l'économe"], ["Quand", "chaque jour, 5 minutes"], ["Où", "Accueil et Anomalies"]]}
      />
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {STATUS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${s.color}`}>{s.label}</span>
            {i < STATUS.length - 1 && <span className="text-xl text-stone-300">→</span>}
          </div>
        ))}
      </div>
      <Timeline steps={CLAIMS} />

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5">
          <h2 className="mb-3 text-lg font-bold">Chaque jour</h2>
          <ul className="space-y-2 text-sm">
            {["Ouvrir l'Accueil", "Relancer les « Réclamations à relancer »", "Réclamer les « Anomalies à traiter »", "Contrôler les « Avoirs / factures à vérifier »", "Saisir les avoirs reçus et clôturer"].map((x) => (
              <li key={x} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded border-2 border-brand-500" />{x}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Quel suivi choisir ?</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold">Réclamation avec relances</span> : il faut contacter et relancer le fournisseur.</p>
            <p><span className="font-semibold">Vérification de l'avoir - avec réclamation</span> : la réclamation est faite (souvent sur le BL), il reste à vérifier l'avoir.</p>
            <p><span className="font-semibold">Vérification de l'avoir - sans réclamation</span> : le fournisseur régularise seul ; rappel après 7 jours (à traiter) ou 15 jours (à vérifier).</p>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Comment clôturer</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Avoir / régularisation", "Montant, avoir ou facture, N° et date", "Compte dans les économies (si réclamé)", true],
            ["Livraison différée", "Rien de plus à saisir", "Compte dans les économies (montant réclamé)", true],
            ["Sans suite", "Rien de plus à saisir", "Ne compte pas", false],
          ].map(([k, a, b, ok]) => (
            <div key={k as string} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="font-semibold">{k}</p>
              <p className="mt-1 text-sm text-stone-600">{a}</p>
              <p className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{b}</p>
            </div>
          ))}
        </div>
      </section>
      <Problems
        items={[
          ["Le fournisseur a une procédure particulière", "Elle s'affiche sur la fiche (encadré orange) ; elle se modifie dans le compte du fournisseur."],
          ["Pas d'adresse mail de réclamation", "L'ajouter dans le compte du fournisseur, bloc « Réclamation »."],
          ["Quantité livrée en trop", "C'est une information : elle ne compte pas dans les économies."],
          ["Plusieurs anomalies pour un même avoir", "Les regrouper sous un même N° de réclamation."],
        ]}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Conformité : schéma ---------------------------------------------------------------- */

const CHECKS: { q: string; ko: string }[] = [
  { q: "T° du camion dans la limite ?", ko: "Refus des produits frais" },
  { q: "T° à cœur du produit dans la limite (seuil + marge) ?", ko: "Refus" },
  { q: "DLC non dépassée ?", ko: "Refus" },
  { q: "Emballage intact, étiquette lisible, aspect et odeur normaux ?", ko: "Refus + motif + photo" },
];

export function ConformityFlow() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mx-auto flex max-w-md flex-col items-stretch">
          <div className="rounded-xl bg-stone-800 px-4 py-2.5 text-center text-sm font-semibold text-white">Le produit arrive</div>
          {CHECKS.map((c) => (
            <div key={c.q} className="flex flex-col items-stretch">
              <div className="mx-auto h-5 w-0.5 bg-stone-300" />
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl border-2 border-stone-200 bg-stone-50 px-4 py-3 text-center text-sm font-medium">{c.q}</div>
                <span className="text-xs font-semibold text-red-600">Non →</span>
                <span className="w-28 shrink-0 rounded-lg bg-red-100 px-2 py-1.5 text-center text-xs font-semibold text-red-800">{c.ko}</span>
              </div>
              <span className="mx-auto mt-1 text-[11px] font-semibold text-emerald-700">Oui ↓</span>
            </div>
          ))}
          <div className="mx-auto h-4 w-0.5 bg-stone-300" />
          <div className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white">Acceptée</div>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">Quantités et prix</p>
          <p className="mt-1">Un manque, un surplus ou un prix trop élevé n'empêchent pas d'accepter : l'écart est noté sur le BL et réclamé automatiquement.</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <p className="font-semibold">DLC courte</p>
          <p className="mt-1 text-stone-600">À 2 jours ou moins : le produit est accepté, la date est signalée.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">En cas de doute : refusez</p>
          <p className="mt-1">Un refus se règle avec le fournisseur ; un produit douteux en cuisine ne se rattrape pas.</p>
        </div>
        <p className="px-1 text-xs text-stone-500">L'application propose Acceptée ou Refus à partir de vos relevés ; vous gardez le dernier mot.</p>
      </aside>
    </section>
  );
}
