/** Contenu de protocole HTML (éditeur) → texte au format historique (« ## » titres, « • » puces), pour les traitements automatiques */
export function richToText(content: string) {
  if (!/^\s*</.test(content)) return content;
  return content
    .replace(/<h[12][^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n")
    .replace(/<\/h[1-3]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrait d'une procédure la partie dont le titre correspond (ex. « 2. Contrôler la livraison »),
 * jusqu'au titre suivant. Fonctionne sur le HTML de l'éditeur (titre en Titre 1-3, ou paragraphe court / en gras)
 * et sur l'ancien format texte (« ## » ou ligne « 2. … »).
 */
export function extractSection(content: string, title: RegExp): string | null {
  const plain = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  if (/^\s*</.test(content)) {
    const re = /<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    const blocks: { start: number; end: number; tag: string; html: string; text: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) blocks.push({ start: m.index, end: m.index + m[0].length, tag: m[1].toLowerCase(), html: m[2], text: plain(m[2]) });
    const isTitle = (b: (typeof blocks)[number]) =>
      b.tag !== "p" || (b.text.length <= 80 && (/^\s*\d+\s*[.)]\s/.test(b.text) || /^\s*<(strong|b)\b[\s\S]*<\/(strong|b)>\s*$/i.test(b.html)));
    const i = blocks.findIndex((b) => title.test(b.text) && isTitle(b));
    if (i < 0) return null;
    const next = blocks.slice(i + 1).find((b) => isTitle(b) && (b.tag !== "p" || /^\s*\d+\s*[.)]\s/.test(b.text) || b.tag === blocks[i].tag));
    const body = content.slice(blocks[i].end, next ? next.start : undefined).trim();
    return body ? body : null;
  }
  const lines = content.split(/\r?\n/);
  const head = (l: string) => /^\s*(#{1,6}\s|\d+\s*[.)]\s)/.test(l);
  const i = lines.findIndex((l) => title.test(l) && head(l));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && head(l));
  const body = lines.slice(i + 1, j < 0 ? undefined : j).join("\n").trim();
  return body || null;
}
