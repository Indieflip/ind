/** Menu à flèche de l'onglet Dev : titre ; le contenu se déroule au clic */
export function DevFold({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group card overflow-hidden" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-stone-50">
        <span className="text-stone-400 transition group-open:rotate-90">▸</span>
        <span className="flex-1 font-semibold">{title}</span>
      </summary>
      <div className="border-t border-stone-200 bg-stone-50/60 p-4">{children}</div>
    </details>
  );
}
