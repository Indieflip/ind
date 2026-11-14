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
