/** Libellé d'un document : « Facture 03618124 du 09/06/26 » (type, numéro, date document) */
export function docLabel(d: { type?: string | null; number: string; date?: string | null }) {
  const kind = d.type === "facture" ? "Facture" : d.type === "autre" ? "Document" : "BL";
  const m = d.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date) : null;
  return `${kind} ${d.number}${m ? ` du ${m[3]}/${m[2]}/${m[1].slice(2)}` : ""}`;
}

/** Document d'une ligne de bon (sinon le premier du bon) */
export function lineDocLabel(docs: { type?: string | null; number: string; date?: string | null }[] | null | undefined, lineDoc?: string | null, blNumber?: string | null) {
  const list = docs?.length ? docs : blNumber ? [{ type: "bl", number: blNumber }] : [];
  const d = (lineDoc && list.find((x) => x.number === lineDoc)) || list[0];
  return d ? docLabel(d) : null;
}
