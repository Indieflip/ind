import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function getSetting(key: string) {
  const row = await getDb().query.appSettings.findFirst({ where: eq(schema.appSettings.key, key) });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await getDb()
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
}

export async function getRestaurantName() {
  return (await getSetting("restaurant_name")) ?? "";
}

export const DEFAULT_BAKERY_SUPPLIER = "BOULANGERIE THIERRY";

export async function getBakerySupplier() {
  return (await getSetting("bakery_supplier")) ?? DEFAULT_BAKERY_SUPPLIER;
}

export const BAKERY_ITEMS = ["baguette", "hamburger", "rolls", "painDeMie"] as const;
export type BakeryItem = (typeof BAKERY_ITEMS)[number];

export async function getBakeryPrices(): Promise<Record<BakeryItem, number | null>> {
  const out = {} as Record<BakeryItem, number | null>;
  for (const k of BAKERY_ITEMS) {
    const v = await getSetting(`bakery_price_${k}`);
    out[k] = v != null && v !== "" ? Number(v) : null;
  }
  return out;
}
