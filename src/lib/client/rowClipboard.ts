"use client";
import { useEffect, useState } from "react";

/**
 * Presse-papiers de lignes : une ligne copiée dans un tableau (menu ⋮) peut être collée dans un autre.
 * Les champs ont des noms communs ; chaque tableau reprend ceux qu'il connaît.
 */
export type RowField =
  | "date" | "nature" | "supplier" | "supplierId" | "reference" | "product" | "unit"
  | "qtyInvoiced" | "qtyWeighed" | "unitPrice" | "amount" | "description" | "action" | "result"
  | "detail" | "container" | "tare" | "receptionId" | "anomalyId" | "weighGapId";
export type RowFields = Partial<Record<RowField, string>>;
export interface CopiedRow { source: string; fields: RowFields; at: number }

const KEY = "rm_row_clipboard";
const EVENT = "rm-row-clipboard";

export function copyRow(source: string, fields: RowFields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => [k, String(v)]));
  try {
    localStorage.setItem(KEY, JSON.stringify({ source, fields: clean, at: Date.now() }));
  } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENT));
}

export function readRow(): CopiedRow | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CopiedRow) : null;
  } catch {
    return null;
  }
}

export function clearRow() {
  try { localStorage.removeItem(KEY); } catch { /* */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useCopiedRow() {
  const [row, setRow] = useState<CopiedRow | null>(null);
  useEffect(() => {
    const update = () => setRow(readRow());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return row;
}
