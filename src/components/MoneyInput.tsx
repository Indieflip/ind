"use client";

/** Champ de prix avec le symbole € affiché à droite */
export function MoneyInput({ className = "input", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input inputMode="decimal" {...props} className={`${className} pr-7`} />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">€</span>
    </div>
  );
}
