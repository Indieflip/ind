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
const aliases = { Pce: "Pièce", Piece: "Pièce", Bte: "Boite", "Boîte": "Boite", Seaux: "Seau", Sceaux: "Seau", Btl: "Bouteille", Bocal: "Bocal / Pot", Pot: "Bocal / Pot", Bqt: "Pièce" };
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
// Protocoles de départ : créés une seule fois (une suppression faite dans l'application n'est jamais annulée)
const protocolsSeeded = (await db.execute(sql`select 1 from app_settings where key = 'protocols_seed_v1'`)).rows.length > 0;
if (!protocolsSeeded) await db.execute(sql`insert into protocols (title, content, position)
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
if (!protocolsSeeded) await db.execute(sql`insert into protocols (title, content, position)
  select 'Réception d''une livraison', ${receptionProcess}, 0 where not exists (select 1 from protocols where title = 'Réception d''une livraison')`);

// Protocole « Process de réclamation » (onglet « Process » du fichier Suivi contrôle), créé une seule fois
const reclamation = "Contacts et démarches à suivre en cas de manquant, refus, retour ou erreur de facturation, par fournisseur.\n\n## Boulangerie Thierry\nRéclamation :\n• Rappeler Céline la comptable dans la journée / dès que possible\n\n## Case / Cash\nRéclamation :\n• Livraison : en cas d'un retour de produit, le livreur rentre au dépôt et scanne les produits en question. Cela permet de générer un avoir qui est envoyé par la compta à compta@nynycannes.com dans la journée\n\n## JFC France\nRéclamation :\n• Contacter le commercial mickael@jfc.eu directement (la compta ne pourra rien faire)\n\n## Gineys\nRéclamation :\n• Si PB (manque / refus / remplacement / erreur) le stipuler sur le BL avant que le livreur parte, au pire dans la journée (max 48h) en appelant le numéro du commercial sur le BL\n\n## Terres de Truffes\nRéclamation :\n• Réclamation process : la rappeler dans la journée / dès que possible\n\n## Marr\nRéclamation :\n• Réclamation à faire le jour même (pas de dépôt en France, le BL = marchandises pour pouvoir passer la frontière) dans le groupe Whatsapp + par mail\n• Si il y a un manquant, un avoir sera édité\n• En cas de pb de manquant livré le lendemain : Au passage à la frontière, les douanes vérifient la marchandise donc si il y a de la marchandise en + ça doit être noté sur un doc";
if (!protocolsSeeded) await db.execute(sql`insert into protocols (title, content, position)
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

// Libellés d'anomalies plus clairs (une fois) : « Anomalie détectée — PRODUIT : Quantité manquante (-50 Pièce) »
// devient « Anomalie détectée : manque 50 pièces (facturé 100, contrôlé 50) » (le produit a sa colonne)
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_texts_v3'`)).rows.length) {
  const { rows } = await db.execute(sql`select a.id, a.description, a.product_name, l.qty_ordered, l.qty_received, l.unit, l.temperature, l.dlc, c.conform_max
    from anomalies a left join reception_lines l on l.id = a.line_id left join categories c on c.id = l.category_id
    where a.imported = false`);
  const n3 = (v) => String(Math.round(Number(v) * 1000) / 1000).replace(".", ",");
  const qty = (n, unit) => {
    const v = Math.abs(Math.round(n * 1000) / 1000);
    const u = (unit || "").toLowerCase();
    return `${String(v).replace(".", ",")} ${v > 1 && !/^(kg|g|l|ml|cl)$/.test(u) && !/[sx]$/.test(u) ? u + "s" : u}`.trim();
  };
  const dmy = (d) => String(d).slice(0, 10).split("-").reverse().map((p, i) => (i === 2 ? p.slice(2) : p)).join("/");
  for (const a of rows) {
    let d = a.description ?? "";
    const m = /^(Anomalie détectée|Réserve|Refus|Prix bloqué non respecté) — (.*?) : (.*)$/s.exec(d);
    if (!m) continue;
    const [, head, , rest0] = m;
    let rest = rest0;
    const facts = [];
    if (a.qty_ordered != null && a.qty_received != null && Number(a.qty_ordered) !== Number(a.qty_received)) {
      const diff = Number(a.qty_received) - Number(a.qty_ordered);
      facts.push(`${diff < 0 ? `manque ${qty(diff, a.unit)}` : `${qty(diff, a.unit)} en trop`} (facturé ${n3(a.qty_ordered)}, contrôlé ${n3(a.qty_received)})`);
    }
    if (head === "Prix bloqué non respecté") {
      const p = /^([\d,]+ €) \(prix bloqué (.+?), ([+-]?[\d.,]+) %\)$/.exec(rest);
      if (p) rest = `${p[1]} au lieu de ${p[2]} (${p[3].replace(".", ",")} %)`;
      d = `${head} : ${rest}`;
    } else if (head === "Anomalie détectée") {
      const parts = [];
      if (/Quantité/i.test(rest) && facts.length) parts.push(...facts);
      if (/Température/i.test(rest) && a.temperature != null) parts.push(`température ${String(a.temperature).replace(".", ",")} °C${a.conform_max != null ? ` (maximum ${String(a.conform_max).replace(".", ",")} °C)` : ""}`);
      if (/DLC dépassée/i.test(rest) && a.dlc) parts.push(`DLC dépassée (${dmy(a.dlc)})`);
      else if (/DLC/i.test(rest) && a.dlc) parts.push(`DLC trop courte (${dmy(a.dlc)})`);
      d = `${head} : ${parts.length ? parts.join(" ; ") : rest}`;
    } else {
      const reason = rest.replace(/\s*\([+-]?[\d.,]+ [^)]*\)\s*$/, "").trim();
      d = `${head} : ${[reason.toLowerCase(), ...facts].filter(Boolean).join(" ; ")}`;
    }
    if (d !== a.description) await db.execute(sql`update anomalies set description = ${d} where id = ${a.id}`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_texts_v3', '1') on conflict (key) do nothing`);
}

// Fiche d'anomalie : « Résultat » devient un choix Clôturé / En cours / Annulé (une fois).
// Le texte d'origine (« Vérifier la réception de l'avoir : ok le 21/10/26 ») est gardé dans « Action ».
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_outcome_v1'`)).rows.length) {
  const { rows } = await db.execute(sql`select id, result, follow_up, status from anomalies`);
  const plain = (x) => (x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const a of rows) {
    const r = (a.result ?? "").trim();
    if (["cloture", "en_cours", "annule"].includes(r)) continue;
    const t = plain(r);
    let code = "en_cours";
    if (/annul/.test(t)) code = "annule";
    else if (a.status === "closed" || a.status === "credit_received" || /\bok\b|\bras\b|a ete livre|receptionne|reception avoir le|avoir recu|clotur/.test(t)) code = "cloture";
    const follow = r ? [a.follow_up, `Résultat : ${r}`].filter(Boolean).join("\n") : a.follow_up;
    await db.execute(sql`update anomalies set result = ${code}, follow_up = ${follow} where id = ${a.id}`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_outcome_v1', '1') on conflict (key) do nothing`);
}

// Suivi unique des anomalies (une fois) : étape (À traiter / Réclamée / À vérifier sur facture / Clôturée / Annulée),
// résolution (avoir / livraison différée / sans suite), mode (réclamation avec relances / simple vérification),
// montant réclamé, source. Règles : une ligne qui indique la bonne réception d'un avoir (ou de la marchandise) est clôturée.
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_stage_v1'`)).rows.length) {
  const plain = (x) => (x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const { rows } = await db.execute(sql`select a.*, l.qty_ordered, l.qty_received, l.unit_price, l.mercurial_min, l.mercurial_price, l.decision as line_decision
    from anomalies a left join reception_lines l on l.id = a.line_id`);
  for (const a of rows) {
    const follow = a.follow_up ?? "";
    const resultLine = (/Résultat : (.*)$/m.exec(follow)?.[1] ?? "");
    const actions = plain(follow.replace(/Résultat : .*$/m, ""));
    const all = plain(`${follow} ${a.description}`);
    const active = /mail|appel|whatsapp|relanc|demand|contact|telephon|sms|message|bon de retour|retour gere|recup/.test(actions);
    const deferred = /differe|livre ulterieurement|a ete livre|livre apres|livraison du complement|complement|renvoi|livr[ee]+ le lendemain/.test(all);
    const creditOk = /ok le|reception avoir le|avoir recu|nous envoie l.avoir|receptionne le|: ok\b|\bok ras\b|^ok$/.test(plain(resultLine)) || /reception avoir le|avoir recu/.test(all);
    let stage, resolution = null;
    if (a.result === "annule") stage = "annulee";
    else if (a.result === "cloture" || creditOk) {
      stage = "cloturee";
      resolution = Number(a.credit_amount) > 0 ? "avoir" : deferred && !/avoir/.test(plain(resultLine)) ? "livraison" : /avoir/.test(plain(resultLine)) ? "avoir" : "sans_suite";
    } else if (active) stage = "reclamee";
    else if (/verifi/.test(plain(resultLine))) stage = "a_verifier";
    else stage = "a_traiter";
    const mode = active ? "reclamation" : "verification";
    // Montant en jeu, d'après la ligne du bon
    let claimed = null;
    const price = a.unit_price != null ? Number(a.unit_price) : null;
    if (price != null) {
      const qo = a.qty_ordered != null ? Number(a.qty_ordered) : null;
      const qr = a.qty_received != null ? Number(a.qty_received) : null;
      if (a.type === "locked_price") {
        const ref = a.mercurial_min ?? a.mercurial_price;
        if (ref != null) claimed = (price - Number(ref)) * (qr ?? qo ?? 0);
      } else if (a.line_decision === "refuse") claimed = price * (qo ?? qr ?? 0);
      else if (qo != null && qr != null && qo !== qr) claimed = Math.abs(qo - qr) * price;
    }
    const source = a.imported ? "file" : a.reception_id ? "reception" : "manual";
    const status = stage === "a_traiter" ? "open" : stage === "reclamee" || stage === "a_verifier" ? "claimed" : stage === "cloturee" ? (resolution === "avoir" ? "credit_received" : "closed") : "closed";
    const result = stage === "cloturee" ? "cloture" : stage === "annulee" ? "annule" : "en_cours";
    await db.execute(sql`update anomalies set stage = ${stage}, resolution = ${resolution}, mode = ${mode}, source = ${source},
      claimed_amount = ${claimed != null && claimed > 0 ? Math.round(claimed * 100) / 100 : null}, status = ${status}, result = ${result},
      closed_at = ${stage === "cloturee" || stage === "annulee" ? sql`coalesce(closed_at, consolidated_at, created_at)` : null} where id = ${a.id}`);
  }
  // Réclamations saisies à la main → anomalies (une seule liste de suivi)
  const { rows: manual } = await db.execute(sql`select * from claims where source = 'manual' and anomaly_id is null and weigh_gap_id is null`);
  for (const c of manual) {
    const stage = c.status === "cloturee" ? "cloturee" : c.status === "annulee" ? "annulee" : "reclamee";
    await db.execute(sql`insert into anomalies (supplier_id, supplier_name, product_name, type, description, reference, follow_up, credit_amount, claimed_amount,
      stage, resolution, mode, source, status, result, reception_id, created_by, created_at)
      values (${c.supplier_id}, ${c.supplier_name ?? "—"}, ${c.product}, 'other', ${c.subject}, ${c.reference}, ${c.notes}, ${c.credit}, ${c.amount},
      ${stage}, ${stage === "cloturee" ? (Number(c.credit) > 0 ? "avoir" : "sans_suite") : null}, 'reclamation', 'manual',
      ${stage === "reclamee" ? "claimed" : "closed"}, ${stage === "cloturee" ? "cloture" : stage === "annulee" ? "annule" : "en_cours"}, ${c.reception_id}, ${c.created_by}, ${c.created_at})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_stage_v1', '1') on conflict (key) do nothing`);
}

// Onglet Dev : objectifs et points en attente (contenu de départ, modifiable ensuite)
const devSeed = [["objective", "Contrôler chaque livraison depuis le téléphone", "Photo du BL / de la facture, lecture automatique, contrôle produit par produit (quantité facturée / contrôlée, température, DLC, lot, prix), réserves et signature du livreur.", null], ["objective", "Tenir un mercurial fiable", "Prix minimum / maximum par produit et fournisseur, prix bloqués, mise à jour automatique depuis les bons, historique des modifications, sans doublon (N° unique par produit et par fournisseur).", null], ["objective", "Ne laisser passer aucune anomalie", "Chaque écart (manquant, prix, température, DLC, pesée) devient une anomalie suivie jusqu'à sa résolution : avoir reçu, livraison différée ou sans suite. Relance à 3 jours, clôture chaque semaine.", null], ["objective", "Mesurer exactement les économies", "Avoirs obtenus, marchandise livrée en différé, montants encore en attente, par fournisseur et par mois.", null], ["objective", "Traçabilité HACCP et sauvegardes", "Températures, DLC, lots, photos et sauvegarde Excel régulière, conservée 10 ans.", null], ["pending", "Ajouter la clé ANTHROPIC_API_KEY dans Vercel", "Nécessaire pour la lecture automatique des BL (étape 1 de la réception). À vérifier si c'est déjà fait.", "moi"], ["pending", "Configurer l'envoi des sauvegardes par mail", "Variables RESEND_API_KEY et BACKUP_FROM_EMAIL dans Vercel (facultatif).", "moi"], ["pending", "Compléter les montants des anomalies sans montant", "Anomalies > Réclamations > vignette « Sans montant » : saisie directe dans la ligne.", "moi"], ["pending", "Compléter l'unité des produits sans unité", "63 produits du mercurial n'ont pas d'unité (filtrer la colonne Unité dans Mercurial > Produits).", "moi"], ["pending", "Ajouter le mail des fournisseurs", "Fiche fournisseur > Coordonnées : sert au mail de réclamation pré-rempli.", "moi"], ["pending", "Fusionner les fournisseurs en double", "Ex. « Producteurs réunies » / « PRODUCTEURS REUNIS » : Supprimer le fournisseur en rattachant tout à l'autre.", "moi"], ["pending", "Décider des fusions d'unités restantes", "Unite → Pièce, Flc → Flacon, Bqt → Barquette ?", "moi"], ["pending", "Choisir l'avenir de « À suivre aujourd'hui » pour les vérifications simples", "Aujourd'hui, seules les réclamations avec relances déclenchent un rappel.", "moi"], ["pending", "Économies : séparer les types d'économies", "Avoirs / livraisons différées, surfacturation évitée (prix bloqués), refus à la livraison — sans double comptage.", "dev"], ["pending", "Économies : bilan mensuel dans Reporting + export Excel pour la compta", "À partir des clôtures hebdomadaires.", "dev"], ["pending", "Menu ⋮ copier / coller : tableau Produits du mercurial et liste des réceptions", "Non encore pris en charge.", "dev"], ["idea", "Glisser-déposer les cartes du tableau de bord des anomalies", "Aujourd'hui : boutons ← / →.", null], ["idea", "Notification (mail ou téléphone) des relances du jour", "", null]];
if (!(await db.execute(sql`select 1 from dev_items limit 1`)).rows.length && !(await db.execute(sql`select 1 from app_settings where key = 'dev_seed_v1'`)).rows.length) {
  let pos = 0;
  for (const [kind, title, detail, owner] of devSeed) await db.execute(sql`insert into dev_items (kind, title, detail, owner, position) values (${kind}, ${title}, ${detail || null}, ${owner}, ${pos++})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_seed_v1', '1') on conflict (key) do nothing`);
}

// Onglet Dev : contraintes de départ et priorités des points en attente (une fois)
const devConstraints = [["constraint", "Format de date JJ/MM/AA", "Partout dans l'application et dans les textes repris des fichiers."], ["constraint", "Pas de défilement horizontal dans les tableaux", "Les colonnes s'adaptent à la largeur de la page ; le texte passe à la ligne."], ["constraint", "Confirmations dans l'application", "Jamais la fenêtre du navigateur : boîte de confirmation de l'appli pour toute suppression."], ["constraint", "Listes triées de A à Z", "Suggestions, fournisseurs, produits, unités."], ["constraint", "« Mail » plutôt que « E-mail »", ""], ["constraint", "Texte des tableaux : première lettre en majuscule", "Sauf les produits du mercurial, les références et les numéros."], ["constraint", "Un n° de BL / facture = une seule réception par fournisseur", "Plusieurs BL possibles dans une même réception."], ["constraint", "Numéros uniques", "N° de produit, de fournisseur (clé), N° de réclamation (1 = la plus ancienne), N° de fiche d'anomalie (définitif à la consolidation)."], ["constraint", "Chaque chiffre doit être justifiable", "Tout montant affiché dans Économies s'ouvre sur la liste des réclamations qui le composent."], ["constraint", "Sauvegarde conservée 10 ans", ""], ["constraint", "Secrets jamais dans les échanges", "Clés API (Anthropic, Resend…) saisies uniquement dans Vercel."]];
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_seed_v2'`)).rows.length) {
  let pos = 1000;
  for (const [kind, title, detail] of devConstraints) await db.execute(sql`insert into dev_items (kind, title, detail, position) values (${kind}, ${title}, ${detail || null}, ${pos++})`);
  await db.execute(sql`update dev_items set priority = 'haute' where kind = 'pending' and priority is null and (title like 'Ajouter la clé%' or title like 'Compléter les montants%')`);
  await db.execute(sql`update dev_items set priority = 'moyenne' where kind = 'pending' and priority is null and owner = 'moi'`);
  await db.execute(sql`update dev_items set priority = 'basse' where kind = 'pending' and priority is null`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_seed_v2', '1') on conflict (key) do nothing`);
}

// Coordonnées des fournisseurs : les champs existants deviennent les coordonnées « Société » (une fois)
await db.execute(sql`update suppliers set contacts = jsonb_build_object('societe', jsonb_strip_nulls(jsonb_build_object('email', email, 'phone', phone, 'notes', notes)))
  where contacts is null and (email is not null or phone is not null or notes is not null)`);

// Fusion « Lerda » → « Les maîtres affineurs (Lerda) » : anomalies, produits, réceptions, écarts… (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'merge_lerda_v1'`)).rows.length) {
  const target = (await db.execute(sql`select id, name from suppliers where upper(name) like '%AFFINEUR%' and upper(name) like '%LERDA%' order by id limit 1`)).rows[0];
  if (target) {
    const sources = (await db.execute(sql`select id from suppliers where upper(name) like '%LERDA%' and id <> ${target.id}`)).rows;
    for (const { id } of sources) {
      await db.execute(sql`update products set supplier_id = ${target.id} where supplier_id = ${id}`);
      await db.execute(sql`update receptions set supplier_id = ${target.id}, supplier_name = ${target.name} where supplier_id = ${id}`);
      await db.execute(sql`update anomalies set supplier_id = ${target.id}, supplier_name = ${target.name} where supplier_id = ${id}`);
      await db.execute(sql`update price_changes set supplier_id = ${target.id}, supplier_name = ${target.name} where supplier_id = ${id}`);
      await db.execute(sql`update weigh_gaps set supplier_id = ${target.id} where supplier_id = ${id}`);
      await db.execute(sql`update maj_log set supplier_id = ${target.id} where supplier_id = ${id}`);
      await db.execute(sql`update claims set supplier_id = ${target.id} where supplier_id = ${id}`);
      await db.execute(sql`delete from suppliers where id = ${id}`);
    }
    await db.execute(sql`update anomalies set supplier_id = ${target.id}, supplier_name = ${target.name} where supplier_id is null and supplier_name ilike '%lerda%'`);
    await db.execute(sql`update weigh_gaps set supplier_id = ${target.id} where supplier_id is null and supplier_ref ilike '%lerda%'`);
    console.log(`[migrate] fournisseurs Lerda rattachés à ${target.name} : ${sources.length}`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('merge_lerda_v1', '1') on conflict (key) do nothing`);
}

// Company : le SIRET devient le SIREN (9 premiers chiffres)
await db.execute(sql`insert into app_settings (key, value) select 'company_siren', left(regexp_replace(value, '\s', '', 'g'), 9) from app_settings where key = 'company_siret' on conflict (key) do nothing`);
await db.execute(sql`delete from app_settings where key = 'company_siret'`);

// Onglet Dev : points traités (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_seed_v3'`)).rows.length) {
  await db.execute(sql`update dev_items set kind = 'done', detail = coalesce(detail, '') || ' → Fait : Bqt fusionnée dans Pièce.', updated_at = now() where kind = 'pending' and title like 'Décider des fusions d''unités%'`);
  await db.execute(sql`update dev_items set kind = 'done', detail = coalesce(detail, '') || ' → Fait : tableau « Par type d''économie » (quantités, prix, qualité, autres).', updated_at = now() where kind = 'pending' and title like 'Économies : séparer%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_seed_v3', '1') on conflict (key) do nothing`);
}

// Onglet Dev : point en attente sur le registre HACCP quotidien (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_seed_v4'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, position) values ('pending', ${"Registre HACCP quotidien + fiche de réception obligatoire en cas de contrôle"}, ${"Le registre HACCP doit être fait au moins une fois par jour. À reprendre quand les règles de conformité et les champs de température obligatoires seront définis : rendre la fiche de réception obligatoire (champs requis, blocage de l'enregistrement si incomplet) et ajouter un rappel quotidien si aucun registre n'a été généré."}, 'moi', 'moyenne', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_seed_v4', '1') on conflict (key) do nothing`);
}

// Seuils de température réglementaires (protocole Conformité) + application par catégorie (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'temp_classes_v1'`)).rows.length) {
  const classes = [
    ["Viandes hachées, viandes séparées mécaniquement", 2, 4],
    ["Produits de la pêche frais, crustacés et mollusques cuits réfrigérés", 2, 4],
    ["Abats d'ongulés", 3, 5],
    ["Préparations culinaires élaborées à l'avance", 3, 5],
    ["Préparations de viandes, volailles, lapins", 4, 6],
    ["Viandes d'ongulés : morceaux de découpe", 4, 6],
    ["Viandes d'ongulés : carcasses et gros morceaux", 7, 9],
    ["Ovoproduits (hors UHT), lait cru", 4, 6],
    ["Autres denrées très périssables", 4, 6],
    ["Autres denrées périssables", 8, 10],
    ["Glaces, viandes hachées et produits de la pêche congelés", -18, -15],
    ["Autres denrées congelées", -12, -9],
  ];
  if (!(await db.execute(sql`select 1 from temp_classes limit 1`)).rows.length) {
    let pos = 0;
    for (const [label, max, reserve] of classes) await db.execute(sql`insert into temp_classes (label, max_temp, reserve_max, position) values (${label}, ${max}, ${reserve}, ${pos++})`);
  }
  const map = { meat: "Préparations de viandes, volailles, lapins", fish: "Produits de la pêche frais, crustacés et mollusques cuits réfrigérés", dairy: "Autres denrées très périssables", deli: "Préparations culinaires élaborées à l'avance", frozen: "Glaces, viandes hachées et produits de la pêche congelés" };
  for (const [code, label] of Object.entries(map)) {
    await db.execute(sql`update categories c set temp_class_id = k.id, conform_max = k.max_temp, reserve_max = k.reserve_max, temp_required = true from temp_classes k where c.code = ${code} and k.label = ${label}`);
  }
  // La ligne « Température … » des règles est désormais calculée à partir des seuils : on la retire du texte
  for (const col of ["conform_rules", "reserve_rules", "refuse_rules"]) {
    await db.execute(sql.raw(`update categories set ${col} = nullif(array_to_string(array(select x from unnest(string_to_array(${col}, E'\\n')) x where x !~* '^\\s*temp[ée]rature'), E'\\n'), '') where ${col} is not null`));
  }
  await db.execute(sql`insert into app_settings (key, value) values ('temp_classes_v1', '1') on conflict (key) do nothing`);
}

// Onglet Dev > Caractéristiques : champs des fiches pré-remplis (obligatoires recommandés), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v1'`)).rows.length) {
  if (!(await db.execute(sql`select 1 from dev_fields limit 1`)).rows.length) {
    const F = [
      // Fiche de réception (saisie sur téléphone)
      ["reception", "Étape 1 · Photos", "Photo du BL / de la facture", true, "Photo nette de toutes les pages. Sans document : cocher « Pas de BL / saisie manuelle » (crée une anomalie « BL manquant »).", "Prenez le BL en photo, ou cochez « Pas de BL / saisie manuelle »."],
      ["reception", "Étape 1 · Photos", "Photo de l'étiquette (lot / DLC)", false, "Recommandée ; à rendre obligatoire pour les produits à DLC obligatoire (preuve de traçabilité).", "Photographiez l'étiquette (n° de lot, DLC) du produit."],
      ["reception", "Étape 1 · Signature", "Signature du livreur", true, "Signature, ou case « Livreur parti sans signer ». Sans l'un des deux, pas d'accès à l'étape 2.", "Faites signer le livreur, ou cochez « Livreur parti sans signer », pour passer à l'étape 2."],
      ["reception", "Étape 2 · Livraison", "Fournisseur", true, "Choisi dans la liste (ou « Autre fournisseur » avec son nom).", "Choisissez le fournisseur pour continuer."],
      ["reception", "Étape 2 · Livraison", "Date et heure de livraison", true, "Pas dans le futur.", "Indiquez la date et l'heure de la livraison."],
      ["reception", "Étape 2 · Livraison", "Type et N° de document (BL / Facture)", true, "Obligatoire sauf « Pas de BL ». Un même N° ne peut pas être enregistré deux fois pour un fournisseur.", "Ce N° de document est déjà enregistré pour ce fournisseur."],
      ["reception", "Étape 2 · Livraison", "Date du document", true, "Date imprimée sur le BL / la facture (rapprochement comptable).", "Indiquez la date figurant sur le document."],
      ["reception", "Étape 2 · Livraison", "Nom du livreur", false, "Proposé à partir des livreurs connus du fournisseur.", ""],
      ["reception", "Étape 2 · Livraison", "T° du camion", true, "Obligatoire dès qu'un produit de la livraison a un seuil de température.", "Relevez la température du camion (produits frais ou surgelés)."],
      ["reception", "Étape 2 · Livraison", "Propreté du véhicule", true, "Oui / Non ; « Non » crée une anomalie Hygiène.", "Indiquez si le véhicule est propre."],
      ["reception", "Étape 3 · Produits", "Produit", true, "Choisi dans le mercurial du fournisseur ; un produit hors mercurial est signalé.", "Choisissez ou saisissez le produit."],
      ["reception", "Étape 3 · Produits", "Q Facturée", true, "Nombre ≥ 0, dans l'unité du produit.", "Saisissez la quantité facturée."],
      ["reception", "Étape 3 · Produits", "Q Contrôlée", true, "Nombre ≥ 0 ; un écart avec la Q facturée propose une réserve (au kg : écart de pesée).", "Saisissez la quantité contrôlée."],
      ["reception", "Étape 3 · Produits", "Unité", true, "Unité du mercurial (Pièce par défaut).", ""],
      ["reception", "Étape 3 · Produits", "T° produit", true, "Obligatoire pour les catégories avec seuil (protocole Conformité) ; au-delà du seuil : réserve ou refus proposé.", "Relevez la température à cœur de ce produit."],
      ["reception", "Étape 3 · Produits", "DLC / DDM", true, "Obligatoire pour les produits frais (sauf fruits et légumes, épicerie sèche, hygiène). Dépassée : refus proposé ; courte : réserve.", "Saisissez la DLC de ce produit avant de terminer."],
      ["reception", "Étape 3 · Produits", "N° de lot", true, "Recommandé obligatoire pour les produits à DLC (traçabilité en cas de rappel).", "Saisissez le n° de lot (traçabilité)."],
      ["reception", "Étape 3 · Produits", "Prix unitaire", true, "Comparé au mercurial ; ≥ +10 % au-dessus du maximum : anomalie prix ; prix bloqué non respecté : anomalie.", "Saisissez le prix unitaire facturé."],
      ["reception", "Étape 3 · Produits", "Décision (conforme / réserve / refus)", true, "Toujours choisie par l'utilisateur (jamais cochée automatiquement).", "Choisissez une décision pour chaque produit avant de terminer."],
      ["reception", "Étape 3 · Produits", "Motif", true, "Obligatoire si réserve ou refus.", "Indiquez le motif de la réserve ou du refus."],
      ["reception", "Étape 3 · Produits", "Photo du problème", true, "Recommandée obligatoire si réserve ou refus (preuve pour la réclamation).", "Prenez une photo du problème."],
      ["reception", "Étape 3 · Produits", "Note", false, "Texte libre sur le produit.", ""],
      ["reception", "Étape 4 · Validation", "Texte des réserves", false, "Généré automatiquement, modifiable ; à recopier sur le BL.", ""],
      // Anomalie
      ["anomaly", "Fiche", "Type d'anomalie", true, "Liste des types (Dev > Règles).", "Choisissez le type d'anomalie."],
      ["anomaly", "Fiche", "Fournisseur", true, "Rattaché au compte fournisseur.", ""],
      ["anomaly", "Fiche", "Produit", true, "Sauf Hygiène et BL manquant.", ""],
      ["anomaly", "Fiche", "Description", true, "Écart constaté, clair et chiffré (ex. « 2 kg manquants sur 10 facturés »).", "Décrivez l'écart constaté."],
      ["anomaly", "Fiche", "Type de suivi", true, "Réclamation avec relances / Vérification de l'avoir avec ou sans réclamation.", ""],
      ["anomaly", "Fiche", "Montant réclamé", true, "Obligatoire avant de passer en « Réclamée » (base des économies).", "Indiquez le montant réclamé avant de marquer la réclamation comme envoyée."],
      ["anomaly", "Clôture", "Résolution", true, "Avoir / régularisation, livraison, sans suite.", "Indiquez comment l'anomalie a été résolue."],
      ["anomaly", "Clôture", "Montant de l'avoir", true, "Obligatoire si résolution « Avoir / régularisation ».", "Saisissez le montant de l'avoir."],
      ["anomaly", "Clôture", "N° et date de l'avoir / de la facture", true, "Obligatoires si résolution « Avoir / régularisation » (rapprochement comptable).", "Saisissez le n° et la date de l'avoir."],
      // Réclamation
      ["claim", "Envoi", "Contact de réclamation (mail / téléphone)", true, "Pris dans le compte fournisseur (bloc Réclamation).", "Ajoutez un mail de réclamation dans le compte du fournisseur."],
      ["claim", "Envoi", "Date d'envoi", true, "Renseignée au passage en « Réclamée ».", ""],
      ["claim", "Suivi", "Date de dernière relance", true, "Relance au-delà du délai du fournisseur (3 jours par défaut).", ""],
      ["claim", "Suivi", "Réponse du fournisseur", false, "Texte libre.", ""],
      // Écart de pesée
      ["weigh", "Pesée", "Poids facturé (kg)", true, "Repris du bon.", ""],
      ["weigh", "Pesée", "Poids pesé (kg)", true, "Poids net (tare des contenants déduite).", "Saisissez le poids pesé."],
      ["weigh", "Pesée", "Contenant (tare)", false, "Liste des contenants (Process pèse).", ""],
      // Produit du mercurial
      ["product", "Mercurial", "Nom", true, "Unique par fournisseur.", ""],
      ["product", "Mercurial", "Fournisseur", true, "", ""],
      ["product", "Mercurial", "Catégorie", true, "Détermine le seuil de température et la DLC obligatoire.", "Choisissez la catégorie du produit."],
      ["product", "Mercurial", "Unité", true, "Pièce par défaut.", ""],
      ["product", "Mercurial", "Prix (min / max)", true, "Référence du contrôle des prix.", ""],
      ["product", "Mercurial", "Nature", false, "Voir le récapitulatif Catégorie / Nature.", ""],
      // Fournisseur
      ["supplier", "Compte", "Nom", true, "Unique.", ""],
      ["supplier", "Compte", "Mail de réclamation", true, "Recommandé obligatoire : utilisé par le bouton mail des anomalies.", "Ajoutez un mail de réclamation."],
      ["supplier", "Compte", "Process de réclamation", false, "Délai de relance déduit du texte (jour même, 48 h…).", ""],
      ["supplier", "Compte", "SIREN / TVA", false, "9 chiffres pour le SIREN.", ""],
      // Fiche de réception de marchandises
      ["sheet", "Fiche du jour", "Fiche éditée", true, "Au moins une fois par jour.", "La fiche de réception du jour n'a pas encore été éditée."],
      ["sheet", "Fiche du jour", "Validation du responsable", true, "Obligatoire avant tout export ; une fois validée, la fiche n'est plus modifiable.", "Cette fiche doit être validée par le responsable avant export."],
      ["sheet", "Modification", "Motif de la modification", true, "Toute modification d'une fiche validée crée une nouvelle version à valider.", "Indiquez le motif de la modification."],
    ];
    let pos = 0;
    for (const [form, section, field, required, rule, message] of F) {
      await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${form}, ${section}, ${field}, ${required}, ${rule || null}, ${message || null}, ${pos++})`);
    }
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v1', '1') on conflict (key) do nothing`);
}

// Onglet Dev : nouveaux points en attente (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_seed_v5'`)).rows.length) {
  let pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  const items = [
    ["Indications à l'utilisateur quand une règle bloque", "Afficher sur chaque fiche (réception, anomalie, réclamation, écart de pesée, produit, fournisseur, fiche de réception de marchandises) un message clair quand un champ obligatoire manque, pour ne pas bloquer l'utilisateur sans explication (ex. « on ne peut pas passer à l'étape 2 si… »). Base : colonne « Message affiché » de Dev > Caractéristiques.", "dev", "haute"],
    ["Photo de l'étiquette (lot / DLC) obligatoire pour les produits à DLC obligatoire", "Aujourd'hui facultative à l'étape 1. À rendre obligatoire pour les produits dont la DLC est obligatoire (une fois les règles validées dans Dev > Caractéristiques).", "moi", "moyenne"],
    ["Paramétrer les champs obligatoires (Dev > Caractéristiques)", "Premier paramétrage : vérifier la liste pré-remplie (obligatoire, règle de saisie, message), puis l'appliquer dans l'application.", "moi", "haute"],
    ["Modèles « Fiche d'organisation à réception » et « Fiche de suivi d'anomalie »", "Onglets 2 et 3 du fichier Model_2 : à préciser (quand les éditer, qui les valide, export PDF / Excel).", "moi", "basse"],
  ];
  for (const [title, detail, owner, priority] of items) await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, position) values ('pending', ${title}, ${detail}, ${owner}, ${priority}, ${pos++})`);
  await db.execute(sql`update dev_items set detail = coalesce(detail, '') || ' → Fait : fiche de réception de marchandises journalière (N° annuel, validation du responsable, modifications avec historique, rappel sur l''Accueil, archivage 5 ans). Reste : champs obligatoires (Dev > Caractéristiques).', updated_at = now() where kind = 'pending' and title like 'Registre HACCP quotidien%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_seed_v5', '1') on conflict (key) do nothing`);
}

// Seuils : marges acceptables réglementaires (remplacent les marges de réserve provisoires), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'temp_classes_v2'`)).rows.length) {
  const margin = {
    "Viandes hachées, viandes séparées mécaniquement": null,
    "Produits de la pêche frais, crustacés et mollusques cuits réfrigérés": null,
    "Abats d'ongulés": 6,
    "Préparations culinaires élaborées à l'avance": null,
    "Viandes d'ongulés : morceaux de découpe": 7,
    "Viandes d'ongulés : carcasses et gros morceaux": null,
    "Ovoproduits (hors UHT), lait cru": null,
    "Autres denrées très périssables": null,
    "Autres denrées périssables": null,
    "Glaces, viandes hachées et produits de la pêche congelés": -15,
    "Autres denrées congelées": null,
  };
  for (const [label, reserve] of Object.entries(margin)) await db.execute(sql`update temp_classes set reserve_max = ${reserve} where label = ${label}`);
  // « Préparations de viandes, volailles, lapins » : sans tolérance pour les préparations, +3 °C pour volailles et lapins
  await db.execute(sql`update temp_classes set label = 'Préparations de viandes', reserve_max = null where label = 'Préparations de viandes, volailles, lapins'`);
  if (!(await db.execute(sql`select 1 from temp_classes where label = 'Volailles, lapins, petit gibier'`)).rows.length) {
    const pos = (await db.execute(sql`select position from temp_classes where label = 'Préparations de viandes'`)).rows[0]?.position ?? 5;
    await db.execute(sql`update temp_classes set position = position + 1 where position > ${pos}`);
    await db.execute(sql`insert into temp_classes (label, max_temp, reserve_max, position) values ('Volailles, lapins, petit gibier', 4, 7, ${Number(pos) + 1})`);
  }
  await db.execute(sql`update categories c set conform_max = k.max_temp, reserve_max = k.reserve_max from temp_classes k where c.temp_class_id = k.id`);
  await db.execute(sql`insert into app_settings (key, value) values ('temp_classes_v2', '1') on conflict (key) do nothing`);
}

// Dev > Fiches : champs mis à jour (conformité Conforme / Refus, signature du réceptionnaire, fiche automatique), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v2'`)).rows.length) {
  const upd = async (form, field, set) => {
    await db.execute(sql`update dev_fields set field = coalesce(${set.field ?? null}, field), rule = coalesce(${set.rule ?? null}, rule), message = coalesce(${set.message ?? null}, message), required = coalesce(${set.required ?? null}, required), updated_at = now() where form = ${form} and field = ${field}`);
  };
  await upd("reception", "Signature du livreur", { rule: "Signature du livreur, ou case « Livreur parti sans signer ». Sans l'un des deux, pas d'accès à l'étape 2." });
  await upd("reception", "T° du camion", { rule: "Obligatoire dès qu'un produit a un seuil de température ; au-delà du seuil + marge acceptable de la denrée : refus proposé pour ces produits." });
  await upd("reception", "Q Contrôlée", { rule: "Nombre ≥ 0 ; un écart avec la Q facturée est signalé (anomalie + note sur le BL) sans changer la conformité (au kg : écart de pesée)." });
  await upd("reception", "T° produit", { rule: "Obligatoire pour les catégories avec seuil (protocole Conformité) ; dans la marge acceptable : conforme ; au-delà : refus proposé." });
  await upd("reception", "DLC / DDM", { rule: "Obligatoire pour les produits frais (viandes, poissons, surgelés). Dépassée : refus proposé ; courte : signalée." });
  await upd("reception", "Décision (conforme / réserve / refus)", { field: "Conformité produit (Conforme / Refus)", rule: "Proposée automatiquement : Conforme si T° camion, T° produit et DLC sont conformes ; Refus sinon. L'utilisateur peut toujours refuser un produit conforme. Plus d'étape « Réserve ».", message: "Complétez la T° ou la DLC du produit, ou choisissez Conforme / Refus." });
  await upd("reception", "Motif", { rule: "Obligatoire en cas de refus (proposé automatiquement d'après les contrôles)." });
  await upd("reception", "Photo du problème", { rule: "Recommandée obligatoire en cas de refus (preuve pour la réclamation)." });
  await upd("reception", "Texte des réserves", { rule: "Généré automatiquement (refus, manques, véhicule, T° camion), modifiable ; à recopier sur le BL." });
  await upd("sheet", "Fiche éditée", { field: "Fiche générée", rule: "Générée et mise à jour automatiquement à chaque réception (création, modification, suppression), au moins une par jour de livraison.", message: "" });
  if (!(await db.execute(sql`select 1 from dev_fields where form = 'reception' and field like 'Signature du réceptionnaire%'`)).rows.length) {
    const pos = (await db.execute(sql`select position from dev_fields where form = 'reception' and field = 'Signature du livreur'`)).rows[0]?.position ?? 2;
    await db.execute(sql`update dev_fields set position = position + 1 where position > ${pos}`);
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Étape 1 · Signature', 'Signature du réceptionnaire (nom, prénom, signature)', true, 'Nom et prénom de l''utilisateur connecté (à saisir pour un invité ou un compte sans nom) + signature. Obligatoire avant l''enregistrement de la réception.', 'Indiquez votre nom et prénom et signez avant d''enregistrer la réception.', ${Number(pos) + 1})`);
  }
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  await db.execute(sql`insert into dev_items (kind, title, detail, position) values ('constraint', ${"Tenir à jour Dev > Caractéristiques et Dev > Automatisations"}, ${"À chaque évolution d'une fiche ou d'une règle automatique, le tableau « Fiches : champs obligatoires et règles de saisie » et la vue d'ensemble des automatisations sont mis à jour automatiquement."}, ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v2', '1') on conflict (key) do nothing`);
}

// Dev > Fiches : fiche de réception de marchandises = exports (auto 23 h + manuel), plus de validation ni de modification, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v3'`)).rows.length) {
  await db.execute(sql`delete from dev_fields where form = 'sheet' and field in ('Validation du responsable', 'Motif de la modification')`);
  await db.execute(sql`update dev_fields set field = 'Export automatique (23 h)', rule = 'Chaque jour à 23 h : fiche des bons du jour (N° annuel, contenu figé) ; les bons sont consolidés en même temps et ne sont plus modifiables. Un export n''est jamais modifié.', message = null, updated_at = now() where form = 'sheet' and field in ('Fiche générée', 'Fiche éditée')`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  if (!(await db.execute(sql`select 1 from dev_fields where form = 'sheet' and field = 'Export manuel'`)).rows.length) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('sheet', 'Export manuel', 'Export manuel', false, 'Demande exceptionnelle : bons choisis librement ; la fiche porte la mention « Export manuel ». Ne consolide rien.', 'Cochez au moins un bon à exporter.', ${pos})`);
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Après enregistrement', 'Modification d''un bon', false, 'Possible jusqu''à l''export automatique de 23 h ; ensuite le bon est consolidé (plus modifiable) et une non-conformité se suit par son anomalie.', 'Ce bon a été consolidé par l''export du soir : il n''est plus modifiable.', ${pos + 1})`);
  }
  await db.execute(sql`update dev_items set detail = coalesce(detail, '') || ' → Mis à jour : export automatique chaque soir à 23 h (consolide les bons du jour) + export manuel ; plus de validation ni de modification.', updated_at = now() where kind = 'pending' and title like 'Registre HACCP quotidien%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v3', '1') on conflict (key) do nothing`);
}

// Dev : objectifs supprimés (recopiés ailleurs) + champs de la fiche de réception mis à jour, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v4'`)).rows.length) {
  await db.execute(sql`delete from dev_items where kind = 'objective'`);
  await db.execute(sql`delete from dev_fields where form = 'reception' and field = 'Nom du livreur'`);
  await db.execute(sql`update dev_fields set required = true, rule = 'Obligatoire pour chaque produit. Comparé au mercurial ; ≥ +10 % au-dessus du maximum : anomalie prix ; prix bloqué non respecté : anomalie.', message = 'Saisissez le prix unitaire de chaque produit : le prix est obligatoire.', updated_at = now() where form = 'reception' and field = 'Prix unitaire'`);
  await db.execute(sql`update dev_fields set field = 'Conformité produit (Acceptée / Refus)', required = true, rule = 'Obligatoire. Proposée automatiquement : Acceptée si T° camion, T° produit et DLC sont conformes ; Refus sinon. L''utilisateur peut toujours refuser un produit.', message = 'Choisissez Acceptée ou Refus pour chaque produit avant de terminer.', updated_at = now() where form = 'reception' and field like 'Conformité produit%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v4', '1') on conflict (key) do nothing`);
}

// Dev > Projet : analyse concurrence / offre ajoutée au document (sans rien effacer) + tâches, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v2'`)).rows.length) {
  const section = "\n<h2>10. Positionnement, offre et différenciation (analyse du 18/11/2026)</h2>\n<div data-callout=\"\" data-variant=\"warning\"><p>Sources : tableau comparatif « Appli » (prix et fonctions des concurrents non revérifiés). Pense à réserver l'onglet Dev à ton compte si d'autres administrateurs ont accès à l'application.</p></div>\n<h3>Position sur le marché</h3>\n<ul>\n<li><p><strong>Applis HACCP (0 à 55 €/mois)</strong> : contrôle sanitaire à réception, mais ni quantités, ni prix, ni avoirs.</p></li>\n<li><p><strong>Gestion de restaurant (49 à 180 €/mois)</strong> : contrôle économique, HACCP en option payante (ex. +38 €).</p></li>\n<li><p><strong>Notre position</strong> : la réception complète, sanitaire et économique, du camion jusqu'à l'avoir encaissé.</p></li>\n</ul>\n<h3>Minimum pour une version commercialisable</h3>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Plusieurs clients et plusieurs établissements (comptes séparés, paramétrage par client) : prérequis n° 1</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Module commandes relié à la réception : commandé / livré / facturé</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Abonnement et paiement en ligne, conditions générales, RGPD, hébergement des données en Europe</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Rapprochement BL / facture (factures électroniques)</p></li>\n</ul>\n<p>À ne pas développer pour la version de base : stocks, inventaires, fiches techniques, caisse.</p>\n<h3>Offre envisagée</h3>\n<table><tbody>\n<tr><th><p>Offre</p></th><th><p>Contenu</p></th><th><p>Prix (HT/mois/site)</p></th></tr>\n<tr><td><p>Réception</p></td><td><p>HACCP + contrôle économique + réclamations + économies + fiche DDPP</p></td><td><p>59 à 69 €</p></td></tr>\n<tr><td><p>Réception + Commandes</p></td><td><p>+ commandes reliées à la réception</p></td><td><p>89 à 99 €</p></td></tr>\n<tr><td><p>Groupe</p></td><td><p>Plusieurs sites, tableau de bord commun</p></td><td><p>Dégressif ou sur devis</p></td></tr>\n<tr><td><p>Mise en place</p></td><td><p>Import mercurial, fournisseurs, protocoles, seuils</p></td><td><p>150 à 300 € une fois</p></td></tr>\n</tbody></table>\n<p>Lecture des BL : quota inclus (150 à 200 BL/mois), au-delà facturé. Argument : l'argent récupéré, mesuré chaque mois (calcul coût / gains ci-dessus).</p>\n<h3>Ce qui nous démarque déjà</h3>\n<ul>\n<li><p>Chaîne complète : anomalie → réclamation avec relances par fournisseur → avoir vérifié → économie justifiée.</p></li>\n<li><p>HACCP inclus, sans module en supplément ; aucun matériel à acheter.</p></li>\n<li><p>Fiche de réception DDPP exportée automatiquement chaque soir, figée, archivée 5 ans.</p></li>\n<li><p>Conformité proposée automatiquement (seuils réglementaires et marges acceptables).</p></li>\n<li><p>Cas du terrain : écarts de pesée avec tares, prix bloqués, fruits et légumes au prix du mois, suivi des prix automatique.</p></li>\n<li><p>Conçue sur un vrai restaurant, par quelqu'un du métier.</p></li>\n</ul>\n<h3>Pistes pour se démarquer davantage</h3>\n<ul>\n<li><p>Commandes reliées à la réception dès l'offre de base.</p></li>\n<li><p>Rapport mensuel envoyé au gérant (économies, fournisseurs à problèmes, hausses de prix).</p></li>\n<li><p>Comparaison anonymisée des prix entre clients (cadre juridique à vérifier).</p></li>\n<li><p>Lecture et rapprochement automatiques des factures électroniques.</p></li>\n</ul>\n<h3>Points faibles à traiter</h3>\n<ul>\n<li><p>Pas encore d'avis clients ni de références.</p></li>\n<li><p>Dépendance à une seule personne ; support et formation à organiser.</p></li>\n</ul>\n";
  await db.execute(sql`update app_settings set value = value || ${section} where key = 'dev_project_doc' and position('10. Positionnement' in value) = 0`);
  let pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  const items = [
    ["Plusieurs clients et plusieurs établissements", "Prérequis n° 1 pour vendre : comptes séparés par client et par établissement, paramétrage par client (fournisseurs, mercurial, protocoles, seuils), reprise des données.", "dev", "haute"],
    ["Module commandes relié à la réception", "Commande depuis le mercurial par fournisseur, envoi par mail ou PDF ; à la réception, lignes pré-remplies et comparaison commandé / livré / facturé.", "dev", "haute"],
    ["Offre commerciale : abonnement, paiement, CGV, RGPD", "Offres Réception / Réception + Commandes / Groupe, mise en place, quota de lectures de BL ; paiement en ligne ; conditions générales ; données hébergées en Europe.", "moi", "moyenne"],
    ["Rapprochement BL / facture (factures électroniques)", "Lire les factures (électroniques ou PDF) et les comparer au BL et à la commande.", "dev", "moyenne"],
    ["Rapport mensuel des économies envoyé au gérant", "Économies obtenues, en attente, fournisseurs à problèmes, hausses de prix : preuve mensuelle de la rentabilité.", "dev", "basse"],
  ];
  for (const [title, detail, owner, priority] of items) await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, position) values ('pending', ${title}, ${detail}, ${owner}, ${priority}, ${pos++})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v2', '1') on conflict (key) do nothing`);
}

// Dev > Projet : note « Proposition au restaurant et propriété de l'application » ajoutée au document (sans rien effacer), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v3'`)).rows.length) {
  const section = "\n<h2>11. Proposition au restaurant et propriété de l'application (note du 18/11/2026)</h2>\n<div data-callout=\"\" data-variant=\"danger\"><p>Note personnelle : réserver l'onglet Dev à mon compte (bouton en haut de Dev) pour que les autres administrateurs ne la voient pas. Ceci n'est pas un avis juridique : à faire valider par un avocat en propriété intellectuelle.</p></div>\n<h3>Coût d'une embauche à 2 000 € net</h3>\n<ul>\n<li><p>Environ 3 300 à 3 700 € par mois pour l'entreprise, soit 40 à 45 k€ par an (à confirmer par l'expert-comptable).</p></li>\n<li><p>Achats estimés : 3 à 3,5 M€ par an (25 à 30 % de 12 M€ de chiffre d'affaires, hypothèse).</p></li>\n<li><p>Récupérer 1,5 % des achats (45 à 50 k€) suffit à financer le poste ; l'application mesure et justifie ces économies chaque mois.</p></li>\n<li><p>Pour l'ouverture d'autres établissements : pas de logiciel du marché à 100–200 € par mois et par site, ni d'option HACCP.</p></li>\n</ul>\n<h3>Proposition : séparer l'emploi et l'application</h3>\n<ol>\n<li><p><strong>Contrat de travail</strong> : poste « Responsable achats et contrôle des coûts » (gestion de l'application + recherche d'économies). Fixe 2 000 € net + prime sur les économies justifiées au-delà du coût du poste.</p></li>\n<li><p><strong>Licence d'utilisation de l'application</strong> : je reste propriétaire du code ; gratuite ou peu chère pour ce restaurant tant que j'y travaille, payante par nouvel établissement.</p></li>\n<li><p><strong>S'il veut posséder l'application</strong> : cession payante, à un prix fixé par écrit, plutôt qu'un abandon gratuit.</p></li>\n</ol>\n<p>Risques si le code est donné avec l'embauche : impossible de vendre l'application à d'autres restaurants ; elle reste chez lui en cas de départ ; gain limité au salaire.</p>\n<h3>Propriété du code : ce qui compte</h3>\n<ul>\n<li><p>Le process, les protocoles, les fournisseurs et les prix fournis par le restaurant sont des informations et des contenus : ils ne rendent pas le restaurant propriétaire du code (une idée ou un cahier des charges n'est pas protégé, le code l'est). Ces données sont à eux : à retirer avant toute vente à un autre client ; leurs textes de protocoles restent à eux.</p></li>\n<li><p>Point clé : un logiciel créé par un salarié dans le cadre de ses fonctions ou sur instruction de l'employeur appartient à l'employeur (article L113-9 du Code de la propriété intellectuelle). Temps de travail, matériel de l'entreprise et demande de l'employeur comptent beaucoup.</p></li>\n<li><p>Créé de ma propre initiative, sur mon temps personnel et hors de mon poste : il est à moi. Sans statut de salarié, je garde les droits tant que rien n'est signé (une cession de droits doit être écrite).</p></li>\n</ul>\n<h3>À faire avant de négocier</h3>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Garder les preuves datées : historique GitHub ; dépôt à l'APP (Agence pour la protection des programmes) ou enveloppe Soleau (INPI)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Garder à mon nom les comptes GitHub, Vercel, Neon et Anthropic</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Faire écrire dans le contrat que l'application existante m'appartient et reste hors contrat, et préciser à qui reviennent les améliorations faites pendant l'emploi (sinon : à l'employeur)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Faire relire le contrat par un avocat en propriété intellectuelle avant de signer</p></li>\n</ul>\n";
  await db.execute(sql`update app_settings set value = value || ${section} where key = 'dev_project_doc' and position('11. Proposition au restaurant' in value) = 0`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v3', '1') on conflict (key) do nothing`);
}

// Dev > Projet : section 11 remplacée par le scénario CDD 6 mois (le reste du document est conservé), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v4'`)).rows.length) {
  const section = "\n<h2>11. Proposition au restaurant et propriété de l'application (mise à jour du 18/11/2026)</h2>\n<div data-callout=\"\" data-variant=\"danger\"><p>Note personnelle : réserver l'onglet Dev à mon compte (bouton en haut de Dev) pour que les autres administrateurs ne la voient pas. Ceci n'est pas un avis juridique : à faire valider par un avocat en propriété intellectuelle et par l'expert-comptable.</p></div>\n\n<h3>La proposition</h3>\n<table><tbody>\n<tr><th><p>Élément</p></th><th><p>Proposition</p></th></tr>\n<tr><td><p>Contrat</p></td><td><p>CDD de 6 mois, poste « Contrôleur de coûts » (gestion de l'application + recherche d'économies)</p></td></tr>\n<tr><td><p>Fixe</p></td><td><p>31 000 € brut par an (environ 2 000 € net par mois)</p></td></tr>\n<tr><td><p>Prime</p></td><td><p>10 % des économies justifiées</p></td></tr>\n<tr><td><p>Application</p></td><td><p>Utilisation gratuite pendant le CDD ; je reste propriétaire du code</p></td></tr>\n<tr><td><p>Bilan</p></td><td><p>Point au bout de 6 mois, chiffres de l'application à l'appui</p></td></tr>\n</tbody></table>\n\n<h3>Coût pour le restaurant sur 6 mois (estimation)</h3>\n<ul>\n<li><p>Fixe : environ 15 500 € brut, soit environ 21 000 € chargé pour l'entreprise.</p></li>\n<li><p>Indemnité de fin de CDD : 10 % de la rémunération brute (environ 1 550 € et plus selon la prime), due si le CDD n'est pas suivi d'un CDI.</p></li>\n<li><p>Prime : 10 % des économies, donc payée par les économies elles-mêmes.</p></li>\n<li><p>Argument : avec environ 3 à 3,5 M€ d'achats par an (hypothèse), récupérer 1,5 % sur 6 mois (environ 25 k€) couvre le poste ; l'application justifie chaque euro.</p></li>\n</ul>\n\n<h3>À faire préciser par écrit</h3>\n<ul>\n<li><p><strong>Motif du CDD</strong> : un CDD doit avoir un motif prévu par la loi. Faire vérifier lequel par l'expert-comptable ; sinon, un CDI avec période d'essai donne la même souplesse.</p></li>\n<li><p><strong>Calcul de la prime</strong> : « économies justifiées » = avoirs et régularisations obtenus + livraisons différées, comme dans Reporting &gt; Économies (hors montants en attente) ; préciser si les baisses de prix négociées comptent, et sur quelle durée ; versement mensuel ou trimestriel.</p></li>\n<li><p><strong>Application</strong> : licence d'utilisation gratuite pendant le CDD, sans cession des droits ; l'application existante reste ma propriété et hors du contrat de travail ; les améliorations faites pendant le CDD restent à moi (sinon elles reviennent à l'employeur, article L113-9 du Code de la propriété intellectuelle).</p></li>\n<li><p><strong>Données</strong> : les données du restaurant (fournisseurs, prix, anomalies, protocoles) restent à lui ; export complet remis en cas de fin de collaboration.</p></li>\n</ul>\n\n<h3>Le point à 6 mois : options à préparer</h3>\n<ul>\n<li><p>Bilan chiffré : économies obtenues, en attente, temps gagné, fiches DDPP.</p></li>\n<li><p>Suite possible : CDI avec un fixe revu à la hausse selon les résultats, prime maintenue ; licence payante pour chaque nouvel établissement (offre envisagée en section 10).</p></li>\n<li><p>Si la collaboration s'arrête : l'application reste à moi, les données sont rendues au restaurant.</p></li>\n</ul>\n\n<h3>Propriété du code : ce qui compte</h3>\n<ul>\n<li><p>Le process, les protocoles, les fournisseurs et les prix fournis par le restaurant sont des informations : ils ne rendent pas le restaurant propriétaire du code (seul le code est protégé, pas les idées ni le cahier des charges). Ces données sont à eux : à retirer avant toute vente à un autre client.</p></li>\n<li><p>Un logiciel créé par un salarié dans le cadre de ses fonctions ou sur instruction de l'employeur appartient à l'employeur. Créé de ma propre initiative, sur mon temps personnel et hors de mon poste, il est à moi ; une cession de droits doit toujours être écrite.</p></li>\n</ul>\n\n<h3>À faire avant de négocier</h3>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Garder les preuves datées : historique GitHub ; dépôt à l'APP (Agence pour la protection des programmes) ou enveloppe Soleau (INPI)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Garder à mon nom les comptes GitHub, Vercel, Neon et Anthropic</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Faire vérifier le motif du CDD et le coût exact par l'expert-comptable</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Faire relire le contrat (licence gratuite, propriété, prime) par un avocat en propriété intellectuelle avant de signer</p></li>\n</ul>\n";
  await db.execute(sql`update app_settings set value = case when position('<h2>11. Proposition au restaurant' in value) > 0 then left(value, position('<h2>11. Proposition au restaurant' in value) - 1) || ${section} else value || ${section} end where key = 'dev_project_doc'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v4', '1') on conflict (key) do nothing`);
}

// Protocoles : procédures simplifiées de réception et de réclamation, dans un dossier « Procédures » (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'procedures_v1'`)).rows.length) {
  const procs = [["Procédure de réception", "<h1>Procédure de réception</h1>\n<div data-callout=\"\" data-variant=\"info\"><p><strong>Pour qui :</strong> toute personne qui réceptionne une livraison. <strong>Avec quoi :</strong> le téléphone (application, menu Réceptions &gt; Nouvelle réception) et la sonde. L'application vous guide et vous bloque si quelque chose manque, avec un message qui dit quoi faire.</p></div>\n<h2>Le schéma</h2>\n<table><tbody>\n<tr><th><p>Étape</p></th><th><p>Ce que je fais</p></th><th><p>Ce que l'application fait</p></th></tr>\n<tr><td><p><strong>1. Photos et signatures</strong></p></td><td><p>Photo du BL (ou « Pas de BL »), photo de l'étiquette, signature du livreur (ou « Livreur parti sans signer »), ma signature</p></td><td><p>Lit le BL et pré-remplit le fournisseur et les produits</p></td></tr>\n<tr><td><p><strong>2. Livraison</strong></p></td><td><p>Je vérifie le fournisseur et le N° de BL, je relève la T° du camion et sa propreté</p></td><td><p>Enregistre un brouillon ; refuse un N° de BL déjà saisi</p></td></tr>\n<tr><td><p><strong>3. Produits</strong></p></td><td><p>Pour chaque produit : quantité contrôlée, T° à cœur, DLC et lot, prix unitaire</p></td><td><p>Propose Acceptée ou Refus (voir la procédure de conformité)</p></td></tr>\n<tr><td><p><strong>4. Validation</strong></p></td><td><p>Je relis, je recopie le texte des réserves sur le BL, j'enregistre</p></td><td><p>Crée les anomalies, met à jour les prix ; enregistre même sans réseau</p></td></tr>\n</tbody></table>\n<h2>1. Photos et signatures</h2>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Photo du BL ou de la facture, bien à plat, une photo par page</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Photo de l'étiquette (lot, DLC) des produits frais</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Faire signer le livreur, ou cocher « Livreur parti sans signer »</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Signer à mon tour (mon nom s'affiche)</p></li>\n</ul>\n<h2>2. Livraison</h2>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Vérifier le fournisseur, la date et le N° du BL / de la facture</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Relever la T° du camion et noter s'il est propre</p></li>\n</ul>\n<h2>3. Produits</h2>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Compter ou peser : Q contrôlée (la Q facturée est celle du BL)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>T° à cœur des produits frais et surgelés</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>DLC et n° de lot (obligatoires pour viandes, poissons, surgelés)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Prix unitaire (obligatoire)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Vérifier la décision proposée : Acceptée ou Refus ; si Refus : motif + photo</p></li>\n</ul>\n<h2>4. Validation</h2>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Relire le récapitulatif</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Recopier le texte des réserves sur le BL avant que le livreur parte</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Appuyer sur « Enregistrer la réception »</p></li>\n</ul>\n<h2>En cas de problème</h2>\n<table><tbody>\n<tr><th><p>Situation</p></th><th><p>Que faire</p></th></tr>\n<tr><td><p>Pas de BL</p></td><td><p>« Pas de BL / saisie manuelle » à l'étape 1 ; une anomalie BL manquant est créée</p></td></tr>\n<tr><td><p>Le livreur est parti sans signer</p></td><td><p>Cocher « Livreur parti sans signer »</p></td></tr>\n<tr><td><p>Produit trop chaud, DLC dépassée, emballage abîmé</p></td><td><p>Refus + motif + photo ; le livreur reprend le produit ; l'écrire sur le BL</p></td></tr>\n<tr><td><p>Produit manquant ou en trop</p></td><td><p>Saisir la quantité réellement livrée ; l'écart est réclamé automatiquement</p></td></tr>\n<tr><td><p>Pas de réseau</p></td><td><p>Terminer quand même : la réception part dès que le réseau revient</p></td></tr>\n<tr><td><p>Je dois m'interrompre</p></td><td><p>« Enregistrement brouillon » ; le brouillon apparaît dans le tableau des réceptions</p></td></tr>\n<tr><td><p>Erreur vue après coup</p></td><td><p>Corriger le bon avant 23 h ; après, il est consolidé : signaler l'erreur au responsable</p></td></tr>\n</tbody></table>\n<div data-callout=\"\" data-variant=\"warning\"><p>Chaque soir à 23 h, la fiche de réception du jour est exportée et les bons sont consolidés : ils ne sont plus modifiables.</p></div>", 1], ["Procédure de réclamation", "<h1>Procédure de réclamation</h1>\n<div data-callout=\"\" data-variant=\"info\"><p><strong>Pour qui :</strong> l'économe ou la personne chargée des anomalies. <strong>Quand :</strong> chaque jour, à partir de l'Accueil. <strong>Où :</strong> menu Anomalies (tableau de bord en colonnes) et la fiche de chaque anomalie.</p></div>\n<h2>Le schéma</h2>\n<table><tbody>\n<tr><th><p>Étape</p></th><th><p>Statut dans l'application</p></th><th><p>Ce que je fais</p></th><th><p>Quand</p></th></tr>\n<tr><td><p><strong>1. Nouvelle anomalie</strong></p></td><td><p>À traiter</p></td><td><p>Ouvrir la fiche, vérifier le montant réclamé et le type de suivi</p></td><td><p>Le jour même</p></td></tr>\n<tr><td><p><strong>2. Réclamer</strong></p></td><td><p>Réclamée</p></td><td><p>Suivre le process du fournisseur (encadré orange de la fiche) : bouton mail, téléphone…</p></td><td><p>Selon le fournisseur (jour même, 48 h…)</p></td></tr>\n<tr><td><p><strong>3. Relancer</strong></p></td><td><p>Réclamée</p></td><td><p>Sans réponse : relancer, puis cliquer « Relancé aujourd'hui »</p></td><td><p>Rappel automatique après le délai du fournisseur (3 jours par défaut)</p></td></tr>\n<tr><td><p><strong>4. Vérifier</strong></p></td><td><p>À vérifier sur facture</p></td><td><p>L'avoir ou la régularisation est annoncé : le contrôler sur la facture</p></td><td><p>À réception de l'avoir ou de la facture</p></td></tr>\n<tr><td><p><strong>5. Clôturer</strong></p></td><td><p>Clôturée</p></td><td><p>Choisir la résolution et saisir le montant, le N° et la date de l'avoir</p></td><td><p>Dès que c'est réglé</p></td></tr>\n</tbody></table>\n<h2>Chaque jour (5 minutes)</h2>\n<ul data-type=\"taskList\">\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Ouvrir l'Accueil : la liste des tâches du jour s'affiche</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Traiter « Réclamations à relancer aujourd'hui »</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Traiter « Anomalies à traiter » (passer en Réclamée une fois la réclamation envoyée)</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Traiter « Avoirs / factures à vérifier »</p></li>\n<li data-type=\"taskItem\" data-checked=\"false\"><p>Saisir les avoirs reçus (montant, N°, date) et clôturer</p></li>\n</ul>\n<h2>Quel type de suivi choisir ?</h2>\n<table><tbody>\n<tr><th><p>Type de suivi</p></th><th><p>Quand le choisir</p></th></tr>\n<tr><td><p>Réclamation avec relances</p></td><td><p>Le fournisseur doit être contacté et relancé jusqu'à l'avoir</p></td></tr>\n<tr><td><p>Vérification de l'avoir - avec réclamation</p></td><td><p>La réclamation est faite (souvent sur le BL) ; il reste à vérifier l'avoir</p></td></tr>\n<tr><td><p>Vérification de l'avoir - sans réclamation</p></td><td><p>Le fournisseur régularise de lui-même ; on vérifie seulement (rappel après 7 jours « À traiter », 15 jours « À vérifier »)</p></td></tr>\n</tbody></table>\n<h2>Comment clôturer</h2>\n<table><tbody>\n<tr><th><p>Résolution</p></th><th><p>À saisir</p></th><th><p>Compte dans les économies</p></th></tr>\n<tr><td><p>Avoir / régularisation</p></td><td><p>Montant, avoir ou facture, N° et date</p></td><td><p>Oui (si une réclamation a été faite)</p></td></tr>\n<tr><td><p>Livraison différée</p></td><td><p>Rien de plus</p></td><td><p>Oui (montant réclamé)</p></td></tr>\n<tr><td><p>Sans suite</p></td><td><p>Rien de plus</p></td><td><p>Non</p></td></tr>\n</tbody></table>\n<h2>Bon à savoir</h2>\n<ul>\n<li><p>Le process propre à chaque fournisseur (contact, délai) s'affiche sur la fiche, dans l'encadré orange ; il se modifie dans le compte du fournisseur.</p></li>\n<li><p>Le bouton mail utilise l'adresse « Réclamation » du compte fournisseur.</p></li>\n<li><p>Une quantité livrée en trop est une information : elle ne compte pas dans les économies.</p></li>\n<li><p>Les économies se suivent dans Reporting &gt; Économies : chaque montant renvoie à sa réclamation.</p></li>\n</ul>", 2]];
  for (const [title, content, position] of procs) {
    if (!(await db.execute(sql`select 1 from protocols where lower(title) = lower(${title})`)).rows.length) {
      await db.execute(sql`insert into protocols (title, content, folder, position) values (${title}, ${content}, 'Procédures', ${position})`);
    }
  }
  const cur = (await db.execute(sql`select value from app_settings where key = 'protocol_folders'`)).rows[0]?.value;
  const folders = cur ? JSON.parse(cur) : [];
  if (!folders.includes("Procédures")) await db.execute(sql`insert into app_settings (key, value) values ('protocol_folders', ${JSON.stringify([...folders, "Procédures"])}) on conflict (key) do update set value = excluded.value`);
  await db.execute(sql`insert into app_settings (key, value) values ('procedures_v1', '1') on conflict (key) do nothing`);
}

// Protocoles : procédures de réception / réclamation remplacées par des pages visuelles (Protocoles > Procédures), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'procedures_v2'`)).rows.length) {
  await db.execute(sql`delete from protocols where title in ('Procédure de réception', 'Procédure de réclamation')`);
  const left = (await db.execute(sql`select 1 from protocols where folder = 'Procédures' limit 1`)).rows.length;
  if (!left) {
    const cur = (await db.execute(sql`select value from app_settings where key = 'protocol_folders'`)).rows[0]?.value;
    if (cur) await db.execute(sql`update app_settings set value = ${JSON.stringify(JSON.parse(cur).filter((f) => f !== "Procédures"))} where key = 'protocol_folders'`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('procedures_v2', '1') on conflict (key) do nothing`);
}

// Protocoles : « Réception d'une livraison » et « Process pèse » intégrés à la procédure Réception ; dossiers supprimés (une fois)
if (!(await db.execute(sql`select 1 from app_settings where key = 'procedures_v3'`)).rows.length) {
  await db.execute(sql`delete from protocols where lower(title) in (lower('Réception d''une livraison'), lower('Process pèse'))`);
  await db.execute(sql`update protocols set folder = null where folder is not null`);
  await db.execute(sql`delete from app_settings where key = 'protocol_folders'`);
  await db.execute(sql`insert into app_settings (key, value) values ('procedures_v3', '1') on conflict (key) do nothing`);
}

// Protocoles recréés par erreur à chaque déploiement (« Réception d'une livraison », « Process pèse », « Process de réclamation ») : retirés une fois,
// puis plus jamais recréés (drapeau protocols_seed_v1). Les process de réclamation sont dans les comptes fournisseurs.
if (!(await db.execute(sql`select 1 from app_settings where key = 'procedures_v4'`)).rows.length) {
  await db.execute(sql`delete from protocols where lower(title) in (lower('Réception d''une livraison'), lower('Process pèse'), lower('Process de réclamation'))`);
  await db.execute(sql`insert into app_settings (key, value) values ('protocols_seed_v1', '1') on conflict (key) do nothing`);
  await db.execute(sql`insert into app_settings (key, value) values ('procedures_v4', '1') on conflict (key) do nothing`);
}

// Conditions par catégorie de produits (Acceptée / écart signalé / Refus) supprimées, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'category_rules_cleared_v1'`)).rows.length) {
  await db.execute(sql`update categories set conform_rules = null, reserve_rules = null, refuse_rules = null`);
  await db.execute(sql`insert into app_settings (key, value) values ('category_rules_cleared_v1', '1') on conflict (key) do nothing`);
}

// Réglementation : les notes de l'équipe (DDPP, textes applicables, fiche minimale) sont intégrées à la page ; la note est retirée, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'regulation_notes_integrated_v1'`)).rows.length) {
  await db.execute(sql`delete from protocols where title ~* '^\s*r[eé]glementations?\s*$' and content ilike '%DDPP%' and content ilike '%852/2004%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('regulation_notes_integrated_v1', '1') on conflict (key) do nothing`);
}

// Dev : point en attente « Lecture automatique des étiquettes », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_pending_label_reading_v1'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, task, position) values ('pending', ${"Lecture automatique des étiquettes produits"}, ${"À partir de la photo d'étiquette prise à l'étape 1, Claude lit le n° de lot, la DLC/DDM, le poids net et l'origine, et les pré-remplit à l'étape 3 (à vérifier par l'utilisateur). Coût estimé : 1 à 3 centimes par étiquette. Prérequis : clé ANTHROPIC_API_KEY active sur Vercel."}, ${"moi"}, ${"moyenne"}, ${"Lecture automatique (BL, étiquettes)"}, ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_pending_label_reading_v1', '1') on conflict (key) do nothing`);
}

// Dev > Projet : document réécrit (plus court, tableaux) ; l'ancienne version est gardée dans dev_project_doc_backup_v5, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v5'`)).rows.length) {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/(app)/dev/projectTemplate.ts", import.meta.url), "utf8");
  const doc = src.slice(src.indexOf("`") + 1, src.lastIndexOf("`")).trim();
  await db.execute(sql`insert into app_settings (key, value) select 'dev_project_doc_backup_v5', value from app_settings where key = 'dev_project_doc' on conflict (key) do nothing`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_doc', ${doc}) on conflict (key) do update set value = excluded.value`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v5', '1') on conflict (key) do nothing`);
}

// Photo d'étiquette obligatoire pour les produits à DLC (viandes, poissons, surgelés) : Dev > Développement et point en attente réalisé, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v5'`)).rows.length) {
  await db.execute(sql`update dev_fields set required = true, rule = ${"Obligatoire (au moins une photo) dès que la livraison contient un produit accepté à DLC obligatoire : viandes, poissons, surgelés. Vérifié à l'enregistrement des nouvelles réceptions."}, message = ${"Photo d'étiquette obligatoire : la livraison contient des viandes, poissons ou surgelés. Ajoutez au moins une photo d'étiquette à l'étape 1."}, updated_at = now() where form = 'reception' and field like 'Photo de l''étiquette%'`);
  await db.execute(sql`update dev_items set kind = 'done', updated_at = now() where kind = 'pending' and title like 'Photo de l''étiquette%obligatoire%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v5', '1') on conflict (key) do nothing`);
}

// Dev > Projet, partie 11 : intitulé du poste (Cost controller), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v6'`)).rows.length) {
  await db.execute(sql`update app_settings set value = replace(value, ${"<tr><td><p>Contrat</p></td><td><p>CDD de 6 mois, « Contrôleur de coûts » (application + recherche d'économies)</p></td></tr>"}, ${"<tr><td><p>Intitulé du poste</p></td><td><p>Cost controller (contrôleur de coûts)</p></td></tr><tr><td><p>Contrat</p></td><td><p>CDD de 6 mois : gestion de l'application et recherche d'économies</p></td></tr>"}) where key = 'dev_project_doc'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v6', '1') on conflict (key) do nothing`);
}

// Dev : point en attente « Mise en conformité RGPD », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_pending_rgpd_v1'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  const detail = "Données concernées : comptes utilisateurs, signatures (livreurs, réceptionnaires), contacts fournisseurs, photos de BL. À faire : 1) clause de sous-traitance RGPD (art. 28) dans l'accord avec le restaurant (je suis sous-traitant, le restaurant responsable du traitement) ; 2) ligne « Réception des marchandises et suivi des réclamations » au registre des traitements du restaurant ; 3) informer les salariés (note interne) et les livreurs (affichette au quai) ; 4) durées de conservation : fiches et signatures 5 ans, comptes supprimés au départ, sauvegardes limitées ; 5) vérifier les DPA de Vercel, Neon, Anthropic, Resend et choisir des régions en Europe (Neon Francfort, fonctions Vercel Paris / Francfort). Pas de DPO ni d'AIPD nécessaires. Pour la vente : CGU, politique de confidentialité, DPA client. Modèles gratuits sur le site de la CNIL.";
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, task, position) values ('pending', ${"Mise en conformité RGPD"}, ${detail}, ${"moi"}, ${"moyenne"}, ${"RGPD"}, ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_pending_rgpd_v1', '1') on conflict (key) do nothing`);
}

// Dev > Projet : la partie « 2. La solution » renvoie aux modules en place (mis à jour automatiquement), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_project_v7'`)).rows.length) {
  await db.execute(sql`update app_settings set value = regexp_replace(value, '<h2>2\. La solution</h2>.*?(<h2>3\.)', ${"<h2>2. La solution</h2>\n<p>Voir « Modules en place » en haut de la page : la liste est mise à jour automatiquement à chaque évolution de l'application. Les modules à venir sont dans « Modules importants à ajouter ».</p>\n\n\\1"}) where key = 'dev_project_doc'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_project_v7', '1') on conflict (key) do nothing`);
}

// Dev : point en attente « Faille analyse achat », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_pending_purchases_v1'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_items`)).rows[0].p);
  const detail = "Reporting > Achats ne compte que les livraisons saisies dans l'application : certaines factures sont envoyées directement à la comptabilité et n'y figurent pas. Pistes : 1) import mensuel du grand livre fournisseurs ou de l'export achats du logiciel comptable (Excel / CSV) ; 2) réception des factures électroniques (plateforme agréée, obligatoire depuis septembre 2026) ; 3) adresse mail dédiée où la compta transfère les factures, lues automatiquement ; 4) rapprochement factures / réceptions pour repérer les achats sans réception. À voir avec l'expert-comptable : format d'export disponible et fréquence.";
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, task, position) values ('pending', ${"Faille analyse achat"}, ${detail}, ${"moi"}, ${"moyenne"}, ${"Développement"}, ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_pending_purchases_v1', '1') on conflict (key) do nothing`);
}

// Anomalies « Température du camion » (plus créées) : les anciennes fiches encore « À traiter », sans avoir ni résultat, sont supprimées (accord de l'utilisateur), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'truck_anomalies_removed_v1'`)).rows.length) {
  const r = await db.execute(sql`delete from anomalies where type = 'temperature' and product_name is null and reception_id is not null and stage = 'a_traiter' and credit_amount is null and result is null`);
  console.log(`[migrate] anomalies température camion supprimées : ${r.rowCount ?? 0}`);
  await db.execute(sql`insert into app_settings (key, value) values ('truck_anomalies_removed_v1', '1') on conflict (key) do nothing`);
}

// Fiches d'anomalie : produit du Mercurial rattaché à partir de la ligne du bon, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_product_link_v1'`)).rows.length) {
  await db.execute(sql`update anomalies a set product_id = l.product_id from reception_lines l where a.line_id = l.id and a.product_id is null and l.product_id is not null`);
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_product_link_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : fiche d'anomalie réorganisée (Détail du problème, Suivi), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v6'`)).rows.length) {
  await db.execute(sql`update dev_fields set section = 'Détail du problème', field = 'Type d''anomalie', rule = ${"Choisi dans une liste modifiable (Gérer les types : ajouter, renommer, supprimer). Titre de la fiche : Fournisseur - Type d'anomalie."}, updated_at = now() where form = 'anomaly' and field = 'Type d''anomalie'`);
  await db.execute(sql`update dev_fields set section = 'Détail du problème', rule = ${"Rattaché au produit du Mercurial (liste des produits du fournisseur), lien vers sa fiche produit."}, updated_at = now() where form = 'anomaly' and field = 'Produit'`);
  await db.execute(sql`update dev_fields set section = 'Détail du problème', field = 'Problème', updated_at = now() where form = 'anomaly' and field = 'Description'`);
  await db.execute(sql`update dev_fields set section = 'Détail du problème', updated_at = now() where form = 'anomaly' and field = 'Montant réclamé'`);
  await db.execute(sql`update dev_fields set section = 'Suivi', updated_at = now() where form = 'anomaly' and field in ('Fournisseur', 'Type de suivi')`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values
    ('anomaly', 'Détail du problème', 'Note', false, ${"Texte libre de l'utilisateur."}, '', ${pos}),
    ('anomaly', 'Suivi', 'Action utilisateur', false, ${"Ce qui a été fait (mail, appel…) ; « Relancé aujourd'hui » ajoute une ligne datée."}, '', ${pos + 1}),
    ('anomaly', 'Suivi', 'Dernière action', false, ${"Date de la dernière action ; sert au rappel de relance."}, '', ${pos + 2})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v6', '1') on conflict (key) do nothing`);
}

// Fiches d'anomalie : type d'anomalie enregistré dans chaque fiche (libellé du type d'origine), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_problem_type_v1'`)).rows.length) {
  const labels = { missing: "Produit manquant", damaged: "Produit abîmé", temperature: "Température", dlc: "DLC", wrong_product: "Mauvais produit", quantity: "Quantité", price: "Prix", hygiene: "Hygiène / véhicule", locked_price: "Prix bloqué non respecté", missing_bl: "Bon de livraison manquant", other: "Autre" };
  for (const [k, v] of Object.entries(labels)) await db.execute(sql`update anomalies set problem_type = ${v} where problem_type is null and type = ${k}`);
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_problem_type_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : « Type de problème » renommé « Type d'anomalie » + champ « Actions Assistant », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v7'`)).rows.length) {
  await db.execute(sql`update dev_fields set field = 'Type d''anomalie', rule = ${"Choisi dans une liste modifiable (Gérer les types : ajouter, renommer, supprimer). Titre de la fiche : Fournisseur - Type d'anomalie."}, updated_at = now() where form = 'anomaly' and field = 'Type de problème'`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Suivi', 'Actions Assistant', false, ${"Rempli automatiquement par l'application (création, réclamation, relances, rappels, consolidation, économie) ; non modifiable."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v7', '1') on conflict (key) do nothing`);
}

// Dev > Développement : fiche d'anomalie en carte (produits avec quantité et prix, contrôle), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v8'`)).rows.length) {
  await db.execute(sql`update dev_fields set field = 'Produits', rule = ${"Un ou plusieurs produits (ajout possible, ex. BL manquant), chacun avec quantité, unité et prix ; total reportable dans le montant réclamé. Le premier est le produit principal."}, updated_at = now() where form = 'anomaly' and field = 'Produit'`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Fiche', 'Contrôle', false, ${"À vérifier / Vérifiée / À voir : en haut de la fiche et dans la colonne Contrôle de la liste des anomalies."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v8', '1') on conflict (key) do nothing`);
}

// Contrôle des fiches d'anomalie : « À vérifier » par défaut pour les fiches sans contrôle, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_review_default_v1'`)).rows.length) {
  await db.execute(sql`update anomalies set review = 'a_verifier' where review is null`);
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_review_default_v1', '1') on conflict (key) do nothing`);
}

// Type d'anomalie « Écart de pesée » pour les fiches venues de l'onglet Écarts pesées, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'weigh_problem_type_v1'`)).rows.length) {
  await db.execute(sql`update anomalies set problem_type = ${"Écart de pesée"} where source = 'weigh'`);
  const saved = (await db.execute(sql`select value from app_settings where key = 'anomaly_problem_types'`)).rows[0]?.value;
  try {
    const list = JSON.parse(saved ?? "null");
    if (Array.isArray(list) && list.length && !list.includes("Écart de pesée")) await db.execute(sql`update app_settings set value = ${JSON.stringify([...list, "Écart de pesée"])} where key = 'anomaly_problem_types'`);
  } catch { /* liste par défaut */ }
  await db.execute(sql`insert into app_settings (key, value) values ('weigh_problem_type_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : fiche d'anomalie (fournisseur et document dans Détails, liste des produits du fournisseur, « Montant » pour un BL manquant), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v9'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Détail du problème', 'Fournisseur et document', false, ${"Affichés en haut de Détails : fournisseur (lien vers son compte) et BL / Facture avec sa date (ex. 383395 du 06/08/26). Ne figurent plus dans l'en-tête de la fiche."}, '', ${pos})`);
  await db.execute(sql`update dev_fields set rule = rule || ${" Produit choisi dans la liste déroulante des produits du fournisseur (comme dans son compte) ; « Autre produit » pour une saisie libre."}, updated_at = now() where form = 'anomaly' and field = 'Produits'`);
  await db.execute(sql`update dev_fields set rule = rule || ${" Pour le type « Bon de livraison manquant », le champ s'appelle « Montant »."}, updated_at = now() where form = 'anomaly' and field = 'Montant réclamé'`);
  await db.execute(sql`update dev_fields set rule = rule || ${" Les fiches venues de l'onglet Écarts pesées ont le type « Écart de pesée »."}, updated_at = now() where form = 'anomaly' and field = 'Type d''anomalie'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v9', '1') on conflict (key) do nothing`);
}

// Date BL / Facture sur chaque fiche d'anomalie (document du bon, sinon date de livraison, sinon référence « du JJ/MM/AA », sinon date de la fiche), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'anomaly_doc_date_v1'`)).rows.length) {
  await db.execute(sql`update anomalies a set doc_date = coalesce(
    (select (d->>'date')::date from reception_lines l join receptions r on r.id = l.reception_id, jsonb_array_elements(coalesce(r.documents, '[]'::jsonb)) d where l.id = a.line_id and d->>'number' = l.document and d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' limit 1),
    (select (d->>'date')::date from receptions r, jsonb_array_elements(coalesce(r.documents, '[]'::jsonb)) d where r.id = a.reception_id and d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' limit 1),
    (select (r.delivered_at at time zone 'Europe/Paris')::date from receptions r where r.id = a.reception_id),
    case when a.reference ~ 'du \d{2}/\d{2}/\d{2}' then to_date(substring(a.reference from 'du (\d{2}/\d{2}/\d{2})'), 'DD/MM/YY') end,
    (a.created_at at time zone 'Europe/Paris')::date
  ) where doc_date is null`);
  await db.execute(sql`insert into app_settings (key, value) values ('anomaly_doc_date_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : fiche d'anomalie (date BL / Facture, saisie du produit, Réception d'origine retirée), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v10'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Détail du problème', 'Date BL / Facture', false, ${"Reprise du document du bon (sinon date de livraison, sinon date indiquée dans la référence, sinon date de la fiche) ; modifiable. Le N° de BL / Facture renvoie au bon de réception."}, '', ${pos})`);
  await db.execute(sql`update dev_fields set rule = ${"Un ou plusieurs produits, chacun avec quantité, unité et prix ; total reportable dans le montant réclamé. Saisie libre : au fil de la frappe, une courte liste (8 au plus) propose les produits du fournisseur correspondants, juste sous le champ (↑ ↓ Entrée pour choisir) ; sans choix, le produit est gardé hors liste."}, updated_at = now() where form = 'anomaly' and field = 'Produits'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v10', '1') on conflict (key) do nothing`);
}

// Dev : en-tête de la fiche d'anomalie + tâche « fréquence de réclamation » en attente, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v11'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Fiche', 'En-tête', false, ${"« Fiche d'anomalie · N° X - JJ/MM/AA » (date de création de la fiche, à défaut date de livraison) ; titre Fournisseur — Type d'anomalie ; produits sous le titre, sauf pour « Bon de livraison manquant ». Partie repliable « Détail du problème »."}, '', ${pos})`);
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, position) values ('pending', ${"Réclamations : fréquence par type d'anomalie"}, ${"Garder la fiche de réclamation avec un N° unique. Pouvoir choisir une fréquence de réclamation (ex. écarts de pesée : une fois par semaine) : un mail unique = une réclamation unique = plusieurs anomalies. But : moins de mails envoyés et un traitement plus simple pour le fournisseur."}, 'moi', 'haute', ${Date.now() % 1000000})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v11', '1') on conflict (key) do nothing`);
}

// Dev > Développement : montant masqué pour un BL manquant, recherche produit à la réception (une ligne par produit), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v12'`)).rows.length) {
  await db.execute(sql`update dev_fields set rule = rule || ${" Pour « Bon de livraison manquant », pas de montant en haut à droite."}, updated_at = now() where form = 'anomaly' and field = 'En-tête'`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Étape 3 - Contrôle', 'Recherche de produit', false, ${"Produits du fournisseur au Mercurial : une ligne par produit (même nom et même unité regroupés), avec le prix ou la fourchette « prix min - prix max »."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v12', '1') on conflict (key) do nothing`);
}

// Dev > Développement : liste des fiches de réception (filtre date par calendrier, crayon Modifier), bouton « Bon de livraison reçu », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v13'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Liste des fiches de réception', 'Date', false, ${"Filtre dans l'en-tête de la colonne : calendrier (un jour ou du … au …) et périodes rapides (aujourd'hui, 7 derniers jours, ce mois, mois dernier, cette année). Lien vers la fiche sur le N° ; crayon « Modifier » tant que la fiche n'est pas consolidée."}, '', ${pos})`);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Fiche', 'Bon de livraison reçu', false, ${"Type « Bon de livraison manquant » : remplace le bouton « Avoir reçu ». Simple indication : note « bon de livraison reçu (à vérifier) » dans l'historique et passage à « À vérifier » ; l'utilisateur vérifie le BL puis clôture."}, '', ${pos + 1})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v13', '1') on conflict (key) do nothing`);
}

// Réclamation fruits et légumes du 12/10/26 (Producteurs Réunis) : envoyée par mail et avoir reçu le même jour → fiches clôturées, une fois
// (liste du fichier « Réclamation - Producteurs Réunis » ; une facture qui a aussi des lignes réclamées le 28/10 n'est pas concernée)
if (!(await db.execute(sql`select 1 from app_settings where key = 'fl_claim_20261012_v1'`)).rows.length) {
  const { readFileSync: readFl } = await import("node:fs");
  const fl = JSON.parse(readFl(new URL("./data/fl-claim-2026-10-12.json", import.meta.url), "utf8"));
  // Date de réclamation reportée sur les écarts de pesée du fichier
  for (const [day, product, ref] of fl.rows) {
    await db.execute(sql`update weigh_gaps set claim_date = '2026-10-12' where claim_date is null and date = ${day}::date
      and lower(regexp_replace(trim(product), '\s+', ' ', 'g')) = ${product} and lower(regexp_replace(trim(coalesce(supplier_ref, '')), '\s+', ' ', 'g')) = ${ref}`);
  }
  const keys = fl.refs.map((r) => `ref:${r}`);
  const refsOnly = fl.refs.map((r) => r.replace(/^.*?:\s*/, ""));
  const res = await db.execute(sql`update anomalies set
      stage = 'cloturee', resolution = 'avoir', status = 'credit_received', result = 'cloture', mode = 'reclamation',
      credit_amount = coalesce(credit_amount, claimed_amount), credit_kind = 'avoir', credit_date = '2026-10-12',
      last_action_at = '2026-10-12', closed_at = '2026-10-12T12:00:00Z',
      follow_up = ${"12/10/26 : réclamation envoyée par mail\n12/10/26 : avoir reçu"}
    where source = 'weigh' and (lower(regexp_replace(coalesce(group_key, ''), '\s+', ' ', 'g')) in (select jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb)) or lower(regexp_replace(trim(coalesce(reference, '')), '\s+', ' ', 'g')) in (select jsonb_array_elements_text(${JSON.stringify(refsOnly)}::jsonb)))`);
  console.log(`[migrate] réclamation F&L du 12/10/26 : ${res.rowCount ?? 0} fiche(s) clôturée(s)`);
  await db.execute(sql`insert into app_settings (key, value) values ('fl_claim_20261012_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : prix « Non indiqué sur le bon », Mercurial (doublon, modifier / supprimer depuis le compte produit), Réclamations, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v14'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["reception", "Étape 3 - Contrôle", "Prix unitaire / Non indiqué sur le bon", true, "Soit un prix, soit la case « Non indiqué sur le bon » cochée (l'un ou l'autre, pas les deux) pour valider le bon. Simple information, sans impact.", "Prix manquant : saisir le prix ou cocher « Non indiqué sur le bon »."],
    ["product", "Mercurial", "Doublon", false, "Colonne « Doublon » = Oui quand le même produit (même nom, même unité) est enregistré plusieurs fois chez le même fournisseur.", ""],
    ["product", "Compte produit", "Modifier / Supprimer", false, "Depuis le compte produit : modifier (nom, unité, nature, prix min / max, prix bloqué, actif) ou supprimer. La suppression garde l'historique (réceptions, prix, anomalies) avec le nom du produit, sans lien.", ""],
    ["claim", "Réclamations", "Filtre", false, "À l'ouverture, « Toutes » est sélectionné ; le bouton choisi est encadré d'un trait rouge fin.", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v14', '1') on conflict (key) do nothing`);
}

// Dev > Développement : fiche d'anomalie (lien réclamation, montant BL manquant, Détail ouvert, barre d'enregistrement), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v15'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["anomaly", "Fiche", "Réclamation N°", false, "Lien sous le titre vers les fiches de cette réclamation (menu Réclamations filtré sur le N°).", ""],
    ["anomaly", "Détail du problème", "Montant (Bon de livraison manquant)", false, "Calculé : total des produits (quantité × prix), non saisi ; enregistré comme montant de la fiche.", ""],
    ["anomaly", "Fiche", "Enregistrer", false, "Partie « Détail du problème » ouverte d'office. Dès qu'une modification est en cours, une barre reste visible en bas de l'écran (Enregistrer / Annuler) ; elle affiche toujours le résultat : « Fiche enregistrée », champ manquant (Problème, résolution) ou erreur. La date de clôture n'est plus remise à jour à chaque enregistrement.", "Le champ « Problème » est obligatoire pour enregistrer. / Indiquez comment l'anomalie a été résolue."],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v15', '1') on conflict (key) do nothing`);
}

// Daurade royale El Turquie 8/1000 : deux produits distincts (écaillé filet épilé / filet sans peau épilé), écarts et fiches d'anomalie rattachés, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'daurade_products_v1'`)).rows.length) {
  const base = (await db.execute(sql`select supplier_id, nature, category_id, service, unit, price from products where name ~* '^daurade royale? el turquie 8/1000$' order by active desc, id limit 1`)).rows[0];
  if (base) {
    const variants = [
      { name: "Daurade Royale El Turquie 8/1000 (Ecaillé filet épilé)", re: "daurade royale? el turquie 8/1000.*[eé]caill" },
      { name: "Daurade Royale El Turquie 8/1000 (Filet sans peau epile)", re: "daurade royale? el turquie 8/1000.*sans peau" },
    ];
    for (const v of variants) {
      let id = (await db.execute(sql`select id from products where supplier_id = ${base.supplier_id} and lower(name) = lower(${v.name}) limit 1`)).rows[0]?.id;
      if (!id) {
        id = (await db.execute(sql`insert into products (supplier_id, name, unit, category_id, price, nature, service, active)
          values (${base.supplier_id}, ${v.name}, ${base.unit ?? "Kg"}, ${base.category_id}, ${base.price}, ${base.nature}, ${base.service}, true) returning id`)).rows[0].id;
      }
      // Écarts de pesée : nom unifié + lien vers le compte produit
      await db.execute(sql`update weigh_gaps set product_id = ${id}, product = ${v.name} where product ~* ${v.re}`);
      await db.execute(sql`update reception_lines set product_id = ${id}, product_name = ${v.name} where product_name ~* ${v.re}`);
      // Fiches d'anomalie : produits de la fiche rattachés
      await db.execute(sql`update anomalies set items = (
          select jsonb_agg(case when e->>'name' ~* ${v.re} then e || jsonb_build_object('productId', ${id}::int, 'name', ${v.name}::text) else e end)
          from jsonb_array_elements(items) e)
        where items is not null and items::text ~* ${v.re}`);
      await db.execute(sql`update anomalies set product_id = ${id}, product_name = ${v.name} where product_name ~* ${v.re}`);
    }
  }
  await db.execute(sql`insert into app_settings (key, value) values ('daurade_products_v1', '1') on conflict (key) do nothing`);
}

// Doublons traités par l'équipe : lignes automatiques de l'historique des prix créées par ces corrections (modifications manuelles depuis le 21/11/26) supprimées, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dup_history_cleanup_v1'`)).rows.length) {
  const res = await db.execute(sql`delete from price_changes where source = 'manual' and date >= '2026-11-21T00:00:00+01:00'`);
  console.log(`[migrate] historique des prix : ${res.rowCount ?? 0} ligne(s) automatique(s) de correction supprimée(s)`);
  await db.execute(sql`insert into app_settings (key, value) values ('dup_history_cleanup_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : numérotation FP / FPM / FA / FDR / FR / PR, doublon « À vérifier », colonne À compléter, liste des fiches (Anomalie), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v16'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["reception", "Fiche", "N°", false, "FP001, FP002… par année de livraison (remise à zéro le 01/01) ; au-delà de 999, un chiffre est ajouté.", ""],
    ["sheet", "Fiche", "N°", false, "FPM001… par année (remise à zéro le 01/01).", ""],
    ["anomaly", "Fiche", "N°", false, "FA001… par année de création (remise à zéro le 01/01). Recherche « Fiche N° » : FA401 ou 401.", ""],
    ["claim", "Fiche", "N°", false, "FDR001… par année de création (remise à zéro le 01/01) ; plusieurs anomalies regroupées partagent le même N°.", ""],
    ["supplier", "Compte", "N°", false, "FR0001… numéro permanent du compte.", ""],
    ["product", "Compte", "N°", false, "PR0001… numéro permanent du compte.", ""],
    ["product", "Mercurial", "Doublon", false, "Oui : même nom et même unité chez le même fournisseur. À vérifier : produits très proches (même nom avec une autre unité, ou nom presque identique).", ""],
    ["anomaly", "Liste", "À compléter", false, "Champs non remplis de chaque fiche : fournisseur, BL / facture, produit (ou hors Mercurial), montant, résolution, montant / N° / date d'avoir.", ""],
    ["reception", "Liste des fiches de réception", "Anomalie", false, "Nombre de fiches d'anomalie identifiées sur le bon ; dans la fiche, lien vers chaque fiche d'anomalie (FA…).", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v16', '1') on conflict (key) do nothing`);
}

// Dev > Développement : modification d'une fiche de réception sur une page, modèles de date, prix sans message, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v17'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["reception", "Modification", "Modifier une fiche de réception", false, "Une seule page, adaptée au téléphone : Livraison, Produits, Réserves (parties repliables) et barre « Enregistrer les modifications » toujours visible ; contrôles à l'enregistrement (conformité, prix ou « Non indiqué sur le bon », DLC) avec retour au produit concerné. Seulement tant que la fiche n'est pas consolidée.", ""],
    ["reception", "Dates", "Modèle « date unique »", false, "Même calendrier partout (date du document, DLC, date BL / facture, date d'avoir, dernière action avec « Aujourd'hui », prochaine action, boulangerie).", ""],
    ["reception", "Dates", "Modèle « période »", false, "Calendrier (un jour ou du … au …) et périodes rapides : colonnes Date des tableaux (réceptions, anomalies, réclamations, suivi des prix, mise à jour Mercurial, fiches de réception, compte fournisseur), Reporting, Suivi des prix, récap par type (Personnalisé).", ""],
    ["reception", "Étape 3 - Contrôle", "Prix d'un produit sans prix", false, "Produit existant sans prix au Mercurial : le prix saisi devient son prix, sans message ni anomalie.", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v17', '1') on conflict (key) do nothing`);
}

// Dev > Développement : enregistrement direct après une info manquante, signature réceptionnaire (invité), doublon modifiable, rattachements, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v18'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["reception", "Enregistrement", "Info manquante", false, "L'application amène au champ manquant ; une fois complété (photo d'étiquette, signature, conformité), la fiche s'enregistre directement. Pour un champ tapé (prix, DLC), le bouton « Enregistrer la fiche » reste disponible sur l'étape en cours, sans repasser par les étapes.", ""],
    ["reception", "Étape 1 - Photos et signatures", "Signature du réceptionnaire", false, "Demandée seulement pour un profil invité (nom et signature) ; pour les autres profils, le nom de l'utilisateur connecté est repris.", ""],
    ["reception", "Étape 3 - Contrôle", "Ajouter un produit", false, "Recherche au fil de la saisie (2 lettres) ou flèche pour la liste des produits du fournisseur ; une ligne par produit. Plus de bouton « Rechercher ».", ""],
    ["product", "Mercurial", "Doublon (choix)", false, "Modifiable dans la colonne : auto (détection), Oui, À vérifier, Non.", ""],
    ["product", "Compte produit", "Rattachements", false, "Écarts de pesée, produits des fiches d'anomalie, lignes de réception et historique du Mercurial rattachés automatiquement au compte produit du même fournisseur ; le compte produit affiche toutes ses anomalies.", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v18', '1') on conflict (key) do nothing`);
}

// Perte acceptable (%) des poissons, reprise des écarts de pesée du fichier (valeur la plus fréquente par produit), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'loss_pct_v1'`)).rows.length) {
  await db.execute(sql`update products p set acceptable_loss_pct = x.pct from (
      select distinct on (product_id) product_id, round(acceptable_loss / nullif(qty_invoiced, 0) * 100, 1) as pct
      from weigh_gaps
      where product_id is not null and acceptable_loss > 0 and qty_invoiced > 0 and (nature ilike '%poisson%' or nature ilike '%mer%')
      group by product_id, 2 order by product_id, count(*) desc
    ) x where p.id = x.product_id and p.acceptable_loss_pct is null`);
  // Variantes de produit sans écart rattaché : même perte que le produit de base (ex. Daurade 6/800 fileté)
  await db.execute(sql`insert into app_settings (key, value) values ('loss_pct_v1', '1') on conflict (key) do nothing`);
}

// Montant réclamé des fiches d'anomalie = somme des produits (quantité × prix), quand les produits ont un prix, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'claimed_from_items_v1'`)).rows.length) {
  const res = await db.execute(sql`update anomalies a set claimed_amount = t.s from (
      select id, round((select sum((e->>'qty')::numeric * (e->>'price')::numeric) from jsonb_array_elements(items) e
        where jsonb_typeof(e->'qty') = 'number' and jsonb_typeof(e->'price') = 'number'), 2) as s
      from anomalies where items is not null
    ) t where a.id = t.id and t.s > 0 and (a.claimed_amount is null or abs(a.claimed_amount - t.s) > 0.005)`);
  console.log(`[migrate] montant réclamé recalculé sur ${res.rowCount ?? 0} fiche(s)`);
  await db.execute(sql`insert into app_settings (key, value) values ('claimed_from_items_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : montant = somme des produits, filtres en cascade, sans suite hors économies, perte acceptable, en-tête de fiche d'anomalie, historique du compte produit, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v19'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["anomaly", "Détail du problème", "Montant réclamé (calcul)", false, "Somme des produits (quantité × prix) dès qu'un produit a un prix : calculé, non saisi ; sinon saisi à la main.", ""],
    ["anomaly", "Fiche", "En-tête", false, "Bandeau rouge propre à la fiche d'anomalie (FA…), avec les liens vers la fiche de réception (FP…) et la réclamation (FDR…).", ""],
    ["anomaly", "Économies", "Sans suite", false, "Une fiche clôturée « sans suite » n'est jamais comptée dans les économies récupérées.", ""],
    ["product", "Compte produit", "Perte acceptable (%)", false, "Modifiable ; retirée de l'écart de pesée à la réception : écart = facturé − pesé − perte (ex. poisson fileté).", ""],
    ["product", "Compte produit", "Historique", false, "Un seul tableau : création, prix, mises à jour du Mercurial, anomalies et réceptions, lignes cliquables.", ""],
    ["reception", "Tableaux", "Filtres en cascade", false, "Chaque filtre ne propose que les valeurs encore possibles avec les autres filtres choisis.", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v19', '1') on conflict (key) do nothing`);
}

// Dev > Développement : suivi de la réclamation (ordre, libellés, Retour marchandise), colonnes Anomalies / Réclamations, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v20'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["anomaly", "Suivi de la réclamation", "Ordre", false, "Statut, Type de suivi (Réclamation avec relances / Avec relance / Sans relance), puis Résolution à la clôture.", ""],
    ["anomaly", "Suivi de la réclamation", "Résolution", false, "Avoir / régularisation, Livraison différée, Retour marchandise (compte comme récupéré dans les économies), Sans suite (jamais compté).", ""],
    ["anomaly", "À compléter", "Montant", false, "Signalé seulement si un prix est connu (sur le bon ou un produit de la fiche) : un bon sans prix ne permet pas de chiffrer.", ""],
    ["anomaly", "Liste", "Colonnes", false, "Date, N°, Nature, Fournisseur, BL / Facture, Produit, Montant, Type d'anomalie, Statut, Contrôle, À compléter.", ""],
    ["claim", "Réclamations", "Onglet et colonnes", false, "Onglet du menu Anomalies. Colonnes : Date, N°, Fournisseur, BL / Facture, Montant, Suivi, Dernière action, Statut.", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`update dev_fields set field = 'Type de suivi', rule = replace(replace(rule, 'Vérification de l''avoir - avec réclamation', 'Avec relance'), 'Vérification de l''avoir - sans réclamation', 'Sans relance') where rule like '%Vérification de l''avoir%' and field = 'Type de suivi'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v20', '1') on conflict (key) do nothing`);
}

// Dev > Développement : numérotation RCP / ANO / R, prix Mercurial si « Non indiqué sur le bon », liste des anomalies par défaut, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v21'`)).rows.length) {
  await db.execute(sql`update dev_fields set rule = replace(replace(replace(rule, 'FP001, FP002', 'RCP001, RCP002'), 'FA001', 'ANO001'), 'FDR001', 'R0001') where field = 'N°'`);
  await db.execute(sql`update dev_fields set rule = replace(rule, 'FA401 ou 401', 'ANO401 ou 401') where field = 'N°'`);
  await db.execute(sql`update dev_fields set rule = ${"« Non indiqué sur le bon » coché : le prix du Mercurial est repris (prix maximum s'il y a une fourchette) et le champ prix est bloqué ; décoché, le prix redevient à saisir. Un prix ou la case pour valider le bon."} where form = 'reception' and field = 'Prix unitaire / Non indiqué sur le bon'`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Liste', 'Ouverture du menu', false, ${"Le menu Anomalies ouvre directement la liste ; le tableau de bord en colonnes reste accessible par le bouton « Tableau de bord ». Colonnes : Date, N°, Fournisseur, BL / Facture, Nature, Montant, Type d'anomalie, Statut, Contrôle, À compléter."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v21', '1') on conflict (key) do nothing`);
}

// Prix « Non indiqué sur le bon » : prix du Mercurial repris sur la ligne, puis montants des fiches d'anomalie liées complétés, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'price_not_shown_fill_v1'`)).rows.length) {
  await db.execute(sql`update reception_lines l set unit_price = coalesce(l.mercurial_price, l.mercurial_min, p.price)
    from products p where p.id = l.product_id and l.price_not_shown and l.unit_price is null and coalesce(l.mercurial_price, l.mercurial_min, p.price) is not null`);
  // Produits de la fiche sans prix : prix de la ligne du bon (même produit)
  await db.execute(sql`update anomalies a set items = (
      select jsonb_agg(case when e->'price' is null or jsonb_typeof(e->'price') = 'null' then e || jsonb_build_object('price', l.unit_price::float) else e end)
      from jsonb_array_elements(a.items) e)
    from reception_lines l where l.id = a.line_id and l.price_not_shown and l.unit_price is not null and a.items is not null`);
  // Fiche sans produits : manque × prix
  await db.execute(sql`update anomalies a set claimed_amount = round((l.qty_ordered - l.qty_received) * l.unit_price, 2)
    from reception_lines l where l.id = a.line_id and l.price_not_shown and l.unit_price is not null and a.claimed_amount is null
      and (a.items is null or jsonb_array_length(a.items) = 0) and l.qty_ordered > l.qty_received`);
  // Montant = somme des produits
  await db.execute(sql`update anomalies a set claimed_amount = t.s from (
      select id, round((select sum((e->>'qty')::numeric * (e->>'price')::numeric) from jsonb_array_elements(items) e
        where jsonb_typeof(e->'qty') = 'number' and jsonb_typeof(e->'price') = 'number'), 2) as s from anomalies where items is not null
    ) t where a.id = t.id and t.s > 0 and (a.claimed_amount is null or abs(a.claimed_amount - t.s) > 0.005)`);
  await db.execute(sql`insert into app_settings (key, value) values ('price_not_shown_fill_v1', '1') on conflict (key) do nothing`);
}

// Dev > Développement : mail de réclamation dans Outlook, Résolution toujours visible, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v22'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Fiche', 'Envoyer la réclamation', false, ${"Ouvre Outlook (web) dans un nouvel onglet, avec le destinataire (contact réclamation du fournisseur), l'objet et le message déjà rédigés."}, '', ${pos})`);
  await db.execute(sql`update dev_fields set rule = rule || ${" Toujours visible ; choisir une résolution clôture la fiche."} where form = 'anomaly' and section = 'Suivi de la réclamation' and field = 'Résolution'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v22', '1') on conflict (key) do nothing`);
}

// Statuts : « Réclamée » et « À vérifier sur facture » → « En attente » ; type de suivi « Réclamation avec relances » → « Avec relance », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'stages_en_attente_v1'`)).rows.length) {
  const a = await db.execute(sql`update anomalies set stage = 'en_attente' where stage in ('reclamee', 'a_verifier')`);
  const m = await db.execute(sql`update anomalies set mode = 'verification_reclamation' where mode = 'reclamation'`);
  console.log(`[migrate] statuts « En attente » : ${a.rowCount ?? 0} fiche(s) ; type de suivi « Avec relance » : ${m.rowCount ?? 0} fiche(s)`);
  await db.execute(sql`insert into app_settings (key, value) values ('stages_en_attente_v1', '1') on conflict (key) do nothing`);
}

// Dev : point en attente « Version d'Outlook » + champs (statuts, boutons, téléphone, regroupement), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v23'`)).rows.length) {
  await db.execute(sql`insert into dev_items (kind, title, detail, owner, priority, position) values ('pending', ${"Réclamation par mail : version d'Outlook à confirmer"}, ${"Le bouton « Envoyer la réclamation » ouvre Outlook.com (comptes Hotmail / Outlook personnels). Si la boîte du restaurant est sur Microsoft 365 (compte professionnel), basculer le lien vers outlook.office.com."}, 'moi', 'moyenne', ${Date.now() % 1000000})`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["anomaly", "Suivi de la réclamation", "Statut", true, "À traiter, En attente (réclamée ou à vérifier sur facture : on attend le fournisseur), Clôturée, Annulée. Retour possible de « En attente » à « À traiter ».", ""],
    ["anomaly", "Fiche", "Boutons « En attente »", false, "Avoir / Régul (montant, n°, date puis clôture), Retour mail (réponse du fournisseur notée), Livraison différée, Retour marchandise ; et Téléphone, ← À traiter, Sans suite.", ""],
    ["anomaly", "Fiche", "Téléphone", false, "Remplace « J'ai appelé » : un champ s'ouvre pour noter le détail de l'appel ou du SMS (noté dans l'historique).", ""],
    ["claim", "Réclamation", "Regroupement à l'envoi", false, "À l'envoi d'une réclamation, les autres fiches « À traiter » du même fournisseur sont proposées (cochées d'office) : un seul mail, un seul N° R.", ""],
    ["anomaly", "Suivi de la réclamation", "Type de suivi", false, "Avec relance ou Sans relance (« Réclamation avec relances » fusionné dans « Avec relance »).", ""],
    ["anomaly", "Liste", "Montant (filtre)", false, "Filtre de l'en-tête : montant minimum et / ou maximum (entre deux montants).", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v23', '1') on conflict (key) do nothing`);
}

// Dev : bouton « Retour mail » renommé « Retour fournisseur », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v24'`)).rows.length) {
  await db.execute(sql`update dev_fields set rule = replace(rule, 'Retour mail', 'Retour fournisseur') where rule like '%Retour mail%'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v24', '1') on conflict (key) do nothing`);
}

// Dev : sans suite avec détail, relance datable, modèle de mail de réclamation, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v25'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  const rows = [
    ["anomaly", "Fiche", "Sans suite", false, "La confirmation ouvre un champ pour noter le détail (pourquoi sans suite), noté dans l'historique avant la clôture.", ""],
    ["anomaly", "Suivi de la réclamation", "Note de relance", false, "Note + date de la relance (aujourd'hui par défaut, ou une autre date) ; la dernière action prend la date la plus récente.", ""],
    ["claim", "Réclamation", "Mail de réclamation", false, "Objet « Réclamation – anomalies de livraison ». Pour chaque livraison : « Livraison du … (BL … du …) : », puis chaque produit « - désignation » et « → détail – montant € » ; « Total concerné : … € » ; « Pourriez-vous nous faire parvenir un avoir ? » ; signature (nom de l'utilisateur et du restaurant).", ""],
  ];
  for (const [i, r] of rows.entries()) {
    await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${pos + i})`);
  }
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v25', '1') on conflict (key) do nothing`);
}

// Dev : en-tête de la fiche d'anomalie (police réduite, parenthèses en petit), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v26'`)).rows.length) {
  await db.execute(sql`update dev_fields set rule = rule || ${" Nom du fournisseur et des produits sans majuscules, police réduite ; indications entre parenthèses en plus petit."} where form = 'anomaly' and field = 'En-tête'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v26', '1') on conflict (key) do nothing`);
}

// Dev : résolutions du suivi de la réclamation selon le statut (mêmes règles que les boutons du haut), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v27'`)).rows.length) {
  await db.execute(sql`update dev_fields set rule = ${"Mêmes règles que les boutons du haut de la fiche : À traiter → Avoir / Régul, Sans suite ; En attente → Retour fournisseur (réponse notée), Avoir / Régul, Livraison différée, Retour marchandise, Sans suite ; Clôturée → toutes (pour corriger) ; Annulée → aucune. Choisir une résolution clôture la fiche ; Sans suite demande le détail."} where form = 'anomaly' and section = 'Suivi de la réclamation' and field = 'Résolution'`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v27', '1') on conflict (key) do nothing`);
}

// Fiches de réception générées à partir des anomalies importées (fichier de suivi et écarts de pesée), NON consolidées, une fois.
// Une fiche par fournisseur + document (BL / facture) + jour ; marquées « importées » : jamais consolidées ni exportées automatiquement.
if (!(await db.execute(sql`select 1 from app_settings where key = 'receptions_from_imports_v1'`)).rows.length) {
  const { randomUUID } = await import("node:crypto");
  const rows = (await db.execute(sql`select id, source, supplier_id, supplier_name, reference, doc_date::text as doc_date,
      to_char(created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day, product_name, product_id, items, description, group_key, type, problem_type
    from anomalies where reception_id is null and source in ('file', 'weigh') order by created_at, id`)).rows;
  const norm = (x) => String(x ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const groups = new Map();
  for (const a of rows) {
    const day = a.doc_date || a.day;
    const key = `${a.supplier_id ?? norm(a.supplier_name)}|${norm(a.reference)}|${day}`;
    if (!groups.has(key)) groups.set(key, { day, a, list: [] });
    groups.get(key).list.push(a);
  }
  const docOf = (ref, date) => {
    const r = String(ref ?? "").trim();
    if (!r || /^pas de bl/i.test(r)) return [];
    const m = /^(BL|Facture|Doc\.?|Document)\s+(.+?)(?:\s+du\s+\d{2}\/\d{2}\/\d{2})?$/i.exec(r);
    const type = !m ? "bl" : /^fact/i.test(m[1]) ? "facture" : /^doc/i.test(m[1]) ? "autre" : "bl";
    return [{ type, number: m ? m[2].trim() : r, date: date || null }];
  };
  let made = 0;
  for (const g of groups.values()) {
    const a0 = g.a;
    const docs = docOf(a0.reference, a0.doc_date);
    const reserves = g.list.map((a) => `- ${a.problem_type || a.type} : ${a.description}`).join("\n");
    const [rec] = (await db.execute(sql`insert into receptions (client_uuid, supplier_id, supplier_name, delivered_at, bl_number, documents, status, reserves_text, notes, imported_from)
      values (${`import-anomalies-${randomUUID()}`}, ${a0.supplier_id}, ${a0.supplier_name}, ((${g.day}::date + time '12:00') at time zone 'Europe/Paris'),
        ${docs[0]?.number ?? null}, ${JSON.stringify(docs)}::jsonb, 'with_reserves', ${reserves},
        ${"Fiche générée à partir des anomalies importées (fichier de suivi / écarts de pesée), non consolidée."}, 'anomalies') returning id`)).rows;
    let pos = 0;
    const lineByName = new Map();
    const addLine = async (l) => {
      const k = norm(l.name);
      if (lineByName.has(k)) return lineByName.get(k);
      const cat = l.productId ? (await db.execute(sql`select category_id from products where id = ${l.productId}`)).rows[0]?.category_id ?? null : null;
      const [line] = (await db.execute(sql`insert into reception_lines (reception_id, product_id, product_name, unit, category_id, qty_ordered, qty_received, unit_price, decision, note, document, position)
        values (${rec.id}, ${l.productId ?? null}, ${l.name}, ${l.unit || "Pièce"}, ${cat}, ${l.qo ?? null}, ${l.qr ?? null}, ${l.price ?? null}, 'conform', ${l.note ?? null}, ${docs[0]?.number ?? null}, ${pos++}) returning id`)).rows;
      lineByName.set(k, line.id);
      return line.id;
    };
    for (const a of g.list) {
      let lineId = null;
      if (a.source === "weigh" && a.group_key?.startsWith("ref:")) {
        // Écarts de pesée du bon : lignes avec quantité facturée / pesée ; les écarts sont rattachés à la fiche
        const gaps = (await db.execute(sql`select id, product, product_id, qty_invoiced, qty_weighed, unit_price, detail from weigh_gaps
          where reception_id is null and lower(trim(coalesce(supplier_ref, product))) = ${a.group_key.slice(4)}`)).rows;
        for (const w of gaps) {
          const id = await addLine({ name: w.product, productId: w.product_id, unit: "Kg", qo: w.qty_invoiced, qr: w.qty_weighed, price: w.unit_price, note: w.detail });
          lineId ??= id;
        }
        if (gaps.length) {
          await db.execute(sql`update weigh_gaps set reception_id = ${rec.id} where id in (select jsonb_array_elements_text(${JSON.stringify(gaps.map((w) => w.id))}::jsonb)::int)`);
          await db.execute(sql`update anomalies set group_key = ${`rec:${rec.id}`} where id = ${a.id}`);
        }
      } else {
        // Anomalie du fichier : une ligne par produit de la fiche (prix connu), le détail de l'anomalie en note
        const items = Array.isArray(a.items) && a.items.length ? a.items : a.product_name ? [{ name: a.product_name, productId: a.product_id, unit: "", qty: null, price: null }] : [];
        for (const it of items) {
          const id = await addLine({ name: it.name, productId: it.productId, unit: it.unit, price: it.price, note: `${a.problem_type || a.type}${it.qty != null ? ` : ${it.qty} ${it.unit ?? ""}` : ""} — ${a.description}`.slice(0, 500) });
          lineId ??= id;
        }
      }
      await db.execute(sql`update anomalies set reception_id = ${rec.id}, line_id = coalesce(line_id, ${lineId}) where id = ${a.id}`);
    }
    made++;
  }
  console.log(`[migrate] fiches de réception générées à partir des anomalies importées : ${made} (non consolidées)`);
  await db.execute(sql`insert into app_settings (key, value) values ('receptions_from_imports_v1', '1') on conflict (key) do nothing`);
}

// Dev : fiches de réception générées à partir des anomalies importées, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v28'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Liste des fiches de réception', 'Importée', false, ${"Fiches générées à partir des anomalies importées (fichier de suivi, écarts de pesée) : une par fournisseur + BL / facture + jour, lignes reprises des produits et des pesées ; état « Importée », jamais consolidées ni exportées automatiquement ; supprimer ou modifier la fiche ne supprime pas les anomalies importées."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v28', '1') on conflict (key) do nothing`);
}

// Renumérotation par date (une fois) : fiches de réception (RCP, date de livraison), anomalies (ANO, date de création),
// réclamations (R, date de la première anomalie ; les anomalies regroupées gardent le même N°) — remise à zéro le 01/01
if (!(await db.execute(sql`select 1 from app_settings where key = 'renumber_by_date_v1'`)).rows.length) {
  await db.execute(sql`update receptions r set seq = x.n from (
      select id, row_number() over (partition by extract(year from delivered_at at time zone 'Europe/Paris') order by delivered_at, id) as n from receptions
    ) x where r.id = x.id`);
  // Toutes les fiches d'anomalie reçoivent leur N° (ANO) dans l'ordre des dates (index unique retiré par la migration 0037)
  await db.execute(sql`update anomalies set number = null`);
  await db.execute(sql`update anomalies a set number = x.n from (
      select id, row_number() over (partition by extract(year from created_at at time zone 'Europe/Paris') order by created_at, id) as n from anomalies
    ) x where a.id = x.id`);
  await db.execute(sql`update anomalies a set claim_no = x.n from (
      select g.old, g.y, row_number() over (partition by g.y order by g.first, g.old) as n
      from (select claim_no as old, extract(year from created_at at time zone 'Europe/Paris') as y, min(created_at) as first from anomalies where claim_no is not null group by 1, 2) g
    ) x where a.claim_no = x.old and extract(year from a.created_at at time zone 'Europe/Paris') = x.y`);
  console.log("[migrate] numéros RCP / ANO / R remis dans l'ordre des dates");
  await db.execute(sql`insert into app_settings (key, value) values ('renumber_by_date_v1', '1') on conflict (key) do nothing`);
}

// Type d'anomalie « Produit manquant » renommé « Produit - Quantité », une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'type_missing_rename_v1'`)).rows.length) {
  await db.execute(sql`update anomalies set problem_type = 'Produit - Quantité' where problem_type = 'Produit manquant'`);
  await db.execute(sql`update app_settings set value = replace(value, '"Produit manquant"', '"Produit - Quantité"') where key = 'anomaly_problem_types'`);
  await db.execute(sql`insert into app_settings (key, value) values ('type_missing_rename_v1', '1') on conflict (key) do nothing`);
}

// « En attente de » : fiches déjà en attente → Retour fournisseur (Avec relance) ou Avoir / Régul (Sans relance), une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v29'`)).rows.length) {
  await db.execute(sql`update anomalies set waiting_for = case when mode = 'verification' then 'avoir' else 'reponse' end where stage = 'en_attente' and waiting_for is null`);
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Suivi de la réclamation', 'En attente de', false, ${"Statut « En attente » : Retour fournisseur, Avoir / Régul, Livraison ou Retour marchandise ; visible sur la fiche (bandeau, boutons), dans les listes des anomalies et des réclamations et dans le tableau de bord. « Retour fournisseur » par défaut à l'envoi de la réclamation."}, '', ${pos})`);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('anomaly', 'Fiche', 'N° (renumérotation)', false, ${"RCP par date de livraison, ANO par date de création, R par date de la première anomalie (regroupements conservés), par année ; les nouvelles fiches prennent la suite. Type « Produit manquant » renommé « Produit - Quantité »."}, '', ${pos + 1})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v29', '1') on conflict (key) do nothing`);
}

// Dev : fiches de réception importées sans champ obligatoire, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v30'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Modification', 'Fiche importée', false, ${"Fiches générées depuis les anomalies importées : aucun champ obligatoire à la modification (prix, DLC, température, conformité) ; une ligne sans décision est enregistrée Conforme."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v30', '1') on conflict (key) do nothing`);
}

// Dev : modification d'une fiche de réception importée → fiches d'anomalie mises à jour, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v31'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Modification', 'Fiche importée → anomalies', false, ${"Modifier une fiche importée met à jour ses fiches d'anomalie (non consolidées) : fournisseur, date, référence si les documents changent, produits, quantité = écart Q Facturée / Q Contrôlée, prix, montant réclamé = somme des produits ; écarts de pesée recalculés. Ligne supprimée → produit retiré de l'anomalie."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v31', '1') on conflict (key) do nothing`);
}

// Anciennes fiches de réception modifiées : la fiche « Écart de pesée » créée à la modification est reportée
// sur la fiche d'anomalie existante (produits, montant, type Écart de pesée) puis retirée ; suppression d'ANO407 demandée, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'imported_edits_fix_v1'`)).rows.length) {
  // ANO407 (2026) : N° enregistré, sinon N° provisoire (à la suite du dernier N° enregistré, par date de création)
  const yearOf = sql`extract(year from created_at at time zone 'Europe/Paris') = 2026`;
  let ano407 = (await db.execute(sql`select id from anomalies where number = 407 and ${yearOf}`)).rows[0]?.id ?? null;
  if (!ano407) {
    const max = Number((await db.execute(sql`select coalesce(max(number), 0) as m from anomalies where ${yearOf}`)).rows[0].m);
    if (407 > max) ano407 = (await db.execute(sql`select id from anomalies where number is null and ${yearOf} order by created_at, id offset ${407 - max - 1} limit 1`)).rows[0]?.id ?? null;
  }
  const dups = (await db.execute(sql`select a.* from anomalies a join receptions r on r.id = a.reception_id
    where r.imported_from is not null and a.source = 'weigh' and a.number is null and a.consolidated_at is null`)).rows;
  let merged = 0;
  for (const d of dups) {
    const own = (await db.execute(sql`select id, type, product_name, items from anomalies where reception_id = ${d.reception_id} and id <> ${d.id} and consolidated_at is null and number is not null order by id`)).rows;
    const names = new Set((d.items ?? []).map((it) => String(it.name).trim().toLowerCase()));
    const hit = (a) => names.has(String(a.product_name ?? "").trim().toLowerCase()) || (a.items ?? []).some((it) => names.has(String(it.name).trim().toLowerCase()));
    const target = own.find(hit) ?? (own.length === 1 ? own[0] : own.find((a) => a.type === "missing" || a.type === "quantity"));
    if (!target) continue;
    await db.execute(sql`update anomalies set type = 'quantity', problem_type = 'Écart de pesée', source = 'weigh', group_key = ${d.group_key},
      items = ${JSON.stringify(d.items ?? [])}::jsonb, product_name = ${d.product_name}, product_id = coalesce(${d.product_id}, product_id), description = ${d.description},
      claimed_amount = coalesce(${d.claimed_amount}, claimed_amount), supplier_id = coalesce(${d.supplier_id}, supplier_id), nature = coalesce(${d.nature}, nature) where id = ${target.id}`);
    await db.execute(sql`delete from anomalies where id = ${d.id}`);
    merged++;
  }
  if (ano407) await db.execute(sql`delete from anomalies where id = ${ano407} and consolidated_at is null`);
  console.log(`[migrate] écarts de pesée reportés sur la fiche existante : ${merged} ; ANO407 ${ano407 ? "supprimée" : "introuvable"}`);
  await db.execute(sql`insert into app_settings (key, value) values ('imported_edits_fix_v1', ${JSON.stringify({ merged, ano407 })}) on conflict (key) do nothing`);
}

// Dev : anciennes fiches modifiées sans nouvelle fiche d'anomalie, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v32'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Modification', 'Fiche importée : pas de nouvelle anomalie', false, ${"Modifier une ancienne fiche (importée) ne crée aucune nouvelle fiche d'anomalie et n'en supprime aucune : la fiche existante est mise à jour (produit indiqué, quantités, prix, montant). Produit au kg avec Q Facturée / Q Contrôlée : l'écart de pesée est calculé et reporté sur la fiche existante, dont le type passe à « Écart de pesée »."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v32', '1') on conflict (key) do nothing`);
}

// Dev : consolidation manuelle d'une ancienne fiche, une fois
if (!(await db.execute(sql`select 1 from app_settings where key = 'dev_fields_v33'`)).rows.length) {
  const pos = Number((await db.execute(sql`select coalesce(max(position), 0) + 1 as p from dev_fields`)).rows[0].p);
  await db.execute(sql`insert into dev_fields (form, section, field, required, rule, message, position) values ('reception', 'Fiche de réception', 'Consolider (ancienne fiche)', false, ${"Bouton « Consolider » sur une ancienne fiche (importée) non consolidée, avec confirmation, pour les comptes ayant le droit Consolidation : la fiche n'est plus modifiable ; pas d'export FPM automatique ; les fiches d'anomalie restent modifiables."}, '', ${pos})`);
  await db.execute(sql`insert into app_settings (key, value) values ('dev_fields_v33', '1') on conflict (key) do nothing`);
}

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
