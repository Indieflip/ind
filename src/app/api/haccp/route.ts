import { getUser } from "@/lib/auth";
import { getRestaurantName } from "@/lib/settings";
import { buildHaccp, HACCP_FORMATS, registerFile, saveRegister, type HaccpFormat } from "@/lib/server/haccp";
import { periodLabel } from "@/lib/server/haccpPeriod";

/** Génère un registre HACCP (PDF, Excel ou CSV), l'enregistre dans l'historique et le télécharge */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const date = (k: string) => { const v = sp.get(k) ?? ""; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; };
  const from = date("from");
  const to = date("to");
  const format = (HACCP_FORMATS as string[]).includes(sp.get("format") ?? "") ? (sp.get("format") as HaccpFormat) : "pdf";
  const { data, receptionCount } = await buildHaccp(from, to, user.locale);
  const reg = await saveRegister({ from, to, format, data, receptionCount, userId: user.id });
  const file = await registerFile(data, { number: reg.id, restaurant: await getRestaurantName(), period: periodLabel(from, to, user.locale), createdAt: reg.createdAt, by: user.name, locale: user.locale }, format);
  return new Response(new Uint8Array(file.body), { headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" } });
}
