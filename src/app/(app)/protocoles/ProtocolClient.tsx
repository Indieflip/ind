"use client";
import { appConfirm } from "@/components/Confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProtocolAction, saveProtocolAction } from "@/lib/actions/protocols";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/Icon";
import { RichEditor, RichView } from "./RichEditor";

/** Affichage d'un protocole (même rendu que l'éditeur ; l'ancien format texte est converti) */
export function ProtocolView({ content }: { content: string }) {
  return <RichView html={content} />;
}

export function ProtocolEditor({ id, title, content }: { id: number | null; title: string; content: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [ti, setTi] = useState(title);
  const [co, setCo] = useState(content);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3 p-5">
      <label className="block"><span className="label">{t.protocols.name}</span><input className="input text-lg font-semibold" value={ti} onChange={(e) => setTi(e.target.value)} /></label>
      <div>
        <span className="label">{t.protocols.content}</span>
        <RichEditor value={co} onChange={setCo} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!ti.trim() || pending} onClick={() => start(async () => {
          const r = await saveProtocolAction(id, ti, co);
          if (r.id) router.push(`/protocoles?id=${r.id}`);
        })}>
          <Icon name="check" className="h-4 w-4" /> {t.common.save}
        </button>
        <button className="btn-ghost" onClick={() => router.push(id ? `/protocoles?id=${id}` : "/protocoles")}>{t.common.cancel}</button>
        {id && (
          <button className="btn-ghost ml-auto text-red-600" disabled={pending} onClick={async () => await appConfirm(t.protocols.deleteConfirm) && start(async () => { await deleteProtocolAction(id); router.push("/protocoles"); })}>
            <Icon name="trash" className="h-4 w-4" /> {t.common.delete}
          </button>
        )}
      </div>
    </div>
  );
}
