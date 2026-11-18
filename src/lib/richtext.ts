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
 * Extrait d'un protocole la partie dont le titre correspond (ex. « 2. Contrôler la livraison »),
 * jusqu'au titre suivant de même niveau. Fonctionne sur le HTML de l'éditeur et sur l'ancien format texte (« ## »).
 */
export function extractSection(content: string, title: RegExp): string | null {
  if (/^\s*</.test(content)) {
    const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      if (!title.test(m[2].replace(/<[^>]+>/g, ""))) continue;
      const level = Number(m[1]);
      const rest = content.slice(m.index + m[0].length);
      const next = new RegExp(`<h[1-${level}][^>]*>`, "i").exec(rest);
      const body = next ? rest.slice(0, next.index) : rest;
      return body.trim() ? body : null;
    }
    return null;
  }
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((l) => /^#{1,3}\s/.test(l.trim()) && title.test(l));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && /^#{1,3}\s/.test(l.trim()));
  const body = lines.slice(i + 1, j < 0 ? undefined : j).join("\n").trim();
  return body || null;
}
