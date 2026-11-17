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
