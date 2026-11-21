import "server-only";

/**
 * Tâches de fond (resynchronisation, rattachements, exports) : lancées au plus une fois par période
 * et par serveur, au lieu de l'être à chaque ouverture de page (gain de temps entre les onglets).
 * Les enregistrements qui changent les données (réception, écart de pesée) les relancent directement.
 */
const last = new Map<string, number>();
const running = new Map<string, Promise<unknown>>();

export async function throttled<T>(key: string, everyMs: number, fn: () => Promise<T>): Promise<void> {
  const now = Date.now();
  if (running.has(key)) { await running.get(key); return; }
  if (now - (last.get(key) ?? 0) < everyMs) return;
  last.set(key, now);
  const p = fn().catch(() => { last.delete(key); }).finally(() => running.delete(key));
  running.set(key, p);
  await p;
}

/** À appeler après un enregistrement : la prochaine ouverture de page relancera la tâche */
export function invalidate(key: string) {
  last.delete(key);
}
