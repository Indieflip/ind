// Recherche tolérante, utilisable côté client et serveur :
// « creme » trouve « Crème 35% », « ROLLS » trouve « Roll's », « saumon56 » trouve « Saumon 5/6 ».

/** Minuscules, sans accents, ponctuation remplacée par des espaces */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const compact = (s: string) => normalize(s).replace(/ /g, "");

/** Tous les mots tapés doivent se retrouver dans le texte (dans n'importe quel ordre) */
export function matches(text: string, query: string) {
  const q = normalize(query);
  if (!q) return true;
  const n = normalize(text);
  const c = compact(text);
  return q.split(" ").every((w) => n.includes(w) || c.includes(w)) || c.includes(compact(query));
}

/** Score pour trier les suggestions : début de mot d'abord, puis plus court */
export function score(text: string, query: string) {
  const n = normalize(text);
  const q = normalize(query);
  let s = 0;
  if (n.startsWith(q)) s += 100;
  else if (n.split(" ").some((w) => w.startsWith(q.split(" ")[0] ?? ""))) s += 50;
  return s - n.length / 100;
}

export function suggest(list: string[], query: string, limit = 8) {
  if (!normalize(query)) return [];
  return [...new Set(list)]
    .filter((x) => matches(x, query))
    .sort((a, b) => score(b, query) - score(a, query))
    .slice(0, limit);
}
