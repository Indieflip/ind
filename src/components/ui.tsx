import Link from "next/link";

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-stone-500">{children}</div>;
}

export function LinkButton({ href, children, variant = "secondary", download }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; download?: boolean }) {
  const cls = variant === "primary" ? "btn-primary" : "btn-secondary";
  if (download) return <a href={href} className={cls}>{children}</a>;
  return <Link href={href} className={cls}>{children}</Link>;
}

/** Barre de filtres en GET : les filtres sont dans l'URL (partageables, conservés à l'export) */
export function FilterBar({ children, applyLabel, resetHref, resetLabel }: { children: React.ReactNode; applyLabel: string; resetHref: string; resetLabel: string }) {
  return (
    <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-3">
      {children}
      <div className="flex gap-2">
        <button className="btn-primary py-2">{applyLabel}</button>
        <Link href={resetHref} className="btn-ghost py-2">{resetLabel}</Link>
      </div>
    </form>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneCls = { default: "text-stone-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-700" }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}
