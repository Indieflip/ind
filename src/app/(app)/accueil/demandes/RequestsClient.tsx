"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { handleRequestAction, sendRequestAction } from "@/lib/actions/requests";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";

export function RequestForm({ url, subject }: { url: string; subject: string }) {
  const { t } = useI18n();
  const q = t.requests;
  const [state, action, pending] = useActionState(sendRequestAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card mb-6 max-w-3xl space-y-3 p-4">
      <h2 className="font-semibold">{q.new}</h2>
      <label className="block"><span className="label">{q.subject} *</span><input name="subject" className="input" required defaultValue={subject} placeholder={q.subjectPlaceholder} list="request-subjects" /></label>
      <datalist id="request-subjects">{q.examples.map((e) => <option key={e} value={e} />)}</datalist>
      <label className="block"><span className="label">{q.message}</span><textarea name="message" className="input" rows={3} placeholder={q.messagePlaceholder} /></label>
      <label className="block"><span className="label">{q.link}</span><input name="url" className="input" defaultValue={url} placeholder="/mercurial/fournisseurs/12" /></label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}><Icon name="check" className="h-4 w-4" /> {q.send}</button>
        {state?.ok && <span className="text-sm text-emerald-700">{q.sent}</span>}
      </div>
    </form>
  );
}

export interface RequestView { id: number; subject: string; message: string; url: string; status: string; response: string; author: string; createdAt: string; handled: string }

export function RequestRow({ row, admin }: { row: RequestView; admin: boolean }) {
  const { t } = useI18n();
  const q = t.requests;
  const router = useRouter();
  const [response, setResponse] = useState(row.response);
  const [pending, start] = useTransition();
  const badge = row.status === "done" ? "bg-emerald-100 text-emerald-800" : row.status === "refused" ? "bg-stone-200 text-stone-700" : "bg-amber-100 text-amber-900";
  const act = (status: "open" | "done" | "refused") => start(async () => { await handleRequestAction(row.id, status, response); router.refresh(); });
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{row.subject}</p>
          <p className="text-xs text-stone-500">{row.author} · {row.createdAt}</p>
        </div>
        <span className={`badge ${badge}`}>{q.statuses[row.status as keyof typeof q.statuses] ?? row.status}</span>
      </div>
      {row.message && <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{row.message}</p>}
      {row.url && <Link href={row.url} className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline">{q.open_link} →</Link>}
      {admin ? (
        <div className="mt-3 space-y-2">
          <textarea className="input text-sm" rows={2} placeholder={q.responsePlaceholder} value={response} onChange={(e) => setResponse(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {row.status !== "done" && <button className="btn-primary py-1.5" disabled={pending} onClick={() => act("done")}><Icon name="check" className="h-4 w-4" /> {q.markDone}</button>}
            {row.status !== "refused" && <button className="btn-secondary py-1.5" disabled={pending} onClick={() => act("refused")}>{q.markRefused}</button>}
            {row.status !== "open" && <button className="btn-ghost py-1.5" disabled={pending} onClick={() => act("open")}>{q.reopen}</button>}
          </div>
          {row.handled && <p className="text-xs text-stone-500">{q.handledOn} {row.handled}</p>}
        </div>
      ) : (
        row.response && <p className="mt-2 rounded-lg bg-stone-50 p-2 text-sm"><strong>{q.answer} :</strong> {row.response}</p>
      )}
    </li>
  );
}
