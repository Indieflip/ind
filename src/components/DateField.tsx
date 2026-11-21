"use client";
import { useI18n } from "@/lib/i18n/client";

/**
 * Modèle « date unique » : même calendrier partout, bouton « Aujourd'hui » en option.
 * Contrôlé (value / onChange) ou dans un formulaire (name / defaultValue).
 */
export function DateField({ value, onChange, name, defaultValue, today = false, disabled, required, className = "", id, ariaLabel, min, max }: {
  value?: string; onChange?: (v: string) => void; name?: string; defaultValue?: string; today?: boolean; disabled?: boolean; required?: boolean;
  className?: string; id?: string; ariaLabel?: string; min?: string; max?: string;
}) {
  const { t } = useI18n();
  const iso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const input = (
    <input
      type="date"
      id={id}
      name={name}
      aria-label={ariaLabel}
      className={`input ${className}`}
      {...(onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue })}
      disabled={disabled}
      required={required}
      min={min}
      max={max}
    />
  );
  if (!today || !onChange) return input;
  return (
    <div className="flex gap-1.5">
      {input}
      {!disabled && <button type="button" className="btn-secondary shrink-0 px-2 text-xs" onClick={() => onChange(iso())}>{t.sheet.today}</button>}
    </div>
  );
}
