import { normalize } from "./search";

/** Similarité simple entre deux libellés (mots en commun), de 0 à 1 */
export function similarity(a: string, b: string) {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 1));
  const tb = new Set(normalize(b).split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return (2 * common) / (ta.size + tb.size);
}

export function bestMatch<T>(label: string, items: T[], name: (t: T) => string, threshold = 0.5): T | undefined {
  let best: T | undefined;
  let score = threshold;
  for (const it of items) {
    const s = normalize(name(it)) === normalize(label) ? 1 : similarity(label, name(it));
    if (s >= score) {
      score = s;
      best = it;
    }
  }
  return best;
}
