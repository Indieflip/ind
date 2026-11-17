"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Palette catégorielle validée (contrôle daltonisme OK) : bleu = série A, orange = série B
const A = "#2a78d6";
const B = "#eb6834";

/** Barres groupées par mois, une seule échelle, survol avec infobulle */
export function MonthlyBars({ data, aLabel, bLabel, hint }: { data: { label: string; a: number; b: number; href?: string; active?: boolean }[]; aLabel: string; bLabel: string; hint?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const router = useRouter();
  const W = 720, H = 220, padL = 28, padB = 24, padT = 12;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const slot = (W - padL) / data.length;
  const bw = Math.min(16, (slot - 10) / 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const bar = (x: number, v: number, color: string) => {
    if (v <= 0) return null;
    const h = y(0) - y(v);
    const r = Math.min(4, h);
    // extrémité arrondie (haut), base droite sur l'axe
    return <path d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z`} fill={color} />;
  };

  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-stone-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: A }} />{aLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: B }} />{bLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${aLabel} / ${bLabel}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={padL} x2={W} y1={y(step * i)} y2={y(step * i)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={padL - 6} y={y(step * i) + 3} textAnchor="end" fontSize={10} fill="#78716c">{step * i}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => d.href && router.push(d.href)} style={{ cursor: d.href ? "pointer" : undefined }}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill={hover === i ? "#f5f5f4" : d.active ? "#fafaf9" : "transparent"} />
              {bar(cx - bw - 1, d.a, A)}
              {bar(cx + 1, d.b, B)}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={d.active ? "#1c1917" : "#78716c"} fontWeight={d.active ? 700 : 400}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-6 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `min(calc(${((padL + (W - padL) / data.length * (hover + 0.5)) / W) * 100}% + 12px), calc(100% - 9rem))` }}
        >
          <div className="mb-1 font-semibold text-stone-900">{data[hover].label}</div>
          <div className="flex items-center gap-1.5 text-stone-700"><span className="h-2 w-2 rounded-sm" style={{ background: A }} />{aLabel} : <strong>{data[hover].a}</strong></div>
          <div className="flex items-center gap-1.5 text-stone-700"><span className="h-2 w-2 rounded-sm" style={{ background: B }} />{bLabel} : <strong>{data[hover].b}</strong></div>
          {hint && data[hover].href && <div className="mt-1 text-[11px] text-stone-500">{hint}</div>}
        </div>
      )}
    </div>
  );
}
