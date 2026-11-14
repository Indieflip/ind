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
const baseUnits = ["pièce", "kg", "litre", "sachet"];
for (const [i, name] of baseUnits.entries()) {
  await db.execute(sql`insert into units (name, position) values (${name}, ${i + 1}) on conflict (name) do nothing`);
}
await db.execute(sql`insert into units (name) select distinct unit from products where unit is not null and unit <> '' on conflict (name) do nothing`);

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

console.log("[migrate] base à jour.");
await close();
