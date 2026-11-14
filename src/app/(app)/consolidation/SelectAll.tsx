"use client";

export function SelectAll({ allLabel, noneLabel }: { allLabel: string; noneLabel: string }) {
  const setAll = (v: boolean) => document.querySelectorAll<HTMLInputElement>("input[data-bl]").forEach((i) => (i.checked = v));
  return (
    <div className="flex gap-2 text-xs">
      <button type="button" className="btn-ghost px-2 py-1" onClick={() => setAll(true)}>{allLabel}</button>
      <button type="button" className="btn-ghost px-2 py-1" onClick={() => setAll(false)}>{noneLabel}</button>
    </div>
  );
}
