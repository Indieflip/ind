"use client";
import { useI18n } from "@/lib/i18n/client";
import { DataTable, type Col } from "@/components/table/DataTable";

type Row = { id: number; area: string; trigger: string; action: string; where: string };

/** Dev > Automatisations : vue d'ensemble des étapes automatisées (tenue à jour à chaque évolution de l'application) */
export function DevAutomations() {
  const { t } = useI18n();
  const c = t.devFields;
  const rows: Row[] = c.automations.map((a, i) => ({ id: i, ...a }));
  const cols: Col<Row>[] = [
    { key: "area", label: c.colArea, text: (r) => r.area, keepCase: true, width: "14%", className: "font-medium" },
    { key: "trigger", label: c.colTrigger, text: (r) => r.trigger, keepCase: true, width: "22%" },
    { key: "action", label: c.colAction, text: (r) => r.action, keepCase: true, width: "44%", className: "text-stone-700" },
    { key: "where", label: c.colWhere, text: (r) => r.where, keepCase: true, width: "20%", className: "text-stone-600" },
  ];
  return (
    <section>
      <h2 className="font-semibold">{c.automationsTitle}</h2>
      <p className="mb-3 text-xs font-medium text-brand-700">{c.autoUpdated}</p>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} dense fixed />
    </section>
  );
}
