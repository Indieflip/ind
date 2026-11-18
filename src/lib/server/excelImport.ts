import "server-only";
import { unitName } from "@/lib/units";
import ExcelJS from "exceljs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { num, shortDates } from "@/lib/format";
import { nameKey, normalize } from "@/lib/search";
import { categoryCodeFromNature } from "@/lib/nature";
import { setSetting } from "@/lib/settings";
import { syncFvProducts } from "./fv";
import { cleanReference, linkWeighGaps, normalizeMajLog, supplierMatcher } from "./maj";
import { outcomeFromText } from "@/lib/anomaly";

type Cell = string | number | Date | null;

/** Valeur lisible d'une cellule ExcelJS (formules, texte enrichi, liens…) */
function val(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("result" in v) return val(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("") || null;
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

function rowsOf(ws: ExcelJS.Worksheet, width: number): Cell[][] {
  const out: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: Cell[] = [];
    for (let c = 1; c <= width; c++) cells.push(val(row.getCell(c).value));
    out.push(cells);
  });
  return out;
}

const text = (c: Cell) => (c == null ? null : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim() || null);
const price = (c: Cell) => (typeof c === "number" ? c : c == null || c instanceof Date ? null : num(String(c).replace(/€/g, "")));
const isoDate = (c: Cell) => {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === "string") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(c.trim());
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
};

function findSheet(wb: ExcelJS.Workbook, name: string) {
  return wb.worksheets.find((w) => normalize(w.name) === normalize(name));
}

export interface ImportReport {
  mercurial?: { created: number; updated: number; deactivated: number; suppliers: number; fileProducts: number; fileSuppliers: number };
  maj?: number;
  fv?: number;
  fvLocked?: number;
  bakery?: { days: number; prices: Record<string, number | null> };
  lockedList?: { listed: number; matched: number };
  meatFish?: { kind: string; year: number; entries: number; products: number; months: number };
  control?: { weighGaps: number; anomalies: number; protocols: string[] };
  missing: string[];
}

export async function importWorkbook(buffer: ArrayBuffer, sheets: { mercurial: boolean; maj: boolean; fv: boolean; bakery: boolean; locked?: boolean; gaps?: boolean; anomalies?: boolean; process?: boolean; info?: boolean }): Promise<ImportReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const report: ImportReport = { missing: [] };
  const db = getDb();

  // ---------- Suivi Viande / Poisson : « Suivi des réceptions de viandes|poisson - 2026 »
  {
    const intro = wb.worksheets[0] ? rowsOf(wb.worksheets[0], 3).flat().map((c) => String(c ?? "")).join(" ") : "";
    const m = /suivi des r[ée]ceptions de (viande|poisson)s?\s*-?\s*(20\d\d)?/i.exec(intro);
    if (m) {
      const kind = normalize(m[1]).startsWith("viande") ? "viande" : "poisson";
      const year = Number(m[2]) || new Date().getFullYear();
      const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
      const entries: { date: string; product: string; unit: string | null; qty: number }[] = [];
      let months = 0;
      for (const ws of wb.worksheets) {
        const mi = MONTHS.findIndex((x) => normalize(ws.name).startsWith(x));
        if (mi < 0) continue;
        months++;
        const rows = rowsOf(ws, 40);
        // Ligne d'en-tête : numéros des jours ; un ou deux blocs (1→17 puis 18→31)
        const hi = rows.findIndex((r) => r.filter((c) => typeof c === "number" && c >= 1 && c <= 31 && Number.isInteger(c)).length >= 10);
        if (hi < 0) continue;
        const header = rows[hi];
        const segments: { start: number; cols: { col: number; day: number }[] }[] = [];
        for (let c = 0; c < header.length; c++) {
          const v = header[c];
          if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31) {
            const last = segments[segments.length - 1];
            if (last && last.cols[last.cols.length - 1].col === c - 1) last.cols.push({ col: c, day: v });
            else segments.push({ start: c, cols: [{ col: c, day: v }] });
          }
        }
        for (const r of rows.slice(hi + 1)) {
          for (const seg of segments) {
            const product = text(r[seg.start - 2]);
            if (!product || product.startsWith("-")) continue;
            const unit = text(r[seg.start - 1]);
            for (const { col, day } of seg.cols) {
              const q = price(r[col]);
              if (q == null || q === 0) continue;
              const d = new Date(Date.UTC(year, mi, day));
              if (d.getUTCMonth() !== mi) continue;
              entries.push({ date: d.toISOString().slice(0, 10), product, unit: unitName(unit) || null, qty: q });
            }
          }
        }
      }
      await db.transaction(async (tx) => {
        await tx.delete(schema.meatFishEntries).where(and(eq(schema.meatFishEntries.kind, kind), isNull(schema.meatFishEntries.receptionId), sql`extract(year from ${schema.meatFishEntries.date}) = ${year}`));
        for (const e of entries) await tx.insert(schema.meatFishEntries).values({ kind, date: e.date, product: e.product, unit: e.unit, qty: String(e.qty) });
      });
      report.meatFish = { kind, year, entries: entries.length, products: new Set(entries.map((e) => normalize(e.product))).size, months };
      return report;
    }
  }


  // ---------- Suivi contrôle Qualité & Quantité : « Ecarts pesée », « Anomalies », « Process », « Info complémentaire »
  {
    let wsGap = findSheet(wb, "Ecarts pesée") ?? findSheet(wb, "Ecarts pesee") ?? findSheet(wb, "Écarts pesées");
    let wsAno = findSheet(wb, "Anomalies");
    let wsProc = findSheet(wb, "Process");
    let wsInfo = findSheet(wb, "Info complémentaire");
    if (wsGap || (wsAno && !findSheet(wb, "Mercurial")) || wsProc || wsInfo) {
      // Onglets décochés : laissés de côté
      if (sheets.gaps === false) wsGap = undefined;
      if (sheets.anomalies === false) wsAno = undefined;
      if (sheets.process === false) wsProc = undefined;
      if (sheets.info === false) wsInfo = undefined;
      const control = { weighGaps: 0, anomalies: 0, protocols: [] as string[] };
      const headerIndex = (rows: Cell[][], first: string) => rows.findIndex((r) => normalize(String(r[0] ?? "")) === normalize(first));
      const multiline = (c: Cell) => shortDates((text(c) ?? "").replace(/^"+|"+$/g, "").trim());

      if (wsGap) {
        const rows = rowsOf(wsGap, 12);
        const hi = headerIndex(rows, "Date réception");
        const gaps: (typeof schema.weighGaps.$inferInsert)[] = [];
        for (const [i, r] of rows.slice(hi + 1).entries()) {
          const date = isoDate(r[0]);
          const product = text(r[3]);
          if (!date || !product || normalize(product).startsWith("total")) continue;
          const n = (c: Cell) => { const v = price(c); return v == null ? null : String(v); };
          gaps.push({
            date, nature: text(r[1]), supplierRef: text(r[2])?.replace(/\s+/g, " ") ?? null, product,
            qtyInvoiced: n(r[4]), unitPrice: n(r[5]), qtyWeighed: n(r[6]), acceptableLoss: n(r[7]), gapQty: n(r[8]), gapAmount: n(r[9]),
            detail: multiline(r[10]) || null, claimDate: isoDate(r[11]), position: i,
          });
        }
        await db.transaction(async (tx) => {
          await tx.delete(schema.weighGaps).where(isNull(schema.weighGaps.receptionId));
          for (let k = 0; k < gaps.length; k += 200) await tx.insert(schema.weighGaps).values(gaps.slice(k, k + 200));
        });
        await linkWeighGaps(true);
        control.weighGaps = gaps.length;
      }

      if (wsAno) {
        const rows = rowsOf(wsAno, 9);
        const hi = headerIndex(rows, "Date livraison");
        const matcher = await supplierMatcher();
        const typeOf = (pb: string): (typeof schema.anomalies.$inferInsert)["type"] => {
          const v = normalize(pb);
          if (/pas de bl/.test(v)) return "missing_bl";
          if (/manquant|non receptionn|pas ete livre/.test(v)) return "missing";
          if (/prix|facture a |augmentation/.test(v)) return "price";
          if (/aspect|abime|trop mur|ouvert/.test(v)) return "damaged";
          if (/pese|q=|quantit|en plus|au lieu/.test(v)) return "quantity";
          if (/erreur/.test(v)) return "wrong_product";
          return "other";
        };
        const list: (typeof schema.anomalies.$inferInsert)[] = [];
        for (const r of rows.slice(hi + 1)) {
          const ref = text(r[2])?.replace(/\s+/g, " ") ?? "";
          const problem = multiline(r[4]);
          const product = multiline(r[3]);
          if (!ref && !problem && !product) continue;
          const [sup, ...rest] = ref.split(/\s+:\s+/);
          const supplierName = (sup || "—").trim();
          const date = isoDate(r[0]);
          const result = multiline(r[7]);
          const saving = price(r[8]);
          const done = /avoir recu|cloture|regle/.test(normalize(result));
          list.push({
            supplierName, supplierId: matcher.find(supplierName) ?? matcher.find(ref), reference: cleanReference(rest.join(" : "), matcher.keys) || null,
            productName: product || null, nature: text(r[1]), description: problem || product || "—", type: typeOf(problem),
            // Résultat : choix Clôturé / En cours / Annulé ; le texte du fichier reste lisible dans « Action »
            followUp: [multiline(r[5]), result ? `Résultat : ${result}` : ""].filter(Boolean).join("\n") || null,
            lastActionAt: isoDate(r[6]),
            result: outcomeFromText(result, done ? "closed" : undefined),
            creditAmount: saving != null ? String(Math.abs(saving)) : null, status: done ? "closed" : saving != null ? "credit_received" : "open",
            imported: true, createdAt: date ? new Date(`${date}T12:00:00Z`) : new Date(),
          });
        }
        await db.transaction(async (tx) => {
          await tx.delete(schema.anomalies).where(and(eq(schema.anomalies.imported, true), isNull(schema.anomalies.consolidatedAt)));
          for (let k = 0; k < list.length; k += 200) await tx.insert(schema.anomalies).values(list.slice(k, k + 200));
        });
        control.anomalies = list.length;
      }

      if (wsProc) {
        const rows = rowsOf(wsProc, 3);
        const hi = headerIndex(rows, "Fournisseur");
        const bySupplier = new Map<string, { process: string; lines: string[] }[]>();
        for (const r of rows.slice(hi + 1)) {
          const sup = text(r[0]);
          const detail = multiline(r[2]);
          if (!sup && !detail) continue;
          const key = sup ?? [...bySupplier.keys()].pop() ?? "—";
          bySupplier.set(key, [...(bySupplier.get(key) ?? []), { process: text(r[1]) ?? "", lines: detail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }]);
        }
        // Process de réclamation : recopié dans le compte de chaque fournisseur (s'il n'en a pas déjà un), plus de protocole séparé
        const m = await supplierMatcher();
        for (const [sup, items] of bySupplier) {
          const id = m.find(sup);
          if (!id) continue;
          const textOf = items.flatMap((it) => [it.process ? `${it.process} :` : "", ...it.lines.map((l) => `• ${l}`)]).filter(Boolean).join("\n");
          const cur = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id), columns: { claimProcess: true } });
          if (!cur?.claimProcess?.trim() && textOf) await db.update(schema.suppliers).set({ claimProcess: textOf }).where(eq(schema.suppliers.id, id));
        }
        control.protocols.push("Process de réclamation (comptes fournisseurs)");
      }

      if (wsInfo) {
        // Liste des contenants → table affichée sous « Process pèse » (le fichier donne les tares en grammes : ramenées en kg)
        const rows = rowsOf(wsInfo, 4);
        const hi = headerIndex(rows, "Prestataire");
        const clean = (c: Cell) => { const v = multiline(c); return v && v !== "-" ? v : null; };
        const list: (typeof schema.containers.$inferInsert)[] = [];
        for (const r of rows.slice(hi + 1)) {
          if (!text(r[1]) && !text(r[3])) continue;
          const g = price(r[2]);
          list.push({ supplier: clean(r[0]), product: clean(r[1]), tare: g != null ? String(g / 1000) : null, container: clean(r[3]) });
        }
        list.sort((a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? "", "fr") || (a.product ?? "").localeCompare(b.product ?? "", "fr"));
        await db.transaction(async (tx) => {
          await tx.delete(schema.containers);
          if (list.length) await tx.insert(schema.containers).values(list.map((x, k) => ({ ...x, position: k })));
        });
        // Tares : affichées dans Protocoles > Procédures > Réception (partie pesée)
      }

      report.control = control;
      return report;
    }
  }

  // ---------- Mercurial : Fournisseur | Service | Nature | Produits | Unite | - | +
  if (sheets.mercurial) {
    const ws = findSheet(wb, "Mercurial");
    if (!ws) report.missing.push("Mercurial");
    else {
      const rows = rowsOf(ws, 7).slice(1);
      const categories = await db.select().from(schema.categories);
      const catId = (nature: string | null) => categories.find((c) => c.code === categoryCodeFromNature(nature))?.id ?? null;
      const supplierIds = new Map<string, number>();
      for (const s of await db.select().from(schema.suppliers).orderBy(schema.suppliers.id)) if (!supplierIds.has(nameKey(s.name))) supplierIds.set(nameKey(s.name), s.id);
      const existing = await db.select().from(schema.products);
      // Clé : fournisseur + produit + rang (le fichier contient quelques doublons volontaires)
      const pool = new Map<string, (typeof existing)[number][]>();
      for (const p of existing) {
        if (p.fvItemId) continue;
        const k = `${p.supplierId}|${normalize(p.name)}`;
        pool.set(k, [...(pool.get(k) ?? []), p]);
      }
      const seen = new Set<number>();
      let created = 0, updated = 0, newSuppliers = 0;
      const units = new Set<string>();

      await db.transaction(async (tx) => {
        for (const r of rows) {
          const supplierName = text(r[0]);
          const productName = text(r[3]);
          if (!supplierName || !productName) continue;
          let supplierId = supplierIds.get(nameKey(supplierName));
          if (!supplierId) {
            supplierId = (await tx.insert(schema.suppliers).values({ name: supplierName }).onConflictDoNothing().returning())[0]?.id;
            if (!supplierId) supplierId = (await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.name, supplierName) }))!.id;
            supplierIds.set(nameKey(supplierName), supplierId);
            newSuppliers++;
          }
          const unit = unitName(text(r[4]));
          if (unit) units.add(unit);
          const values = {
            supplierId,
            name: productName,
            service: text(r[1]),
            nature: text(r[2]),
            unit,
            priceMin: price(r[5]) != null ? String(price(r[5])) : null,
            price: price(r[6]) != null ? String(price(r[6])) : null,
            categoryId: catId(text(r[2])),
            active: true,
          };
          const k = `${supplierId}|${normalize(productName)}`;
          const match = (pool.get(k) ?? []).find((p) => !seen.has(p.id));
          if (match) {
            seen.add(match.id);
            await tx.update(schema.products).set(values).where(eq(schema.products.id, match.id));
            updated++;
          } else {
            await tx.insert(schema.products).values(values);
            created++;
          }
        }
        // Produits absents du fichier : retirés du mercurial (les bons passés les gardent)
        let deactivated = 0;
        for (const p of existing) {
          if (!seen.has(p.id) && p.active && !p.fvItemId) {
            await tx.update(schema.products).set({ active: false }).where(eq(schema.products.id, p.id));
            deactivated++;
          }
        }
        for (const u of units) await tx.insert(schema.units).values({ name: u }).onConflictDoNothing();
        const valid = rows.filter((r) => text(r[0]) && text(r[3]));
        report.mercurial = {
          created, updated, deactivated, suppliers: newSuppliers,
          fileProducts: valid.length,
          fileSuppliers: new Set(valid.map((r) => normalize(text(r[0])!))).size,
        };
      });
    }
  }

  // ---------- Suivi MAJ : Date | Nature | (produit) | Détail | BL / Facture | RECLAMATION
  if (sheets.maj) {
    const ws = findSheet(wb, "Suivi MAJ");
    if (!ws) report.missing.push("Suivi MAJ");
    else {
      const rows = rowsOf(ws, 6).slice(1).filter((r) => r.some((c) => c != null));
      await db.transaction(async (tx) => {
        await tx.delete(schema.majLog);
        let position = 0;
        for (const r of rows) {
          await tx.insert(schema.majLog).values({
            date: isoDate(r[0]),
            nature: text(r[1]),
            item: text(r[2]),
            detail: text(r[3]),
            reference: text(r[4]),
            claim: text(r[5]),
            position: position++,
          });
        }
      });
      await normalizeMajLog();
      await setSetting("maj_normalized_v4", "1");
      report.maj = rows.length;
    }
  }

  // ---------- Fruits et légumes : Prestataire | Produit | Unite | 12 × (Moins, Plus) | Prix bloqués
  if (sheets.fv) {
    const ws = findSheet(wb, "Fruits et légumes");
    if (!ws) report.missing.push("Fruits et légumes");
    else {
      // Produits en couleur (bleu) dans le fichier = prix bloqués
      const lockedRows = new Set<number>();
      ws.eachRow((row, n) => {
        const f = row.getCell(2).fill as ExcelJS.FillPattern | undefined;
        const c = f?.type === "pattern" && f.pattern !== "none" ? (f.fgColor as { argb?: string; indexed?: number; theme?: number } | undefined) : undefined;
        const white = !c || c.argb === "FFFFFFFF" || c.indexed === 9 || c.indexed === 64 || (c.theme === 0 && !c.argb);
        if (c && !white) lockedRows.add(n);
      });
      const rows = rowsOf(ws, 28).map((r, i) => ({ r, n: i + 1 })).slice(2).filter(({ r }) => text(r[1]));
      const year = Number(new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "Europe/Paris" }).format(new Date()));
      await db.transaction(async (tx) => {
        await tx.delete(schema.fvItems).where(eq(schema.fvItems.year, year));
        let position = 0;
        for (const { r, n } of rows) {
          await tx.insert(schema.fvItems).values({
            supplier: text(r[0]) ?? "",
            product: text(r[1])!,
            unit: text(r[2]),
            year,
            prices: r.slice(3, 27).map(price),
            blocked: text(r[27]),
            locked: lockedRows.has(n) || !!text(r[27]),
            position: position++,
          });
        }
      });
      await syncFvProducts();
      report.fv = rows.length;
      report.fvLocked = rows.filter(({ r, n }) => lockedRows.has(n) || !!text(r[27])).length;
    }
  }

  // ---------- Boulangerie : prix unitaires + quantités par jour et par mois
  if (sheets.bakery) {
    const ws = findSheet(wb, "Boulangerie");
    if (!ws) report.missing.push("Boulangerie");
    else {
      const rows = rowsOf(ws, 20);
      const [h1, h2] = [rows[0] ?? [], rows[1] ?? []];
      const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
      const monthOf = (c: Cell) => {
        const n = normalize(String(c ?? ""));
        const i = MONTHS.findIndex((m) => n.startsWith(m));
        return i >= 0 ? i + 1 : null;
      };
      const itemOf = (c: Cell): "baguette" | "hamburger" | "rolls" | "painDeMie" | null => {
        const n = normalize(String(c ?? ""));
        if (n.startsWith("baguette")) return "baguette";
        if (n.startsWith("hamburger")) return "hamburger";
        if (n.startsWith("roll")) return "rolls";
        if (n.startsWith("pain de mie")) return "painDeMie";
        return null;
      };
      // Colonnes E→T : chaque colonne = (mois, article). Le mois est sur l'une des deux lignes d'en-tête.
      const cols: { col: number; month: number; item: NonNullable<ReturnType<typeof itemOf>> }[] = [];
      let month: number | null = null;
      for (let c = 4; c < 20; c++) {
        month = monthOf(h1[c]) ?? monthOf(h2[c]) ?? month;
        const item = itemOf(h1[c]) ?? itemOf(h2[c]);
        if (month && item) cols.push({ col: c, month, item });
      }
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();
      const entries = new Map<string, Record<string, number | null>>();
      for (const r of rows.slice(2)) {
        const day = typeof r[3] === "number" ? r[3] : null;
        if (!day || day < 1 || day > 31) continue;
        for (const { col, month: m, item } of cols) {
          const v = price(r[col]);
          if (v == null) continue;
          const y = m > curMonth ? curYear - 1 : curYear;
          const d = new Date(Date.UTC(y, m - 1, day));
          if (d.getUTCMonth() !== m - 1) continue; // 31 juin…
          const key = d.toISOString().slice(0, 10);
          const e = entries.get(key) ?? { baguette: null, hamburger: null, rolls: null, painDeMie: null };
          e[item] = v;
          entries.set(key, e);
        }
      }
      // Prix unitaires (colonne PU) repérés par le nom du produit
      const prices: Record<string, number | null> = { baguette: null, hamburger: null, rolls: null, painDeMie: null };
      for (const r of rows.slice(2)) {
        const name = normalize(String(r[0] ?? ""));
        const pu = price(r[1]);
        if (!name || pu == null) continue;
        if (name.includes("baguette tradition") || (name.startsWith("baguette") && prices.baguette == null)) prices.baguette = pu;
        else if (name.startsWith("hamburger") && prices.hamburger == null) prices.hamburger = pu;
        else if (name.startsWith("roll") && prices.rolls == null) prices.rolls = pu;
        else if (name.startsWith("pain de mie") && prices.painDeMie == null) prices.painDeMie = pu;
      }
      let days = 0;
      await db.transaction(async (tx) => {
        await tx.delete(schema.bakeryEntries).where(isNull(schema.bakeryEntries.receptionId));
        for (const [date, e] of [...entries.entries()].sort()) {
          if (Object.values(e).every((v) => v == null || v === 0)) continue;
          const s = (v: number | null) => (v != null ? String(v) : null);
          await tx.insert(schema.bakeryEntries).values({ date, baguette: s(e.baguette), hamburger: s(e.hamburger), rolls: s(e.rolls), painDeMie: s(e.painDeMie) });
          days++;
        }
      });
      for (const [k, v] of Object.entries(prices)) if (v != null) await setSetting(`bakery_price_${k}`, String(v));
      report.bakery = { days, prices };
    }
  }
  // ---------- Liste des prix bloqués : onglet « Liste » (Prestataire | Produit | Unité)
  if (sheets.locked !== false) {
    const ws = findSheet(wb, "Liste");
    if (ws) {
      const names = rowsOf(ws, 3).map((r) => text(r[1])).filter((n): n is string => !!n && normalize(n) !== "produit");
      const wanted = new Set(names.map(normalize));
      const items = await db.select({ id: schema.fvItems.id, product: schema.fvItems.product }).from(schema.fvItems);
      let matched = 0;
      for (const it of items) {
        if (wanted.has(normalize(it.product))) {
          await db.update(schema.fvItems).set({ locked: true }).where(eq(schema.fvItems.id, it.id));
          matched++;
        }
      }
      // Produits du mercurial de même nom (hors fruits et légumes) : prix bloqué aussi
      const prods = await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(isNull(schema.products.fvItemId));
      for (const p of prods) if (wanted.has(normalize(p.name))) await db.update(schema.products).set({ priceLocked: true }).where(eq(schema.products.id, p.id));
      await syncFvProducts();
      report.lockedList = { listed: names.length, matched };
    }
  }
  return report;
}
