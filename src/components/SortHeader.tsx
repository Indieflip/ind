import Link from "next/link";

/**
 * En-tête de colonne triable : flèche ▲ (A→Z) / ▼ (Z→A). Le tri est dans l'URL,
 * les autres filtres sont conservés et l'ordre des colonnes ne change pas.
 */
export function SortHeader({
  label,
  col,
  sort,
  dir,
  params,
  basePath,
  align = "left",
  titles,
}: {
  label: string;
  col: string;
  sort?: string;
  dir?: string;
  params: Record<string, string | undefined>;
  basePath: string;
  align?: "left" | "right";
  titles: { asc: string; desc: string };
}) {
  const active = sort === col;
  const next = active && dir === "asc" ? "desc" : "asc";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "sort" && k !== "dir") q.set(k, v);
  q.set("sort", col);
  q.set("dir", next);
  return (
    <th className={align === "right" ? "text-right" : ""} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={`${basePath}?${q}`} className={`inline-flex items-center gap-1 hover:text-stone-900 ${align === "right" ? "flex-row-reverse" : ""}`} title={next === "asc" ? titles.asc : titles.desc}>
        {label}
        <span className={`text-[10px] leading-none ${active ? "text-brand-600" : "text-stone-300"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </Link>
    </th>
  );
}

/** Tri en mémoire (accents ignorés, nombres triés comme des nombres, vides en dernier) */
export function sortRows<T>(rows: T[], get: (r: T) => unknown, dir: string | undefined) {
  const m = dir === "desc" ? -1 : 1;
  const coll = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * m;
    if (x instanceof Date && y instanceof Date) return (x.getTime() - y.getTime()) * m;
    return coll.compare(String(x), String(y)) * m;
  });
}
