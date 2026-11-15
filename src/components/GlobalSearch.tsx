import { Icon } from "./Icon";

/** Champ « Recherche » : cherche n'importe quelle information de l'application */
export function GlobalSearch({ value = "", label, placeholder, button }: { value?: string; label: string; placeholder: string; button: string }) {
  return (
    <form action="/recherche" method="get" role="search" className="no-print mb-4 flex gap-2">
      <label className="relative flex-1">
        <span className="sr-only">{label}</span>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input name="q" type="search" defaultValue={value} className="input pl-10" placeholder={placeholder} autoComplete="off" />
      </label>
      <button className="btn-primary">{button}</button>
    </form>
  );
}
