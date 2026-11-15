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
await db.execute(sql`update products set unit = upper(left(lower(unit), 1)) || substr(lower(unit), 2) where unit <> '' and unit <> upper(left(lower(unit), 1)) || substr(lower(unit), 2)`);
await db.execute(sql`delete from units u where u.name <> upper(left(lower(u.name), 1)) || substr(lower(u.name), 2)
  and exists (select 1 from units v where v.name = upper(left(lower(u.name), 1)) || substr(lower(u.name), 2))`);
await db.execute(sql`delete from units u where exists (select 1 from units v where v.id < u.id
  and upper(left(lower(v.name), 1)) || substr(lower(v.name), 2) = upper(left(lower(u.name), 1)) || substr(lower(u.name), 2))`);
await db.execute(sql`update units set name = upper(left(lower(name), 1)) || substr(lower(name), 2) where name <> upper(left(lower(name), 1)) || substr(lower(name), 2)`);

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

console.log("[migrate] base à jour.");
await close();
