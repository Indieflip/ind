// Applique les migrations SQL (dossier drizzle/) puis les données de base.
// Lancé automatiquement avant chaque build Vercel.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL absente : migrations ignorées.");
  process.exit(0);
}

let db, close;
if (url.includes("neon.tech")) {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  const pool = new Pool({ connectionString: url });
  db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: "drizzle" });
  close = () => pool.end();
} else {
  const pg = (await import("pg")).default;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.Pool({ connectionString: url });
  db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: "drizzle" });
  close = () => pool.end();
}

const { sql } = await import("drizzle-orm");

// Catégories et seuils (manuel, page 4) — modifiables ensuite dans Réglages
const categories = [
  ["meat", "Viandes, volailles, charcuterie", "Meat, poultry, cold cuts", true, 4, 6, 1],
  ["fish", "Poissons et fruits de mer", "Fish and seafood", true, 2, 4, 2],
  ["dairy", "Crèmerie et ultra-frais", "Dairy and chilled", true, 4, 6, 3],
  ["deli", "Traiteur et plats préparés", "Deli and ready meals", true, 3, 5, 4],
  ["frozen", "Surgelés", "Frozen", true, -18, -15, 5],
  ["produce", "Fruits et légumes", "Fruit and vegetables", false, null, null, 6],
  ["grocery", "Épicerie", "Dry goods", false, null, null, 7],
  ["drinks", "Boissons", "Drinks", false, null, null, 8],
  ["hygiene", "Hygiène", "Hygiene", false, null, null, 9],
];
for (const [code, fr, en, req, cmax, rmax, pos] of categories) {
  await db.execute(sql`
    insert into categories (code, name_fr, name_en, temp_required, conform_max, reserve_max, position)
    values (${code}, ${fr}, ${en}, ${req}, ${cmax}, ${rmax}, ${pos})
    on conflict (code) do nothing`);
}

// Unités de base + toutes celles déjà utilisées dans le mercurial
const baseUnits = ["Pièce", "Kg", "Litre", "Sachet"];
for (const [i, name] of baseUnits.entries()) {
  await db.execute(sql`insert into units (name, position) values (${name}, ${i + 1}) on conflict (name) do nothing`);
}
await db.execute(sql`insert into units (name) select distinct unit from products where unit is not null and unit <> '' on conflict (name) do nothing`);

// Unités : première lettre en majuscule, doublons de casse fusionnés (« pot », « POT » → « Pot »)
await db.execute(sql`update products set unit = upper(left(lower(unit), 1)) || substr(lower(unit), 2) where unit <> '' and unit not like '%/%' and unit <> upper(left(lower(unit), 1)) || substr(lower(unit), 2)`);
await db.execute(sql`delete from units u where u.name not like '%/%' and u.name <> upper(left(lower(u.name), 1)) || substr(lower(u.name), 2)
  and exists (select 1 from units v where v.name = upper(left(lower(u.name), 1)) || substr(lower(u.name), 2))`);
await db.execute(sql`delete from units u where exists (select 1 from units v where v.id < u.id
  and upper(left(lower(v.name), 1)) || substr(lower(v.name), 2) = upper(left(lower(u.name), 1)) || substr(lower(u.name), 2))`);
await db.execute(sql`update units set name = upper(left(lower(name), 1)) || substr(lower(name), 2) where name not like '%/%' and name <> upper(left(lower(name), 1)) || substr(lower(name), 2)`);

// Unités en double sous deux écritures : fusion (Pce → Pièce, Bte → Boite, Seaux / Sceaux → Seau, Btl → Bouteille)
const aliases = { Pce: "Pièce", Piece: "Pièce", Bte: "Boite", "Boîte": "Boite", Seaux: "Seau", Sceaux: "Seau", Btl: "Bouteille", Bocal: "Bocal / Pot", Pot: "Bocal / Pot" };
for (const [from, to] of Object.entries(aliases)) {
  await db.execute(sql`insert into units (name) select ${to} where exists (select 1 from units where name = ${from}) on conflict (name) do nothing`);
  await db.execute(sql`update products set unit = ${to} where unit = ${from}`);
  await db.execute(sql`update reception_lines set unit = ${to} where unit = ${from}`);
  await db.execute(sql`update fv_items set unit = ${to} where unit = ${from}`);
  await db.execute(sql`delete from units where name = ${from}`);
}

// Tri des unités (une seule fois) : suppression des unités qui ne servent à aucun produit, ni bon
if (!(await db.execute(sql`select 1 from app_settings where key = 'units_cleanup_v1'`)).rows.length) {
  const { rowCount } = await db.execute(sql`delete from units u where u.name not in ('Kg', 'Pièce', 'Litre', 'Sachet')
    and not exists (select 1 from products p where p.unit = u.name)
    and not exists (select 1 from fv_items f where f.unit = u.name)
    and not exists (select 1 from reception_lines l where l.unit = u.name)`);
  await db.execute(sql`insert into app_settings (key, value) values ('units_cleanup_v1', '1') on conflict (key) do nothing`);
  console.log(`[migrate] unités inutilisées supprimées : ${rowCount}`);
}
await db.execute(sql`delete from units where trim(name) = ''`);

// Premier protocole (modifiable ensuite dans l'onglet Protocoles)
const processPese = `## 1. Préparation et vérification de l'instrument

Contrôle de l'instrument (balance ou pont-bascule) :
• Vérifier que la balance est bien mise de niveau et stable.
• Vérifier que l'affichage est à zéro avant toute opération.

Contrôle de la tare :
• Peser ou vérifier avec un poids de 5 kg.

## 2. Déroulement du pesage

Réalisation de la pesée :
• Placer la marchandise au centre du plateau (ou sur le pont-bascule) pour éviter les erreurs d'excentration.
• Attendre la stabilisation complète de l'affichage avant de lire ou d'imprimer la valeur.

Échantillonnage (en cas de lots ou préemballés) :
• Si le contrôle porte sur des produits préemballés, appliquer un plan d'échantillonnage conforme aux normes (par exemple la norme AFNOR NFX 06-031-1 ou les règles de la DGCCRF) : la moyenne du lot doit être supérieure ou égale au poids nominal, avec un taux de défauts limité.

## 3. Saisie des informations

• Indiquer le poids dans le BL.`;
await db.execute(sql`insert into protocols (title, content, position)
  select 'Process pèse', ${processPese}, 1 where not exists (select 1 from protocols)`);

// Protocole de réception (procédure rapide, d'après le manuel d'utilisation)
const receptionProcess = `## Avant de commencer
• Contrôler la livraison devant le livreur, avant de signer son bon.
• Avoir le téléphone chargé et le thermomètre sonde propre à portée de main.
• Traiter en premier les produits frais et surgelés, puis les ranger aussitôt.

## Étape 1 — Photo du BL
• Réceptions > Nouvelle réception.
• « Prendre en photo » (ou « Importer un fichier » : PNG, JPG, PDF) : BL bien à plat, entier et lisible, une photo par page.
• Confirmer la qualité de la photo : la lecture automatique démarre et prépare la liste des produits.
• Pas de BL ? « Pas de BL / saisie manuelle » : une anomalie « Bon de livraison manquant » sera créée.

## Étape 2 — Détail livraison
• Vérifier le fournisseur (proposé par la lecture), la date et l'heure, le numéro de BL et le nom du livreur.
• Relever la température de la caisse du camion (frais et surgelés) et indiquer si le véhicule est propre.
• Rush de livraisons ? Bouton « Brouillon » : le bon est enregistré et se reprend plus tard depuis Réceptions > Brouillons en cours.

## Étape 3 — Contrôle des produits
• Vérifier chaque ligne lue sur le BL ; ajouter les produits manquants avec la recherche ou « Produit hors liste ».
• Pour chaque produit : quantité commandée / reçue (peser selon le protocole « Process pèse »), température à cœur pour le frais et le surgelé, DLC, n° de lot, prix unitaire HT.
• Couleur de la fiche : vert = conforme, orange = réserve, rouge = refus. La décision peut être changée à la main.
• Réserve ou refus : choisir le motif et prendre une photo du problème.
• Prix : hors de la tranche minimum – maximum du mercurial = variation de prix ; prix bloqué non respecté = anomalie.

## Étape 4 — Validation
• Relire le récapitulatif complet du bon (en-tête, produits, températures, prix).
• Compléter les températures manquantes si un bandeau le signale.
• Relire le texte « Réserves à reporter sur le BL » et le recopier sur le bon du livreur AVANT de signer.
• Faire signer le livreur sur l'écran, puis « Enregistrer la réception ».

## Après la réception
• Le bon reste modifiable tant qu'il n'est pas consolidé.
• L'administrateur le consolide (onglet Consolidation) : il devient une preuve et ne peut plus être modifié ni supprimé.
• Une anomalie (produit manquant, avoir…) se signale depuis la fiche du bon : « Signaler une anomalie ».`;
await db.execute(sql`insert into protocols (title, content, position)
  select 'Réception d''une livraison', ${receptionProcess}, 0 where not exists (select 1 from protocols where title = 'Réception d''une livraison')`);

// Protocole « Process de réclamation » (onglet « Process » du fichier Suivi contrôle), créé une seule fois
const reclamation = "Contacts et démarches à suivre en cas de manquant, refus, retour ou erreur de facturation, par fournisseur.\n\n## Boulangerie Thierry\nRéclamation :\n• Rappeler Céline la comptable dans la journée / dès que possible\n\n## Case / Cash\nRéclamation :\n• Livraison : en cas d'un retour de produit, le livreur rentre au dépôt et scanne les produits en question. Cela permet de générer un avoir qui est envoyé par la compta à compta@nynycannes.com dans la journée\n\n## JFC France\nRéclamation :\n• Contacter le commercial mickael@jfc.eu directement (la compta ne pourra rien faire)\n\n## Gineys\nRéclamation :\n• Si PB (manque / refus / remplacement / erreur) le stipuler sur le BL avant que le livreur parte, au pire dans la journée (max 48h) en appelant le numéro du commercial sur le BL\n\n## Terres de Truffes\nRéclamation :\n• Réclamation process : la rappeler dans la journée / dès que possible\n\n## Marr\nRéclamation :\n• Réclamation à faire le jour même (pas de dépôt en France, le BL = marchandises pour pouvoir passer la frontière) dans le groupe Whatsapp + par mail\n• Si il y a un manquant, un avoir sera édité\n• En cas de pb de manquant livré le lendemain : Au passage à la frontière, les douanes vérifient la marchandise donc si il y a de la marchandise en + ça doit être noté sur un doc";
await db.execute(sql`insert into protocols (title, content, position)
  select 'Process de réclamation', ${reclamation}, 3 where not exists (select 1 from protocols where lower(title) = lower('Process de réclamation'))`);

// Liste des contenants : table dédiée (filtres, ajout, modification) affichée sous le protocole « Process pèse »
const tares = "## Liste des contenants (tares)\nPoids des contenants à déduire du poids pesé (poids net = poids total − tares).\n| Prestataire | Produit | Tare (kg) | Contenant |\n| - | Tout produit | 1,6 | Caisse rouge profondeur moyenne |\n| - | Tout produit | — | Gastro Petit |\n| - | Tout produit | 1,12 | Gastro Moyen |\n| - | Tout produit | 1,91 | Gastro Grand |\n| Dab | Déconsigne | - | A = demi d'eau (4,80€) // D = L d'eau (4,20€) // E = soda (5,50€) // F = fût (30€) // G = Orangina (7€) |\n| Producteurs Réunis | Ail épeluché C 4E GAM | 0,025 | Boite en plastique |\n| Producteurs Réunis | Carotte plateau KG | 1 | Boite en bois |\n| Producteurs Réunis | Champignon Paris EQ.MOYEN KG | 0,185 | Cagette en plastique bleue ou noir |\n| Producteurs Réunis | Citron jaune 4/40 Gros | 0,53 | Carton Bleu  // \"Caki Fruit |\n| Producteurs Réunis | Citron jaune 4/40 Gros | 0,94 | Carton simple gros noir et jaune  // \"18KGNET |\n| Producteurs Réunis | Citron jaune 4/40 Gros | 0,45 | Carton noir // \"CITRAT CITRUS ARGENTINO |\n| Producteurs Réunis | Citron jaune 4/40 Gros | 0,41 | Carton Bleu  // \"Twente Partners |\n| Producteurs Réunis | Citron vert | 0,43 | Carton noir |\n| Producteurs Réunis | Courgette blanche/Grise KG | 0,96 | Cagette en bois beige (classique) |\n| Producteurs Réunis | Courgette blanche/Grise KG | 0,865 | Cagette bois simple // \"VIRGEN DEL ROLLION |\n| Producteurs Réunis | Figue extra | 0,27 | Carton blanc + feuille plastique // \"Dauna de Elche |\n| Producteurs Réunis | Figue extra | 0,38 | Cagette bois // \"SOLIES |\n| Producteurs Réunis | Fraise | 0,035 | Barquette |\n| Producteurs Réunis | Mangue | 0,37 | Carton  // \"Mangoes |\n| Producteurs Réunis | Mangue | 0,49 | Carton rose // \"LA ROSEE DU ROY |\n| Producteurs Réunis | Mangue | 0,59 | Carton noir grand // \"SUBLIME |\n| Producteurs Réunis | Mangue | 0,59 | Carton blanc // \"Glamour |\n| Producteurs Réunis | Oignon pelé (blanc et Rouge) | 0,89 | Cagette en bois  // \"RPH OIGNONS |\n| Producteurs Réunis | Oignon rouge pelé | 0,675 | Cagette en bois simple moyen |\n| Producteurs Réunis | Orange jus machine | 0,65 | Cagette bois // \"CHOUCHOU |\n| Producteurs Réunis | Orange jus machine | 0,475 | Carton noir // \"CHOUCHOU |\n| Producteurs Réunis | Orange jus machine | 0,905 | Carton blanc et orange // \"SUTHERN |\n| Producteurs Réunis | Orange jus machine | 0,6 | Carton noir grand // \"Coquette |\n| Producteurs Réunis | Orange jus machine | 1,45 | Cagette bois simple |\n| Producteurs Réunis | PDT Epeluché | 0,535 | Carton grand  // \"LA DIMANCHE VILLE |\n| Producteurs Réunis | PDT Grenaille 10k | 0,65 | Carton bleu claire moyen \"CA C BON GRENAILLE |\n| Producteurs Réunis | Poivron (Rouge, Jaune, Vert) | 0,51 | Carton \"Poivron PAPRIKA POIVRON |\n| Producteurs Réunis | Poivron Jaune | 0,43 | Carton jaune // \"Poivron PAPRIKA POIVRON |\n| Producteurs Réunis | Poivron vert KG | 0,665 | Cagette beige \"MI V IEJO |\n| Producteurs Réunis | Poivron vert KG | 0,55 | Carton rouge et blanc // \"Naturinda |\n| Producteurs Réunis | Pomme Golden Office 70/75 KG (136-180G) | 0,515 | Carton moyen  // \"MOUTINE |\n| Producteurs Réunis | Pomme Golden Office 70/75 KG (136-180G) | 0,43 | Carton  // \"L'ELEGANTE |\n| Producteurs Réunis | Pomme Golden Office 70/75 KG (136-180G) | 0,575 | Carton beige // \"Alp in 972, La pomme des Alpes |\n| Producteurs Réunis | Pousse Epinard Nice Herbe Kg (France) | 0,72 | Cagette en plastique noir (Taille grande) |\n| Producteurs Réunis | Riquette | 0,46 | Carton simple |\n| Producteurs Réunis | Tomate 57/67 (Pays-Bas) | 0,53 | Carton rouge et vert // \"Vittura |\n| Producteurs Réunis | Tomate 57/67 (Pays-Bas) | 0,565 | Cagette plastique bleue simple |\n| Producteurs Réunis | Tomate 57/67 (Pays-Bas) | 0,36 | Carton vert  // \"Baron / Frandria |\n| Producteurs Réunis | Tomate ancienne multivariete (France) | 0,48 | Cagette en bois  // \"Prince de Bretagne, les maraichers |\n| Producteurs Réunis | Tomate ancienne multivariete (France) | 0,48 | Cagette en bois  // \"BEL'ORTA |\n| Producteurs Réunis | Tomate cerise \"Meli-Melo | 0,28 | Carton blanc et bleu // \"Den Berk Délice |\n| Producteurs Réunis | Tomate cerise grappe France | 0,235 | Carton bleu et orange  // \"Belorta Cherrystar |\n| Producteurs Réunis | Tout produit | 0,35 | Carton blanc et rouge // \"Producteurs Réunis |\n| Producteurs Réunis | Tout produit | 0,965 | Carton noir et jaune grand  // \"CITRAR 18KG |\n| Top Mediterranee | Coeur de longe / longe de thon | 0,197 | Barquette |";
{
  const pointer = "Tares des contenants : voir la « Liste des contenants (tares) » en bas de ce protocole (poids en kg à déduire du poids pesé).";
  const proto = (await db.execute(sql`select id, content from protocols where title = 'Process pèse' limit 1`)).rows[0];
  const seeded = (await db.execute(sql`select 1 from app_settings where key = 'containers_seed_v1'`)).rows.length > 0;
  const toCells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  if (!seeded) {
    const hasRows = (await db.execute(sql`select 1 from containers limit 1`)).rows.length > 0;
    if (!hasRows) {
      const source = proto?.content?.includes("| Prestataire |") ? proto.content : tares;
      const lines = source.split("\n");
      const head = lines.findIndex((l) => l.includes("| Prestataire |"));
      const grams = head >= 0 && lines[head].includes("Tare (g)");
      let position = 0;
      for (let k = head + 1; head >= 0 && k < lines.length && lines[k].trim().startsWith("|"); k++) {
        const [supplier, product, tare, container] = toCells(lines[k]);
        let n = Number(String(tare ?? "").replace(/\s/g, "").replace(",", "."));
        if (!tare || !Number.isFinite(n) || tare === "-" || tare === "—") n = null;
        else if (grams) n = n / 1000;
        const clean = (x) => (x && x !== "—" ? x.replace(/ \/\/ /g, "\n") : null);
        await db.execute(sql`insert into containers (supplier, product, tare, container, position) values (${clean(supplier)}, ${clean(product)}, ${n}, ${clean(container)}, ${position++})`);
      }
    }
    await db.execute(sql`insert into app_settings (key, value) values ('containers_seed_v1', '1') on conflict (key) do nothing`);
  }
  // Le tableau en texte est retiré du protocole (la liste est désormais la table ci-dessous)
  if (proto) {
    let content = proto.content.split(/\n*## Liste des contenants/)[0].trimEnd();
    if (!content.startsWith("Tares des contenants : voir")) content = `${pointer}\n\n${content}`;
    if (content !== proto.content) await db.execute(sql`update protocols set content = ${content} where id = ${proto.id}`);
  }
}

// Format de date de l'établissement : JJ/MM/AA (les dates écrites en JJ/MM/AAAA dans les textes sont raccourcies)
{
  const fix = [["maj_log", ["reference", "detail", "claim", "item"]], ["anomalies", ["reference", "description", "follow_up", "result"]], ["weigh_gaps", ["supplier_ref", "detail", "reference"]], ["reception_notes", ["text"]]];
  for (const [table, cols] of fix) {
    for (const c of cols) {
      await db.execute(sql.raw(`update ${table} set ${c} = regexp_replace(${c}, '(\\d{1,2})/(\\d{1,2})/(19|20)(\\d{2})(?!\\d)', '\\1/\\2/\\4', 'g') where ${c} ~ '\\d{1,2}/\\d{1,2}/(19|20)\\d{2}'`));
    }
  }
}

// Nature courte des anomalies et écarts de pesée (comme le fichier de suivi)
for (const [from, to] of [["Viandes, volailles, charcuterie", "Viande"], ["Poissons et fruits de mer", "Poisson"], ["Fruits et légumes", "Fruits & Légumes"]]) {
  await db.execute(sql`update anomalies set nature = ${to} where nature = ${from}`);
  await db.execute(sql`update weigh_gaps set nature = ${to} where nature = ${from}`);
}

// N° des anomalies déjà consolidées (définitif, unique, dans l'ordre des dates)
await db.execute(sql`with base as (select coalesce(max(number), 0) as m from anomalies),
  todo as (select id, row_number() over (order by consolidated_at, created_at, id) as rn from anomalies where consolidated_at is not null and number is null)
  update anomalies a set number = base.m + todo.rn from todo, base where a.id = todo.id`);

// Fruits et légumes : rattacher les produits au fournisseur existant de même nom
// (« Producteurs réunies » → « PRODUCTEURS REUNIS ») et retirer le doublon devenu vide
const key = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").map((w) => w.replace(/(es|s|e)$/, "")).join(" ");
const sups = (await db.execute(sql`select id, name from suppliers order by id`)).rows;
const mainByKey = new Map();
for (const s of sups) if (!mainByKey.has(key(s.name))) mainByKey.set(key(s.name), s.id);
for (const s of sups) {
  const main = mainByKey.get(key(s.name));
  if (main !== s.id) {
    await db.execute(sql`update products set supplier_id = ${main} where supplier_id = ${s.id} and fv_item_id is not null`);
    await db.execute(sql`update suppliers set active = false where id = ${s.id} and not exists (select 1 from products p where p.supplier_id = ${s.id} and p.active)`);
  }
}

// Conditions de conformité par catégorie (préremplies une seule fois, modifiables ensuite)
const common = {
  conform: "DLC de plus de 2 jours\nQuantité reçue = quantité du BL\nEmballage intact, étiquette lisible (n° de lot, DLC)\nAspect et odeur normaux",
  reserve: "DLC courte (aujourd'hui, demain ou après-demain)\nQuantité reçue différente du BL (écart noté sur le BL)\nPrix hors tranche ou prix bloqué non respecté",
  refuse: "DLC dépassée\nEmballage abîmé ou ouvert\nÉtiquette absente ou illisible\nOdeur ou aspect anormal\nProduit non commandé ou mauvaise référence",
};
const temps = (await db.execute(sql`select id, code, temp_required, conform_max, reserve_max from categories where conform_rules is null and reserve_rules is null and refuse_rules is null`)).rows;
for (const c of temps) {
  const t = c.temp_required && c.conform_max != null && c.reserve_max != null;
  const f = (n) => String(n).replace(".", ",");
  const conform = (t ? `Température à cœur ≤ ${f(c.conform_max)} °C\n` : "") + common.conform;
  const reserve = (t ? `Température entre ${f(c.conform_max)} °C et ${f(c.reserve_max)} °C\n` : "") + common.reserve;
  const refuse = (t ? `Température > ${f(c.reserve_max)} °C\n` : "") + (c.code === "frozen" ? "Produit décongelé ou recongelé (givre, cristaux)\n" : "") + common.refuse;
  await db.execute(sql`update categories set conform_rules = ${conform}, reserve_rules = ${reserve}, refuse_rules = ${refuse} where id = ${c.id}`);
}

// Liste des prix bloqués fruits et légumes (fichier Appli.xlsx), appliquée une seule fois
const { readFileSync } = await import("node:fs");
const norm = (n) => String(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const seeded = (await db.execute(sql`select 1 from app_settings where key = 'seed_locked_fv_v1'`)).rows.length > 0;
if (!seeded) {
  const list = JSON.parse(readFileSync(new URL("./data/locked-fv.json", import.meta.url), "utf8"));
  const wanted = new Set(list.products.map(norm));
  const items = (await db.execute(sql`select id, product from fv_items`)).rows;
  let n = 0;
  for (const it of items) if (wanted.has(norm(it.product))) { await db.execute(sql`update fv_items set locked = true where id = ${it.id}`); n++; }
  // Ne marquer comme fait qu'une fois les fruits et légumes présents (sinon on réessaie au prochain déploiement)
  if (items.length) await db.execute(sql`insert into app_settings (key, value) values ('seed_locked_fv_v1', ${String(n)}) on conflict do nothing`);
  console.log(`[migrate] prix bloqués appliqués : ${n}`);
}

// Fruits et légumes → produits du mercurial (même fournisseur, prix du mois, prix bloqué), à chaque déploiement
{
  const year = new Date().getFullYear();
  const items = (await db.execute(sql`select id, supplier, product, unit, locked from fv_items where year = ${year}`)).rows;
  if (items.length) {
    const produce = (await db.execute(sql`select id from categories where code = 'produce'`)).rows[0]?.id ?? null;
    const supRows = (await db.execute(sql`select id, name from suppliers order by id`)).rows;
    const supByKey = new Map();
    for (const s of supRows) if (!supByKey.has(key(s.name))) supByKey.set(key(s.name), s.id);
    const linked = new Map((await db.execute(sql`select id, fv_item_id from products where fv_item_id is not null`)).rows.map((r) => [r.fv_item_id, r.id]));
    const cap = (u) => { const x = String(u ?? "").trim().toLowerCase(); const n = x ? x[0].toUpperCase() + x.slice(1) : "Kg"; return aliases[n] ?? n; };
    for (const it of items) {
      let sid = supByKey.get(key(it.supplier));
      if (!sid) {
        sid = (await db.execute(sql`insert into suppliers (name) values (${it.supplier}) on conflict (name) do update set name = excluded.name returning id`)).rows[0].id;
        supByKey.set(key(it.supplier), sid);
      }
      const pid = linked.get(it.id);
      if (pid) await db.execute(sql`update products set supplier_id = ${sid}, name = ${it.product}, unit = ${cap(it.unit)}, price_locked = ${it.locked}, active = true where id = ${pid}`);
      else await db.execute(sql`insert into products (supplier_id, name, unit, nature, category_id, price_locked, active, fv_item_id) values (${sid}, ${it.product}, ${cap(it.unit)}, 'Fruits & légumes', ${produce}, ${it.locked}, true, ${it.id})`);
    }
    await db.execute(sql`update products set active = false where fv_item_id is not null and fv_item_id not in (select id from fv_items where year = ${year})`);
    // Toutes les unités utilisées par des produits figurent dans la liste des unités
    await db.execute(sql`insert into units (name) select distinct unit from products where unit is not null and unit <> '' on conflict (name) do nothing`);
    console.log(`[migrate] fruits et légumes synchronisés : ${items.length}`);
  }
}

console.log("[migrate] base à jour.");
await close();
