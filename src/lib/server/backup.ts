import "server-only";
import ExcelJS from "exceljs";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num } from "@/lib/format";
import { getSetting } from "@/lib/settings";

/** Classeur Excel contenant toutes les données de l'application (une feuille par tableau) */
export async function buildBackup(): Promise<{ buffer: Buffer; fileName: string }> {
  const db = getDb();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Réception marchandises";
  wb.created = new Date();
  const sheet = (name: string, header: string[], rows: unknown[][]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(header).font = { bold: true };
    for (const r of rows) ws.addRow(r.map((v) => (v instanceof Date ? v : v ?? null)));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((c) => (c.width = 18));
  };

  const r = schema.receptions;
  const recs = await db.select().from(r).orderBy(asc(r.deliveredAt));
  sheet("Bons", ["Id", "Date", "Fournisseur", "N° BL", "Livreur", "Temp. camion", "Véhicule propre", "Statut", "Réserves", "Signataire", "Créé le", "Consolidé le"],
    recs.map((x) => [x.id, x.deliveredAt, x.supplierName, x.blNumber, x.driverName, x.truckTemp, x.vehicleClean, x.status, x.reservesText, x.signerName, x.createdAt, x.consolidatedAt]));

  const lines = await db.select({ l: schema.receptionLines, d: r.deliveredAt, s: r.supplierName, bl: r.blNumber }).from(schema.receptionLines).innerJoin(r, eq(r.id, schema.receptionLines.receptionId)).orderBy(asc(r.deliveredAt));
  sheet("Lignes (HACCP)", ["Bon", "Date", "Fournisseur", "N° BL", "Produit", "Unité", "Qté BL", "Qté reçue", "Temp.", "DLC", "Lot", "Prix HT", "Prix min", "Prix max", "Décision", "Motif"],
    lines.map(({ l, d, s, bl }) => [l.receptionId, d, s, bl, l.productName, l.unit, num(l.qtyOrdered), num(l.qtyReceived), l.temperature, l.dlc, l.lot, num(l.unitPrice), num(l.mercurialMin), num(l.mercurialPrice), l.decision, l.reason]));

  const prods = await db.select({ p: schema.products, s: schema.suppliers.name }).from(schema.products).innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.products.supplierId)).orderBy(asc(schema.suppliers.name), asc(schema.products.name));
  sheet("Mercurial", ["Fournisseur", "Nature", "Produits", "Unité", "Prix minimum", "Prix maximum", "Prix bloqué", "Actif", "Fruits et légumes"],
    prods.map(({ p, s }) => [s, p.nature, p.name, p.unit, num(p.priceMin), num(p.price), p.priceLocked, p.active, !!p.fvItemId]));

  const sup = await db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name));
  sheet("Fournisseurs", ["Fournisseur", "E-mail", "Téléphone", "Notes", "Actif"], sup.map((s) => [s.name, s.email, s.phone, s.notes, s.active]));

  const pc = await db.select().from(schema.priceChanges).orderBy(desc(schema.priceChanges.date));
  sheet("Suivi des prix", ["Date", "Fournisseur", "Produit", "Unité", "Ancien", "Nouveau", "%", "Type", "Origine", "Réf. facture", "Réclamation"],
    pc.map((x) => [x.date, x.supplierName, x.productName, x.unit, num(x.oldPrice), num(x.newPrice), x.pct, x.type, x.source, x.invoiceRef, x.claim]));

  const an = await db.select().from(schema.anomalies).orderBy(desc(schema.anomalies.createdAt));
  sheet("Anomalies", ["Date", "Bon", "Fournisseur", "Produit", "Type", "Description", "Statut", "Avoir", "Suivi"],
    an.map((a) => [a.createdAt, a.receptionId, a.supplierName, a.productName, a.type, a.description, a.status, num(a.creditAmount), a.followUp]));

  const notes = await db.select().from(schema.receptionNotes).orderBy(asc(schema.receptionNotes.createdAt));
  sheet("Notes", ["Bon", "Date", "Note"], notes.map((n) => [n.receptionId, n.createdAt, n.text]));

  const bk = await db.select().from(schema.bakeryEntries).orderBy(asc(schema.bakeryEntries.date));
  sheet("Boulangerie", ["Date", "Baguette", "Hamburger", "Roll's filmés", "Pain de mie", "Remarque", "Bon"],
    bk.map((b) => [b.date, num(b.baguette), num(b.hamburger), num(b.rolls), num(b.painDeMie), b.remark, b.receptionId]));

  const fv = await db.select().from(schema.fvItems).orderBy(asc(schema.fvItems.position));
  const months = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
  sheet("Fruits et légumes", ["Année", "Prestataire", "Produit", "Unité", ...months.flatMap((m) => [`${m} moins`, `${m} plus`]), "Prix bloqué"],
    fv.map((f) => [f.year, f.supplier, f.product, f.unit, ...Array.from({ length: 24 }, (_, i) => f.prices[i] ?? null), f.locked]));

  const maj = await db.select().from(schema.majLog).orderBy(asc(schema.majLog.position));
  sheet("Suivi MAJ", ["Date", "Nature", "Produit / fournisseur", "Détail", "BL / Facture", "Réclamation"], maj.map((m) => [m.date, m.nature, m.item, m.detail, m.reference, m.claim]));

  const restaurant = (await getSetting("restaurant_name")) ?? "";
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const slug = restaurant.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return { buffer, fileName: `sauvegarde-${slug || "reception"}-${day}.xlsx` };
}

export async function backupSettings() {
  return {
    email: (await getSetting("backup_email")) ?? "",
    frequencyDays: Number((await getSetting("backup_frequency_days")) ?? 7) || 7,
    retentionYears: Number((await getSetting("retention_years")) ?? 10) || 10,
  };
}

export async function lastBackup() {
  return getDb().query.backups.findFirst({ orderBy: desc(schema.backups.createdAt) });
}

/** Envoi par e-mail via Resend si RESEND_API_KEY est configurée. Renvoie false sinon. */
export async function emailBackup(to: string, file: { buffer: Buffer; fileName: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.BACKUP_FROM_EMAIL ?? "Sauvegarde <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Sauvegarde des réceptions — ${file.fileName}`,
      text: "Sauvegarde automatique des données de l'application Réception marchandises (fichier Excel en pièce jointe).",
      attachments: [{ filename: file.fileName, content: file.buffer.toString("base64") }],
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return true;
}
