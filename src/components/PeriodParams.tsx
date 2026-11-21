"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangeFilter } from "@/components/table/DateRangeFilter";

/** Modèle « période » pour une page : met à jour les paramètres « du » / « au » de l'adresse (ex. Reporting) */
export function PeriodParams({ from = "", to = "", fromKey = "from", toKey = "to" }: { from?: string; to?: string; fromKey?: string; toKey?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <div className="w-full max-w-xs">
      <DateRangeFilter
        large
        value={from || to ? `${from}~${to}` : ""}
        onChange={(v) => {
          const [f, t] = v.split("~");
          const q = new URLSearchParams(sp.toString());
          if (f) q.set(fromKey, f); else q.delete(fromKey);
          if (t) q.set(toKey, t); else q.delete(toKey);
          router.push(`${path}${q.size ? `?${q}` : ""}`);
        }}
      />
    </div>
  );
}
