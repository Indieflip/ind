"use client";
import { useMemo, useState } from "react";
import { suggest } from "@/lib/search";

/** Champ fournisseur : saisie libre + recherche dans la liste des fournisseurs existants */
export function SupplierCombo({
  suppliers,
  name = "supplierId",
  value,
  onChange,
  placeholder,
  extraOption,
  required,
  searchButton,
}: {
  suppliers: { id: number; name: string }[];
  name?: string;
  value?: number | null;
  onChange?: (id: number | null) => void;
  placeholder?: string;
  /** Option supplémentaire en bas de liste (ex. « + Rajout fournisseur ») */
  extraOption?: { label: string; onPick: () => void };
  required?: boolean;
  /** Bouton « Rechercher » : valide la recherche (premier fournisseur trouvé) */
  searchButton?: string;
}) {
  const current = suppliers.find((s) => s.id === value);
  const [text, setText] = useState(current?.name ?? "");
  const [id, setId] = useState<number | null>(value ?? null);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => (text ? suggest(suppliers.map((s) => s.name), text, 12) : suppliers.map((s) => s.name).slice(0, 12)), [suppliers, text]);
  const pick = (n: string) => {
    const s = suppliers.find((x) => x.name === n);
    setText(n);
    setId(s?.id ?? null);
    onChange?.(s?.id ?? null);
    setOpen(false);
  };
  const submit = () => { if (list[0]) pick(list[0]); };
  return (
    <div className="relative">
      <input type="hidden" name={name} value={id ?? ""} />
      <div className={searchButton ? "flex gap-2" : ""}>
      <input
        className={`input ${required && !id && text ? "border-amber-400" : ""}`}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        onChange={(e) => {
          setText(e.target.value);
          const exact = suppliers.find((s) => s.name.toLowerCase() === e.target.value.trim().toLowerCase());
          setId(exact?.id ?? null);
          onChange?.(exact?.id ?? null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (searchButton && e.key === "Enter") { e.preventDefault(); submit(); } }}
      />
      {searchButton && <button type="button" className="btn-primary shrink-0" onClick={submit}>{searchButton}</button>}
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {list.map((n) => (
            <li key={n}>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(n)}>{n}</button>
            </li>
          ))}
          {extraOption && (
            <li>
              <button type="button" className="block w-full border-t border-stone-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50" onMouseDown={(e) => e.preventDefault()} onClick={extraOption.onPick}>{extraOption.label}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
