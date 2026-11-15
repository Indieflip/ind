import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { one, type SP } from "@/lib/server/queries";
import { PageHeader } from "@/components/ui";
import { RequestForm, RequestRow } from "./RequestsClient";

/** Demandes à l'administrateur : chacun envoie et suit les siennes, l'administrateur les traite toutes */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const r = schema.adminRequests;
  const author = alias(schema.users, "author");
  const handler = alias(schema.users, "handler");
  const admin = user.role === "admin";
  const rows = await getDb()
    .select({ r, author: author.name, handler: handler.name })
    .from(r)
    .leftJoin(author, eq(author.id, r.createdBy))
    .leftJoin(handler, eq(handler.id, r.handledBy))
    .where(admin ? undefined : eq(r.createdBy, user.id))
    .orderBy(desc(r.createdAt))
    .limit(300);
  const open = rows.filter((x) => x.r.status === "open");
  const done = rows.filter((x) => x.r.status !== "open");
  const toRow = (x: (typeof rows)[number]) => ({
    id: x.r.id, subject: x.r.subject, message: x.r.message ?? "", url: x.r.url ?? "", status: x.r.status, response: x.r.response ?? "",
    author: x.author ?? "—", createdAt: fmtDateTime(x.r.createdAt, locale), handled: x.r.handledAt ? `${fmtDateTime(x.r.handledAt, locale)}${x.handler ? ` · ${x.handler}` : ""}` : "",
  });
  const q = t.requests;
  return (
    <>
      <PageHeader title={q.title} />
      <p className="mb-4 max-w-3xl text-sm text-stone-600">{admin ? q.introAdmin : q.intro}</p>
      {!admin && <RequestForm url={one(sp.url) ?? ""} subject={one(sp.subject) ?? ""} />}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">{q.open} ({open.length})</h2>
        {open.length === 0 ? <p className="card p-4 text-sm text-stone-500">{q.none}</p> : <ul className="space-y-2">{open.map((x) => <RequestRow key={x.r.id} row={toRow(x)} admin={admin} />)}</ul>}
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">{q.handled} ({done.length})</h2>
        {done.length === 0 ? <p className="card p-4 text-sm text-stone-500">{q.none}</p> : <ul className="space-y-2">{done.map((x) => <RequestRow key={x.r.id} row={toRow(x)} admin={admin} />)}</ul>}
      </section>
    </>
  );
}
