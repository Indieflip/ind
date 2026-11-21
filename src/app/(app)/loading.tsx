/** Affiché tout de suite au changement d'onglet, pendant le chargement de la page */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded-lg bg-stone-200" />
      <div className="h-24 rounded-xl bg-stone-100" />
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-5 rounded bg-stone-100" />)}
      </div>
    </div>
  );
}
