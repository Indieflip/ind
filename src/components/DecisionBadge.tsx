import type { Decision } from "@/lib/rules";

export const decisionStyles: Record<Decision, { border: string; badge: string; dot: string }> = {
  conform: { border: "border-l-emerald-500", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  reserve: { border: "border-l-amber-500", badge: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  refuse: { border: "border-l-red-500", badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
};

const statusStyles: Record<string, string> = {
  conform: "bg-emerald-100 text-emerald-800",
  with_reserves: "bg-amber-100 text-amber-900",
  partial_refusal: "bg-orange-100 text-orange-900",
  refused: "bg-red-100 text-red-800",
  open: "bg-red-100 text-red-800",
  claimed: "bg-amber-100 text-amber-900",
  credit_received: "bg-sky-100 text-sky-800",
  closed: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${statusStyles[status] ?? "bg-stone-100 text-stone-700"}`}>{label}</span>;
}
