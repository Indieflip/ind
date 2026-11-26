"use client";
import { useI18n } from "@/lib/i18n/client";

const NEW = "__new__";

/** Liste déroulante des unités + « Autre unité… » pour en créer une nouvelle */
export function UnitSelect({
  value,
  units,
  onChange,
  name,
  className = "input",
  required,
}: {
  value: string;
  units: string[];
  onChange: (unit: string) => void;
  name?: string;
  className?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  // Liste de mots : toujours rangée de A à Z
  const list = [...new Set(value && !units.includes(value) ? [...units, value] : units)].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base", numeric: true }));
  return (
    <select
      name={name}
      className={className}
      value={value}
      required={required}
      onChange={(e) => {
        if (e.target.value === NEW) {
          const n = window.prompt(t.mercurial.newUnitPrompt)?.trim();
          if (n) onChange(n);
          return;
        }
        onChange(e.target.value);
      }}
    >
      {!value && <option value="" />}
      {list.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
      <option value={NEW}>+ {t.mercurial.newUnit}</option>
    </select>
  );
}
