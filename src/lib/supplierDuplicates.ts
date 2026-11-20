/**
 * Comptes fournisseurs en double possibles : même nom une fois les accents, la ponctuation,
 * les formes juridiques et les pluriels retirés, ou une seule lettre d'écart (« Producteurs réunies » / « PRODUCTEURS REUNIS »).
 */
const STOP = new Set(["sas", "sarl", "sa", "ets", "the", "les", "le", "la", "de", "du", "des"]);
const key = (n: string) =>
  n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(es|s|e)$/, "")).join("");

function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let p = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; }
  }
  return d[b.length];
}

export function supplierDuplicates<T extends { id: number; name: string }>(list: T[]): T[][] {
  const ks = list.map((s) => ({ s, k: key(s.name) }));
  const groups: T[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < ks.length; i++) {
    if (seen.has(ks[i].s.id) || !ks[i].k) continue;
    const g = [ks[i].s];
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i].k, b = ks[j].k;
      if (!b || seen.has(ks[j].s.id)) continue;
      const long = Math.min(a.length, b.length) >= 6;
      if (a === b || (long && (lev(a, b) <= 1 || a.startsWith(b) || b.startsWith(a)))) g.push(ks[j].s);
    }
    if (g.length > 1) { g.forEach((x) => seen.add(x.id)); groups.push(g); }
  }
  return groups;
}
