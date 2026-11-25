/** Texte dont les indications entre parenthèses sont affichées plus petites (ex. « Daurade (Filet sans peau) ») */
export function Paren({ text, className = "text-[0.75em] font-normal opacity-80" }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const parts = text.split(/(\([^)]*\)?)/g).filter(Boolean);
  return <>{parts.map((p, i) => (p.startsWith("(") ? <span key={i} className={className}>{p}</span> : <span key={i}>{p}</span>))}</>;
}
