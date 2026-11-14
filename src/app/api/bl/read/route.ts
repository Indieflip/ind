import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { bestMatch } from "@/lib/fuzzy";

export const maxDuration = 120;

const BlSchema = z.object({
  supplierName: z.string().nullable().describe("Nom du fournisseur (émetteur du BL), choisi dans la liste fournie si possible"),
  blNumber: z.string().nullable().describe("Numéro du bon de livraison, si visible"),
  lines: z.array(
    z.object({
      productId: z.number().int().nullable().describe("id du produit du mercurial correspondant, ou null si aucun ne correspond clairement"),
      name: z.string().describe("Désignation du produit telle qu'écrite sur le BL"),
      unit: z.string().nullable().describe("Unité : kg, pièce, carton, litre…"),
      quantity: z.number().nullable().describe("Quantité livrée indiquée sur le BL"),
      unitPrice: z.number().nullable().describe("Prix unitaire HT"),
      lot: z.string().nullable().describe("Numéro de lot"),
      dlc: z.string().nullable().describe("DLC/DDM au format AAAA-MM-JJ"),
    }),
  ),
});

const SYSTEM = `Tu lis des photos de bons de livraison (BL) de fournisseurs alimentaires pour un restaurant en France.
Extrais chaque ligne de produit livré. Règles :
- Une entrée par ligne produit ; ignore totaux, sous-totaux, TVA, frais de port, consignes et lignes de remise.
- Nombres au format décimal avec un point (12,50 € -> 12.5). Prix unitaire HT, pas le montant de la ligne.
- Quantité : la quantité livrée ; si le BL donne un poids net pour un produit vendu au kg, utilise ce poids.
- Dates au format AAAA-MM-JJ ; si l'année manque, déduis l'année la plus plausible proche de la date de livraison.
- Si une valeur est illisible ou absente, renvoie null plutôt que de deviner.
- productId : choisis dans le mercurial fourni le produit qui correspond à la ligne (même produit, même conditionnement/calibre si précisé). En cas de doute, null.`;

export async function POST(req: Request) {
  try {
    await assertUser(can.receive);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { images?: string[]; supplierId?: number | null } | null;
  const images = (body?.images ?? []).filter((i) => typeof i === "string").slice(0, 8);
  if (!images.length) return Response.json({ error: "no_images" }, { status: 400 });

  const imageBlocks: (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam)[] = [];
  for (const img of images) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(img);
    const pdf = /^data:application\/pdf;base64,(.+)$/s.exec(img);
    if (m) {
      imageBlocks.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } });
    } else if (pdf) {
      imageBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf[1] } });
    } else if (/^https:\/\/.+\.pdf($|\?)/i.test(img)) {
      imageBlocks.push({ type: "document", source: { type: "url", url: img } });
    } else if (/^https:\/\//.test(img)) {
      imageBlocks.push({ type: "image", source: { type: "url", url: img } });
    }
  }
  if (!imageBlocks.length) return Response.json({ error: "bad_images" }, { status: 400 });

  // Fournisseur connu : son mercurial sert à rattacher chaque ligne au bon produit.
  // Fournisseur inconnu (photo prise avant le choix) : on donne la liste des fournisseurs.
  const db = getDb();
  const suppliers = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.active, true));
  let catalogText = "(fournisseur non choisi : rattache les produits avec productId = null)";
  if (body?.supplierId) {
    const products = await db
      .select({ id: schema.products.id, name: schema.products.name, unit: schema.products.unit })
      .from(schema.products)
      .where(and(eq(schema.products.supplierId, body.supplierId), eq(schema.products.active, true)));
    catalogText = products.length ? products.map((p) => `${p.id} | ${p.name} | ${p.unit}`).join("\n") : "(aucun mercurial pour ce fournisseur)";
  }
  const suppliersText = suppliers.map((s) => s.name).join("\n");

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(BlSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Fournisseurs connus :\n${suppliersText}\n\nMercurial du fournisseur (id | produit | unité) :\n${catalogText}\n\nDate du jour : ${new Date().toISOString().slice(0, 10)}.\nExtrais les lignes de ce bon de livraison (${imageBlocks.length} page(s)).`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ lines: [], blNumber: null, supplierId: null, supplierName: null });
    }
    const out = response.parsed_output;
    // Fournisseur : celui choisi, sinon le plus proche du nom lu sur le BL
    const supplier = body?.supplierId
      ? suppliers.find((s) => s.id === body.supplierId)
      : out.supplierName
        ? bestMatch(out.supplierName, suppliers, (s) => s.name, 0.4)
        : undefined;
    const products = supplier
      ? await db
          .select({ id: schema.products.id, name: schema.products.name })
          .from(schema.products)
          .where(and(eq(schema.products.supplierId, supplier.id), eq(schema.products.active, true)))
      : [];
    const ids = new Set(products.map((p) => p.id));
    const lines = out.lines.map((l) => ({
      ...l,
      // productId proposé par la lecture s'il existe chez ce fournisseur, sinon rapprochement par le libellé
      productId: l.productId && ids.has(l.productId) ? l.productId : bestMatch(l.name, products, (p) => p.name)?.id ?? null,
      dlc: l.dlc && /^\d{4}-\d{2}-\d{2}$/.test(l.dlc) ? l.dlc : null,
    }));
    return Response.json({ lines, blNumber: out.blNumber, supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? out.supplierName });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "not_configured" }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("BL read API error", e.status, e.message);
      return Response.json({ error: "api_error" }, { status: 502 });
    }
    throw e;
  }
}
