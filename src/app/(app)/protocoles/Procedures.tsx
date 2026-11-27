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
  { title: "Photos et signatures", icon: "camera", you: ["Réceptions › Nouvelle réception", "Photo du BL ou de la facture, bien à plat, entier et lisible, une photo par page (ou « Importer un fichier » : PNG, JPG, PDF)", "Pas de BL ? « Pas de BL / saisie manuelle »", "Photo de l'étiquette (lot, DLC), conseillée pour les viandes, poissons et surgelés", "Signature du livreur, ou « Livreur parti sans signer »", "Votre signature"], app: ["Lit le BL dès que la photo est confirmée : fournisseur, N° et produits pré-remplis", "Sans BL : crée une anomalie « BL manquant »"] },
  { title: "La livraison", icon: "truck", you: ["Vérifier le fournisseur proposé, la date, l'heure et le N° du document", "Relever la T° de la caisse du camion (frais et surgelés) et noter s'il est propre", "Rush de livraisons ? « Enregistrement brouillon » et reprise plus tard"], app: ["Enregistre un brouillon au passage à l'étape 2", "Refuse un N° de document déjà saisi"] },
  { title: "Les produits", icon: "thermo", you: ["Vérifier chaque ligne lue ; ajouter les produits manquants (recherche ou « Produit hors liste »)", "Compter, ou peser selon la procédure de pesée ci-dessous : Q contrôlée", "T° à cœur des produits frais et surgelés", "DLC et n° de lot (obligatoires pour viandes, poissons, surgelés)", "Prix unitaire HT", "Quantité refusée ou retournée : boutons Refus et / ou Retour (quantité + unité), au-dessus de la conformité", "Vérifier la décision : Acceptée ou Refus ; en cas de refus, motif + photo"], app: ["Propose Acceptée ou Refus selon les seuils (partie 2, Contrôler la livraison)", "Prix hors de la tranche du mercurial : variation de prix ; prix bloqué non respecté : anomalie", "Calcule les écarts de quantité et de poids"], block: "Pas d'enregistrement sans prix, décision ou DLC obligatoire" },
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
  { label: "En attente", color: "bg-amber-100 text-amber-900 ring-amber-200" },
  { label: "Clôturée", color: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
];

const CLAIMS: Step[] = [
  { title: "Nouvelle anomalie · À traiter", icon: "alert", you: ["Ouvrir la fiche depuis l'Accueil ou le tableau de bord", "Vérifier le montant réclamé et le type de suivi"], app: ["Crée l'anomalie à la réception, avec photo et montant", "Affiche le process du fournisseur (encadré orange)"] },
  { title: "Réclamer · En attente", icon: "inbox", you: ["« Envoyer la réclamation » (Outlook) ou « Téléphone » (noter le détail de l'appel ou du SMS)", "Les autres fiches « À traiter » du fournisseur partent dans le même mail"], app: ["Prépare le mail avec l'adresse « Réclamation » du fournisseur, regroupe les fiches sous un même N° R, passe en « En attente »"] },
  { title: "Suivre · En attente", icon: "layers", you: ["Réponse du fournisseur : « Retour fournisseur » (noter la réponse)", "Sans réponse : relancer par « Téléphone » ; erreur : « ← À traiter »", "Indiquer « En attente de » : Retour fournisseur, Avoir / Régul, Livraison, Retour marchandise ou Vérification facturation"], app: ["Rappel sur l'Accueil après le délai du fournisseur (3 jours par défaut)"] },
  { title: "Clôturer · Clôturée", icon: "check", you: ["Avoir / Régul (montant, N°, date), Livraison différée, Retour marchandise ou Sans suite"], app: ["Compte l'économie dans Reporting › Économies"] },
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
            <p><span className="font-semibold">Avec relance</span> : la réclamation est faite (souvent sur le BL), il reste à vérifier l'avoir.</p>
            <p><span className="font-semibold">Sans relance</span> : le fournisseur régularise seul ; rappel après 7 jours (à traiter) ou 15 jours (à vérifier).</p>
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
  // Textes applicables à la réception en restauration : ce qu'ils imposent, et ce que fait l'application
  const texts: { ref: string; icon: string; title: string; text: string; inApp: string }[] = [
    { ref: "Règlement (CE) 178/2002, art. 18", icon: "list", title: "Traçabilité amont", text: "Identifier chaque fournisseur.", inApp: "Fournisseur, lot, DLC et photos du BL et de l'étiquette enregistrés à chaque réception." },
    { ref: "Règlement (CE) 852/2004", icon: "book", title: "Plan HACCP et enregistrements", text: "Enregistrements conservés « une période appropriée », durée fixée par les guides de bonnes pratiques.", inApp: `Fiche de réception exportée chaque soir et conservée ${retentionYears || 5} ans.` },
    { ref: "Arrêté du 21 décembre 2009", icon: "thermo", title: "Températures des produits d'origine animale", text: "+4 °C denrées très périssables, +8 °C périssables, +3 °C préparations à l'avance.", inApp: "Seuils et marges dans Réception › Contrôler la livraison ; Refus proposé automatiquement." },
    { ref: "Arrêté du 8 octobre 2013", icon: "leaf", title: "Températures des autres denrées", text: "Produits hors origine animale.", inApp: "Classe de température réglée par catégorie de produits." },
    { ref: "Règlement (CE) 37/2005", icon: "thermo", title: "Surgelés", text: "Températures en transport et en stockage ; relevés conservés au moins un an.", inApp: "T° du camion et T° produit relevées ; relevés conservés avec la fiche." },
    { ref: "Note DGAL 2017-425", icon: "search", title: "Contrôles officiels", text: "Contrôle des températures des denrées réfrigérées à la livraison.", inApp: "Chaque relevé est daté, signé et exportable." },
    { ref: "GBPH restaurateur, § 2.2", icon: "file", title: "Méthode du contrôle à réception", text: "Méthode recommandée et durées d'archivage.", inApp: "Procédure de réception guidée, étape par étape." },
  ];
  // Fiche conforme et minimale
  const sheet: [string, string][] = [
    ["Date et heure", "clock"], ["Fournisseur", "truck"], ["Produit", "box"], ["Température relevée", "thermo"], ["État de l'emballage", "box"],
    ["DLC et lot (ou photo de l'étiquette)", "camera"], ["Décision : acceptée / refusée", "check"], ["Action corrective", "alert"], ["Nom de la personne qui contrôle", "edit"],
  ];
  return (
    <div className="space-y-10">
      <Header
        title="Réglementation"
        intro="Les règles qui encadrent la réception des marchandises en restauration, et comment l'application vous aide à les respecter."
        meta={[["Pour qui", "responsables et économes"], ["Utile", "en cas de contrôle"]]}
      />

      {/* L'organisme de contrôle */}
      <section className="flex flex-col gap-4 rounded-2xl bg-stone-900 p-5 text-white sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Icon name="search" className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">L'organisme de contrôle</p>
          <p className="text-xl font-bold">DDPP</p>
          <p className="text-sm text-stone-300">Direction départementale de la protection des populations : service déconcentré de l'État, placé sous l'autorité du préfet de département.</p>
        </div>
        <div className="rounded-xl bg-white/10 px-4 py-3 text-sm sm:max-w-xs">
          <p className="font-semibold">Papier ou numérique : les deux sont acceptés</p>
          <p className="text-stone-300">Aucun texte n'impose de format, du moment que le contrôle est fait, enregistré et présentable à la DDPP.</p>
        </div>
      </section>

      {/* Ce qu'est la réception */}
      <section>
        <h2 className="mb-1 text-lg font-bold">La réception, un moment clé</h2>
        <p className="mb-4 text-sm text-stone-600">C'est l'étape où le restaurant accepte ou refuse la livraison.</p>
        <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
            <Icon name="truck" className="mx-auto h-6 w-6 text-stone-500" />
            <p className="mt-1 font-semibold">Fournisseur</p>
            <p className="text-xs text-stone-500">responsable de la marchandise jusqu'à la livraison</p>
          </div>
          <span className="self-center text-center font-bold text-stone-300">→</span>
          <div className="rounded-xl border-2 border-brand-600 bg-brand-50 p-4 text-center">
            <Icon name="check" className="mx-auto h-6 w-6 text-brand-700" />
            <p className="mt-1 font-semibold text-brand-800">Réception</p>
            <p className="text-xs text-brand-900/80">contrôle, puis <strong>acceptée</strong> ou <strong>refusée</strong></p>
          </div>
          <span className="self-center text-center font-bold text-stone-300">→</span>
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
            <Icon name="home" className="mx-auto h-6 w-6 text-stone-500" />
            <p className="mt-1 font-semibold">Restaurant</p>
            <p className="text-xs text-stone-500">devient responsable ; la traçabilité interne commence</p>
          </div>
        </div>
      </section>

      {/* Textes applicables */}
      <section>
        <h2 className="mb-1 text-lg font-bold">Les textes applicables à la réception</h2>
        <p className="mb-4 text-sm text-stone-600">Ce que chaque texte impose, et ce que fait l'application.</p>
        <ol className="relative space-y-3 border-l-2 border-stone-200 pl-6">
          {texts.map((x) => (
            <li key={x.ref} className="relative">
              <span className="absolute -left-[2.35rem] top-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-white"><Icon name={x.icon} className="h-3.5 w-3.5" /></span>
              <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                <div className="grid gap-x-4 p-4 sm:grid-cols-[13rem_1fr]">
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{x.ref}</p>
                  <div>
                    <h3 className="font-semibold">{x.title}</h3>
                    <p className="text-sm text-stone-600">{x.text}</p>
                  </div>
                </div>
                <p className="border-t border-sky-100 bg-sky-50/60 px-4 py-2 text-xs text-sky-800"><span className="font-semibold">Dans l'application :</span> {x.inApp}</p>
              </article>
            </li>
          ))}
        </ol>
      </section>

      {/* Fiche minimale */}
      <section className="rounded-2xl border border-stone-200 bg-stone-50 p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-bold">Une fiche de réception conforme et minimale</h2>
        <p className="mb-4 text-sm text-stone-600">Tout est relevé par l'application à chaque réception et repris dans la fiche exportée chaque soir.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sheet.map(([k, icon]) => (
            <li key={k} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon name={icon} className="h-4 w-4" /></span>
              {k}
              <Icon name="check" className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 text-sm text-stone-600"><Icon name="file" className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />Il est d'usage de conserver aussi le bon de livraison annoté (photo du BL enregistrée avec la réception).</p>
      </section>

      {/* Conservation et contrôle */}
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Code de commerce, art. L123-22</p>
          <h3 className="font-semibold">Conservation des documents</h3>
          <p className="mt-1 text-sm text-stone-600">Les BL et factures sont des pièces comptables : 10 ans.</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">En cas de contrôle DDPP</p>
          <h3 className="font-semibold">Ce qu'on présente</h3>
          <p className="mt-1 text-sm text-amber-900">Fiches de réception, relevés de températures, lots et DLC, refus et leurs motifs : Réceptions › Fiches de réception, export PDF / Excel immédiat.</p>
        </article>
      </section>

      {notes}
      <p className="text-xs text-stone-500">Repères indicatifs, à valider avec votre plan de maîtrise sanitaire et vos obligations comptables.</p>
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

/* ---------------------------------------------------------------- Notes de l'équipe, schématisées ---------------------------------------------------------------- */

const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

type NoteBlock = { kind: "h" | "p" | "list" | "other"; text: string; items: string[]; bold: boolean };
type NoteSection = { title: string; texts: string[]; items: string[] };

/** Découpe le texte riche (HTML) en blocs de premier niveau : titres, paragraphes, listes */
function noteBlocks(html: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  const re = /<(h[1-6]|p|ul|ol|blockquote|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => decode(x[1])).filter(Boolean);
      if (items.length) out.push({ kind: "list", text: "", items, bold: false });
    } else if (tag === "table") {
      const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => decode(c[1])).filter(Boolean).join(" : ")).filter(Boolean);
      if (rows.length) out.push({ kind: "list", text: "", items: rows, bold: false });
    } else {
      const text = decode(inner);
      if (!text) continue;
      const bold = /^\s*<(strong|b)\b[^>]*>[\s\S]*<\/\1>\s*$/i.test(inner);
      out.push({ kind: tag.startsWith("h") ? "h" : tag === "p" ? "p" : "other", text, items: [], bold });
    }
  }
  return out;
}

/** Regroupe les blocs en sections : un titre (ou une ligne en gras, ou une ligne qui finit par « : » suivie d'une liste) ouvre une section */
function noteSections(html: string): { intro: string[]; sections: NoteSection[] } {
  const blocks = noteBlocks(html);
  const intro: string[] = [];
  const sections: NoteSection[] = [];
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    const opens = b.kind === "h" || (b.kind === "p" && b.text.length <= 90 && (b.bold || (/:\s*$/.test(b.text) && next?.kind === "list")));
    if (opens) sections.push({ title: b.text.replace(/\s*:\s*$/, ""), texts: [], items: [] });
    else if (!sections.length) {
      if (b.kind === "list") sections.push({ title: "", texts: [], items: b.items });
      else intro.push(b.text);
    } else if (b.kind === "list") sections[sections.length - 1].items.push(...b.items);
    else sections[sections.length - 1].texts.push(b.text);
  });
  // Aucun titre : chaque paragraphe devient une carte (début de phrase en titre)
  if (!sections.length && intro.length > 1) {
    return {
      intro: [],
      sections: intro.map((x) => {
        const m = x.match(/^(.{3,70}?)\s*[:.–—-]\s+(.+)$/);
        return m ? { title: m[1], texts: [m[2]], items: [] } : { title: "", texts: [x], items: [] };
      }),
    };
  }
  return { intro, sections };
}

const NOTE_ICONS: [RegExp, string][] = [
  [/temp[ée]rature|°c|froid|cha[iî]ne du froid|surgel|r[ée]frig/i, "thermo"],
  [/refus|interdit|danger|allerg|non[- ]conform|risque/i, "alert"],
  [/tra[cç]abilit|lot|[ée]tiquet|dlc|ddm/i, "list"],
  [/hygi[eè]ne|propre|nettoy|lavage|tenue|d[ée]sinfect/i, "leaf"],
  [/document|archiv|conserv|factur|\bbl\b|registre|fiche/i, "file"],
  [/contr[ôo]le|ddpp|inspect|audit|v[ée]rif/i, "search"],
  [/livr|camion|transport|fournisseur/i, "truck"],
  [/stock|rangement|stock[ée]|r[ée]serve/i, "box"],
  [/prix|€|co[uû]t|avoir/i, "euro"],
];
const NOTE_TONES = [
  "bg-brand-50 text-brand-700",
  "bg-sky-50 text-sky-700",
  "bg-amber-50 text-amber-700",
  "bg-violet-50 text-violet-700",
  "bg-rose-50 text-rose-700",
];

/** Notes de l'équipe (Réglementation) présentées en schéma : une carte par partie, avec icône et points clés */
export function NotesSchema({ html }: { html: string }) {
  const { intro, sections } = noteSections(html);
  if (!sections.length && !intro.length) return <p className="text-sm text-stone-500">Aucune note pour le moment.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white">
      {intro.length > 0 && (
        <div className="border-b border-stone-200 bg-white px-5 py-4 text-sm text-stone-700 sm:px-6">
          {intro.map((x, i) => <p key={i} className={i ? "mt-2" : "font-medium"}>{x}</p>)}
        </div>
      )}
      <ol className="space-y-0 p-4 sm:p-6">
        {sections.map((s, i) => {
          const hay = `${s.title} ${s.texts.join(" ")} ${s.items.join(" ")}`;
          const icon = NOTE_ICONS.find(([re]) => re.test(hay))?.[1] ?? "book";
          const tone = NOTE_TONES[i % NOTE_TONES.length];
          return (
            <li key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className={`z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-4 ring-white ${tone}`}><Icon name={icon} className="h-5 w-5" /></span>
                {i < sections.length - 1 && <span className="w-px flex-1 bg-stone-200" />}
              </div>
              <div className={`min-w-0 flex-1 ${i < sections.length - 1 ? "pb-6" : ""}`}>
                {s.title && <h3 className="pt-2.5 text-base font-bold leading-snug">{s.title}</h3>}
                {s.texts.map((x, j) => <p key={j} className={`text-sm text-stone-600 ${s.title || j ? "mt-1" : "pt-2.5"}`}>{x}</p>)}
                {s.items.length > 0 && (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {s.items.map((x, j) => (
                      <li key={j} className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{x}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
