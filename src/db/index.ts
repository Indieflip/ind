import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

function databaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL manquante : reliez la base Neon au projet Vercel.");
  return url;
}

function create(): DB {
  const url = databaseUrl();
  if (url.includes("neon.tech")) {
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon({ client: pool, schema }) as unknown as DB;
  }
  const pool = new PgPool({ connectionString: url, max: 5 });
  return drizzlePg({ client: pool, schema });
}

const g = globalThis as unknown as { __db?: DB };

/** Connexion paresseuse : n'échoue pas au build si la variable est absente */
export function getDb(): DB {
  if (!g.__db) g.__db = create();
  return g.__db;
}

export { schema };
