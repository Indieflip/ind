import "server-only";
import { sql } from "drizzle-orm";
import { schema } from "@/db";

/** Date de dernière mise à jour d'un produit : création, variation de prix, ligne de l'historique du Mercurial */
export const productUpdatedAt = sql<string | null>`greatest(
  ${schema.products.createdAt},
  (select max(c.date) from price_changes c where c.product_id = ${schema.products.id}),
  (select max(m.created_at) from maj_log m where m.product_id = ${schema.products.id})
)::text`;
