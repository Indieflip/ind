import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { canSeeDev } from "@/lib/server/dev";
import { PageHeader } from "@/components/ui";
import { DevBoard } from "./DevClient";
import { one, type SP } from "@/lib/server/queries";

/** Onglet Dev : objectifs de l'application, points en attente, idées, réalisé — tout est modifiable */
export default async function DevPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!(await canSeeDev(user))) notFound();
  const { t, locale } = await getDict();
  const items = await getDb().select().from(schema.devItems).orderBy(asc(schema.devItems.position), asc(schema.devItems.id));
  const reserved = !!(await getSetting("dev_users"));
  const tab = one((await searchParams).tab) ?? "pending";
  const fieldsTab = tab === "fields" ? await characteristics(locale, t) : null;
  return (
    <>
      <PageHeader title={t.dev.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{t.dev.intro}</p>
      <DevBoard
        reserved={reserved}
        tab={tab}
        fields={fieldsTab?.fields}
        natures={fieldsTab?.natures}
        items={items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, detail: i.detail ?? "", owner: i.owner ?? "", priority: i.priority ?? "", updated: fmtDateTime(i.updatedAt, locale), updatedSort: i.updatedAt.toISOString() }))}
      />
    </>
  );
}

/** Dev > Caractéristiques : champs des fiches + récapitulatif Catégorie / Nature des produits */
async function characteristics(locale: string, t: Awaited<ReturnType<typeof getDict>>["t"]) {
  const db = getDb();
  const [fields, products, categories, classes] = await Promise.all([
    db.select().from(schema.devFields).orderBy(asc(schema.devFields.position), asc(schema.devFields.id)),
    db.select({ categoryId: schema.products.categoryId, nature: schema.products.nature }).from(schema.products).where(eq(schema.products.active, true)),
    db.select().from(schema.categories).orderBy(asc(schema.categories.position)),
    db.select().from(schema.tempClasses),
  ]);
  // « Surgelès », « surgeles » → « Surgelés »
  const clean = (n: string) => {
    const k = n.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (k === "surgeles") return "Surgelés";
    if (k === "epicerie") return "Épicerie";
    if (k === "patisserie") return "Pâtisserie";
    return n.trim().charAt(0).toUpperCase() + n.trim().slice(1);
  };
  const groups = new Map<number | null, { count: Map<string, number>; products: number }>();
  for (const p of products) {
    const g = groups.get(p.categoryId) ?? { count: new Map(), products: 0 };
    g.products++;
    for (const n of (p.nature ?? "").split(",").map((x) => x.trim()).filter(Boolean)) g.count.set(clean(n), (g.count.get(clean(n)) ?? 0) + 1);
    groups.set(p.categoryId, g);
  }
  const deg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(Math.abs(v)).replace(".", ",")} °C`;
  const natures = [...categories.map((c) => ({ id: c.id as number | null, name: locale === "en" ? c.nameEn : c.nameFr, cls: classes.find((k) => k.id === c.tempClassId) })), { id: null, name: t.devFields.noCategory, cls: undefined }]
    .filter((c) => groups.has(c.id))
    .map((c) => {
      const g = groups.get(c.id)!;
      return {
        category: c.name,
        natures: [...g.count.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
        products: g.products,
        threshold: c.cls ? `${c.cls.label} : ≤ ${deg(c.cls.maxTemp)}` : t.devFields.none,
      };
    });
  return {
    natures,
    fields: fields.map((f) => ({ id: f.id, form: f.form, section: f.section ?? "", field: f.field, required: f.required, rule: f.rule ?? "", message: f.message ?? "", position: f.position })),
  };
}
