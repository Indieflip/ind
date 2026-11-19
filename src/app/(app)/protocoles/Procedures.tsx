import { Icon } from "@/components/Icon";
import { ContainersTable } from "./ContainersTable";

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
  { title: "Photos et signatures", icon: "camera", you: ["Réceptions › Nouvelle réception", "Photo du BL ou de la facture, bien à plat, entier et lisible, une photo par page (ou « Importer un fichier » : PNG, JPG, PDF)", "Pas de BL ? « Pas de BL / saisie manuelle »", "Photo de l'étiquette (lot, DLC) des produits frais", "Signature du livreur, ou « Livreur parti sans signer »", "Votre signature"], app: ["Lit le BL dès que la photo est confirmée : fournisseur, N° et produits pré-remplis", "Sans BL : crée une anomalie « BL manquant »"], block: "Pas d'étape 2 sans signature du livreur ou case cochée" },
  { title: "La livraison", icon: "truck", you: ["Vérifier le fournisseur proposé, la date, l'heure et le N° du document", "Relever la T° de la caisse du camion (frais et surgelés) et noter s'il est propre", "Rush de livraisons ? « Enregistrement brouillon » et reprise plus tard"], app: ["Enregistre un brouillon au passage à l'étape 2", "Refuse un N° de document déjà saisi"] },
  { title: "Les produits", icon: "thermo", you: ["Vérifier chaque ligne lue ; ajouter les produits manquants (recherche ou « Produit hors liste »)", "Compter, ou peser selon la procédure de pesée ci-dessous : Q contrôlée", "T° à cœur des produits frais et surgelés", "DLC et n° de lot (obligatoires pour viandes, poissons, surgelés)", "Prix unitaire HT", "Vérifier la décision : Acceptée ou Refus ; en cas de refus, motif + photo"], app: ["Propose Acceptée ou Refus selon les seuils (partie 2, Contrôler la livraison)", "Prix hors de la tranche du mercurial : variation de prix ; prix bloqué non respecté : anomalie", "Calcule les écarts de quantité et de poids"], block: "Pas d'enregistrement sans prix, décision ou DLC obligatoire" },
  { title: "La validation", icon: "check", you: ["Relire le récapitulatif (en-tête, produits, températures, prix)", "Compléter les températures manquantes si un bandeau le signale", "Recopier le texte des réserves sur le BL du livreur avant qu'il parte", "« Enregistrer la réception »"], app: ["Crée les anomalies et met à jour le mercurial et les prix", "Enregistre même sans réseau (envoi au retour du réseau)"] },
];

const BEFORE: [string, string, string][] = [
  ["layers", "Préparer la zone", "Dégager la zone de réception et mettre les palettes en place avant l'arrivée du camion."],
  ["alert", "Rien au sol", "Aucune marchandise n'est posée directement au sol : tout va sur les palettes ou les plans de travail."],
  ["truck", "Devant le livreur", "Contrôler la livraison avec lui, avant qu'il reparte."],
  ["thermo", "Le bon matériel", "Téléphone chargé, sonde propre, balance prête."],
  ["leaf", "Le frais d'abord", "Contrôler en premier les produits frais et surgelés, puis les ranger aussitôt."],
];

export const RECEPTION_TABS = [
  { key: "avant", label: "Avant de commencer" },
  { key: "livraison", label: "Contrôler la livraison" },
  { key: "saisie", label: "La saisie sur le téléphone" },
] as const;
export type ReceptionTab = (typeof RECEPTION_TABS)[number]["key"];

const WEIGH: { title: string; icon: string; items: string[] }[] = [
  { title: "Préparer la balance", icon: "gear", items: ["Balance de niveau et stable", "Affichage à zéro avant toute pesée", "Contrôle avec un poids de 5 kg"] },
  { title: "Peser", icon: "scale", items: ["Marchandise au centre du plateau", "Attendre que l'affichage soit stable avant de lire", "Poissons et produits sous glace : peser sans la glace, après égouttage (on ne paie pas la glace)", "Produits préemballés : peser un échantillon ; en moyenne, le lot doit atteindre le poids annoncé"] },
  { title: "Déduire la tare", icon: "box", items: ["Poids net = poids pesé − tares des contenants", "Tares : liste des contenants ci-dessous (en kg)"] },
  { title: "Saisir", icon: "edit", items: ["Q contrôlée = poids net, dans l'application", "Noter le poids sur le BL"] },
];

/** Partie repliable : titre + petite flèche ; le texte se déroule au clic */
function Fold({ n, title, open, children }: { n: number; title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details id={`partie-${n}`} open={open} className="group scroll-mt-20 border-b border-stone-200 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-left">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <span className="flex-1 text-lg font-bold">{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition group-open:rotate-90 group-hover:bg-stone-100">▸</span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

export function ReceptionProcedure({ containers, editable, tab, control }: { containers: Parameters<typeof ContainersTable>[0]["rows"]; editable: boolean; tab?: ReceptionTab; control: React.ReactNode }) {
  return (
    <div>
      <Header
        title="Procédure de réception"
        intro="Préparer, saisir sur le téléphone, peser, contrôler. L'application vous guide et vous bloque, avec un message, si quelque chose manque."
        meta={[["Pour qui", "toute personne qui réceptionne"], ["Où", "Réceptions › Nouvelle réception"], ["Durée", "5 à 10 min"]]}
      />
      <Fold n={1} title={RECEPTION_TABS[0].label} open={tab === "avant"}>
        <section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BEFORE.map(([icon, k, v]) => (
              <div key={k} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon name={icon} className="h-5 w-5" /></span>
                <div><p className="font-semibold">{k}</p><p className="text-sm text-stone-600">{v}</p></div>
              </div>
            ))}
          </div>
        </section>
      </Fold>

      <Fold n={2} title={RECEPTION_TABS[1].label} open={tab === "livraison"}>
        <div className="space-y-8">
          <ControlChecks />
          <RefusalCard />
      <WeighSection editable={editable} containers={containers} />
          {control}
        </div>
      </Fold>

      <Fold n={3} title={RECEPTION_TABS[2].label} open={tab === "saisie"}>
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
      </Fold>



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

/* ---------------------------------------------------------------- Contrôler la livraison ---------------------------------------------------------------- */

const CONTROLS: { icon: string; title: string; how: string; ko: string; tone: "red" | "amber" }[] = [
  { icon: "box", title: "Quantité", how: "Compter ou peser ce qui est livré et comparer à la quantité facturée sur le BL. Pour les produits au kg, peser comme indiqué dans « La pesée » ci-dessous.", ko: "Noter l'écart sur le BL : l'application crée l'anomalie et la réclamation.", tone: "amber" },
  { icon: "list", title: "Conformité à la commande", how: "Comparer ce qui est reçu à ce qui a été commandé : bon produit, bonne quantité.", ko: "Prévenir le chef ou le sous-chef.", tone: "amber" },
  { icon: "search", title: "Emballage et aspect", how: "Emballage intact, produit sain, étiquette lisible (n° de lot, DLC).", ko: "Refus, avec le motif et une photo.", tone: "red" },
  { icon: "thermo", title: "Température", how: "Produits frais : sonde à cœur. Surgelés : sonde glissée entre deux paquets, sans percer l'emballage.", ko: "Au-delà de la limite du tableau des seuils (ci-dessous) : refus.", tone: "red" },
  { icon: "file", title: "DLC", how: "Vérifier que la date laisse le temps de l'utilisation prévue.", ko: "DLC dépassée : refus. Trop courte pour l'utilisation prévue : refuser (l'application la signale).", tone: "red" },
];

export function ControlChecks() {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm">
        <span className="font-semibold">Ordre :</span>
        <span className="rounded-full bg-white px-3 py-1 font-medium shadow-sm">1. Frais et surgelés</span>
        <span className="text-stone-400">→</span>
        <span className="rounded-full bg-white px-3 py-1 font-medium shadow-sm">2. Le reste : épicerie, boissons, non alimentaire</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CONTROLS.map((c) => (
          <article key={c.title} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon name={c.icon} className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{c.how}</p>
              </div>
            </div>
            <div className={`mt-auto border-t px-4 py-2.5 text-sm ${c.tone === "red" ? "border-red-100 bg-red-50 text-red-800" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider">Si ça ne va pas</p>
              <p className="mt-0.5">{c.ko}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
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
          <p className="mt-1 text-stone-600">À 2 jours ou moins, la date est signalée. Trop courte pour l'utilisation prévue : refuser.</p>
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

/* ---------------------------------------------------------------- Réglementation ---------------------------------------------------------------- */

export function RegulationProcedure({ retentionYears, notes }: { retentionYears: number; notes?: React.ReactNode }) {
  const rules: { icon: string; tag: string; title: string; text: string; inApp: string }[] = [
    { icon: "book", tag: "Règlement (CE) 852/2004", title: "Hygiène : le contrôle à réception", text: "Le contrôle des marchandises à réception fait partie du plan de maîtrise sanitaire (PMS) de l'établissement.", inApp: "Fiche de réception exportée chaque soir, contrôles guidés à chaque livraison." },
    { icon: "thermo", tag: "Arrêté du 21 décembre 2009", title: "Températures de conservation", text: "Chaque denrée a une température maximale ; au-delà, le produit ne doit pas être accepté.", inApp: "Seuils et marges dans Procédures › Réception › Contrôler la livraison ; refus proposé automatiquement." },
    { icon: "list", tag: "Règlement (CE) 178/2002", title: "Traçabilité", text: "Conserver pour chaque produit reçu : le fournisseur, le produit, le n° de lot, la DLC et la date de réception.", inApp: "Lot, DLC, photos d'étiquettes et de BL enregistrés avec chaque réception." },
    { icon: "alert", tag: "Bonnes pratiques", title: "Refuser ce qui n'est pas conforme", text: "Produit hors température, DLC dépassée ou emballage abîmé : refusé, avec le motif noté sur le BL avant signature.", inApp: "Bouton Refus + motif + photo ; texte des réserves à recopier sur le BL." },
    { icon: "file", tag: "Code de commerce, art. L123-22", title: "Conservation des documents", text: "Les BL et factures sont des pièces comptables : 10 ans.", inApp: `Fiches de réception conservées ${retentionYears || 5} ans ; sauvegardes et exports PDF / Excel.` },
    { icon: "search", tag: "Contrôle sanitaire (DDPP)", title: "En cas de contrôle", text: "Présenter les fiches de réception, les relevés de températures, les lots et DLC, les refus et leurs motifs.", inApp: "Réceptions › Fiches de réception : export PDF / Excel immédiat." },
  ];
  return (
    <div>
      <Header
        title="Réglementation"
        intro="Les règles qui encadrent la réception des marchandises, et comment l'application vous aide à les respecter."
        meta={[["Pour qui", "responsables et économes"], ["Utile", "en cas de contrôle"]]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((r) => (
          <article key={r.title} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon name={r.icon} className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">{r.tag}</p>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{r.text}</p>
              </div>
            </div>
            <p className="mt-auto border-t border-sky-100 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-800"><span className="font-semibold">Dans l'application :</span> {r.inApp}</p>
          </article>
        ))}
      </div>
      {notes && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Vos notes</h2>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">{notes}</div>
        </section>
      )}
      <p className="mt-6 text-xs text-stone-500">Repères indicatifs, à valider avec votre plan de maîtrise sanitaire et vos obligations comptables.</p>
    </div>
  );
}

const REFUSAL: [string, string][] = [
  ["Noter le refus", "Sur le BL ou la facture, exemplaire du livreur et le nôtre : le produit, la quantité refusée et le motif."],
  ["Faire signer le livreur", "Sa signature à côté de la mention de refus."],
  ["Rendre le produit", "Le produit refusé est remis au livreur, qui le remporte."],
  ["Photographier", "Prendre le problème en photo (température, DLC, emballage abîmé…)."],
  ["Prévenir la cuisine", "Si le produit manque pour le service, prévenir le chef ou le sous-chef."],
];

/** Carte « Refus » : ce qu'on fait quand un produit est refusé à la livraison */
function RefusalCard() {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-red-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white"><Icon name="x" className="h-4 w-4" /></span>
        Refus d'un produit
      </h2>
      <p className="mb-3 text-sm text-red-900/80">Dès qu'un produit est refusé, devant le livreur :</p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {REFUSAL.map(([k, v], i) => (
          <li key={k} className="rounded-xl border border-red-100 bg-white p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{i + 1}</span>
              <p className="font-semibold">{k}</p>
            </div>
            <p className="text-sm text-stone-600">{v}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** « La pesée des produits au kg » : repères clés, 4 étapes, formule du poids net, liste des tares */
function WeighSection({ editable, containers }: { editable: boolean; containers: Parameters<typeof ContainersTable>[0]["rows"] }) {
  const facts: [string, string][] = [["Pour qui", "tout produit vendu au poids"], ["Tolérance", "10 g ou 0,10 €"], ["Au-delà", "écart de pesée réclamé, une anomalie par bon"]];
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50/70 to-white">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><Icon name="scale" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">La pesée des produits au kg</h2>
          <p className="text-sm text-stone-600">L'application compare le poids net au poids facturé.</p>
        </div>
      </div>
      <dl className="grid gap-px border-y border-amber-100 bg-amber-100 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-white/80 px-4 py-2.5">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{k}</dt>
            <dd className="text-sm font-medium text-stone-800">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {WEIGH.map((w, i) => (
          <li key={w.title} className="relative flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Icon name={w.icon} className="h-4 w-4" /></span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Étape {i + 1}</p>
                <p className="font-semibold leading-tight">{w.title}</p>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm text-stone-600">{w.items.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />{x}</li>)}</ul>
            {i < WEIGH.length - 1 && <span className="absolute -right-2.5 top-7 z-10 hidden h-5 w-5 items-center justify-center rounded-full border border-stone-200 bg-white text-xs text-stone-400 xl:flex">→</span>}
          </li>
        ))}
      </ol>
      <div className="mx-4 mb-4 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white sm:mx-5 sm:mb-5">
        <span className="rounded-md bg-amber-500 px-2 py-0.5">Poids net</span>=<span>poids pesé</span>−<span>tares des contenants</span>
      </div>
      <div className="border-t border-amber-100 bg-white p-2 sm:p-3">
        <ContainersTable editable={editable} rows={containers} />
      </div>
    </section>
  );
}
