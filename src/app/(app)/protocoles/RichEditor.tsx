"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { mergeAttributes, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { useI18n } from "@/lib/i18n/client";

/** Encadré (info / attention / important), comme les « callouts » de Notion */
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { variant: { default: "info", parseHTML: (el) => el.getAttribute("data-variant") ?? "info", renderHTML: (a) => ({ "data-variant": a.variant }) } };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },
});

export const extensions = (placeholder = "") => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: false } }),
  Callout,
  Placeholder.configure({ placeholder }),
];

/** Mise en forme commune (lecture et édition) */
export const proseClass =
  "protocol-prose max-w-3xl text-stone-800 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-brand-700 [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mb-2 [&_ul]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-0.5 [&_li>p]:mb-0 [&_blockquote]:mb-3 [&_blockquote]:border-l-4 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_hr]:my-4 [&_hr]:border-stone-200 [&_a]:text-brand-700 [&_a]:underline [&_mark]:rounded [&_mark]:px-0.5 [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-stone-200 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-stone-200 [&_th]:bg-stone-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_td>p]:mb-0 [&_th>p]:mb-0 [&_ul[data-type=taskList]]:ml-0 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_input]:mt-1.5 [&_div[data-callout]]:mb-3 [&_div[data-callout]]:rounded-lg [&_div[data-callout]]:border-l-4 [&_div[data-callout]]:p-3 [&_div[data-callout][data-variant=info]]:border-sky-400 [&_div[data-callout][data-variant=info]]:bg-sky-50 [&_div[data-callout][data-variant=warning]]:border-amber-400 [&_div[data-callout][data-variant=warning]]:bg-amber-50 [&_div[data-callout][data-variant=danger]]:border-red-400 [&_div[data-callout][data-variant=danger]]:bg-red-50 [&_div[data-callout]>p:last-child]:mb-0 [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-stone-400 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ancien format texte (« ## » titre, « • » puce, « | » tableau, ligne finissant par « : ») → HTML */
export function legacyToHtml(content: string) {
  if (/^\s*</.test(content)) return content;
  const out: string[] = [];
  let bullets: string[] = [];
  let table: string[][] = [];
  const flush = () => { if (bullets.length) { out.push(`<ul>${bullets.map((b) => `<li><p>${esc(b)}</p></li>`).join("")}</ul>`); bullets = []; } };
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...body] = table;
    out.push(`<table><tbody><tr>${head.map((c) => `<th><p>${esc(c)}</p></th>`).join("")}</tr>${body.map((r) => `<tr>${r.map((c) => `<td><p>${esc(c).replace(/ \/\/ /g, "<br>")}</p></td>`).join("")}</tr>`).join("")}</tbody></table>`);
    table = [];
  };
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("|")) { flush(); table.push(line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); continue; }
    flushTable();
    const bullet = /^[•\-*]\s+(.*)$/.exec(line);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (!line) continue;
    const h = /^#{1,3}\s+(.*)$/.exec(line);
    if (h) out.push(`<h2>${esc(h[1])}</h2>`);
    else if (line.endsWith(":")) out.push(`<h3>${esc(line)}</h3>`);
    else out.push(`<p>${esc(line)}</p>`);
  }
  flush();
  flushTable();
  return out.join("");
}

/** Lecture d'un protocole (même rendu que l'éditeur) */
export function RichView({ html }: { html: string }) {
  const editor = useEditor({ extensions: extensions(), content: legacyToHtml(html), editable: false, immediatelyRender: false });
  useEffect(() => { if (editor && !editor.isDestroyed) editor.commands.setContent(legacyToHtml(html)); }, [editor, html]);
  return <EditorContent editor={editor} className={proseClass} />;
}

type Cmd = { key: string; label: string; hint: string; icon: string; run: (e: Editor) => void };

/** Éditeur de protocole : « / » pour insérer un bloc, barre d'outils, raccourcis (Ctrl+B, Ctrl+I…) */
export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const { t } = useI18n();
  const r = t.richEditor;
  const [slash, setSlash] = useState<{ from: number; query: string; top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<string | null>(null);

  const commands: Cmd[] = useMemo(() => [
    { key: "p", label: r.text, hint: r.textHint, icon: "¶", run: (e) => e.chain().focus().setParagraph().run() },
    { key: "h1", label: r.h1, hint: r.h1Hint, icon: "H1", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
    { key: "h2", label: r.h2, hint: r.h2Hint, icon: "H2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
    { key: "h3", label: r.h3, hint: r.h3Hint, icon: "H3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
    { key: "ul", label: r.bullets, hint: r.bulletsHint, icon: "•", run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "ol", label: r.numbers, hint: r.numbersHint, icon: "1.", run: (e) => e.chain().focus().toggleOrderedList().run() },
    { key: "todo", label: r.todo, hint: r.todoHint, icon: "☑", run: (e) => e.chain().focus().toggleTaskList().run() },
    { key: "info", label: r.calloutInfo, hint: r.calloutHint, icon: "ℹ", run: (e) => e.chain().focus().wrapIn("callout", { variant: "info" }).run() },
    { key: "warning", label: r.calloutWarning, hint: r.calloutHint, icon: "⚠", run: (e) => e.chain().focus().wrapIn("callout", { variant: "warning" }).run() },
    { key: "danger", label: r.calloutDanger, hint: r.calloutHint, icon: "⛔", run: (e) => e.chain().focus().wrapIn("callout", { variant: "danger" }).run() },
    { key: "quote", label: r.quote, hint: r.quoteHint, icon: "❝", run: (e) => e.chain().focus().toggleBlockquote().run() },
    { key: "table", label: r.table, hint: r.tableHint, icon: "▦", run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { key: "hr", label: r.divider, hint: r.dividerHint, icon: "—", run: (e) => e.chain().focus().setHorizontalRule().run() },
  ], [r]);

  const editor = useEditor({
    extensions: extensions(r.placeholder),
    content: legacyToHtml(value),
    immediatelyRender: false,
    // Barre « tableau » et état des boutons : se mettent à jour quand le curseur bouge (clic dans un tableau, sur un lien…)
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "min-h-[24rem] outline-none" } },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
      // Menu « / » : texte tapé depuis le « / » au début d'un bloc
      const { $from } = e.state.selection;
      const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
      const m = /^\/([\p{L}\d ]*)$/u.exec(text);
      if (m && wrap.current) {
        const c = e.view.coordsAtPos($from.pos);
        const box = wrap.current.getBoundingClientRect();
        setSlash({ from: $from.start(), query: m[1].toLowerCase(), top: c.bottom - box.top + 4, left: c.left - box.left });
        setActive(0);
      } else setSlash(null);
    },
  });

  const list = slash ? commands.filter((c) => !slash.query || c.label.toLowerCase().includes(slash.query) || c.key.startsWith(slash.query)) : [];
  const apply = (c: Cmd) => {
    if (!editor || !slash) return;
    editor.chain().focus().deleteRange({ from: slash.from, to: editor.state.selection.from }).run();
    c.run(editor);
    setSlash(null);
  };

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKey = (ev: KeyboardEvent) => {
      if (!slash || !list.length) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((a) => (a + 1) % list.length); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive((a) => (a - 1 + list.length) % list.length); }
      else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); apply(list[active]); }
      else if (ev.key === "Escape") setSlash(null);
    };
    dom.addEventListener("keydown", onKey, true);
    return () => dom.removeEventListener("keydown", onKey, true);
  });

  if (!editor) return <div className="min-h-[24rem] rounded-lg border border-stone-200 p-4 text-stone-400">…</div>;
  const b = (on: boolean) => `rounded px-2 py-1 text-sm ${on ? "bg-brand-100 text-brand-800" : "text-stone-700 hover:bg-stone-100"}`;
  const inTable = editor.isActive("table");
  // Barre du tableau posée juste sous le tableau où se trouve le curseur (espace réservé sous les tableaux pendant l'édition)
  let tablePos: { top: number; left: number } | null = null;
  if (inTable && wrap.current) {
    const at = editor.view.domAtPos(editor.state.selection.from).node;
    const el = (at instanceof HTMLElement ? at : at.parentElement)?.closest("table");
    if (el) {
      const t = el.getBoundingClientRect();
      const w = wrap.current.getBoundingClientRect();
      tablePos = { top: t.bottom - w.top + 6, left: Math.max(8, t.left - w.left) };
    }
  }
  return (
    <div ref={wrap} className="relative rounded-xl border border-stone-200 bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-stone-200 bg-white/95 p-1.5 backdrop-blur">
        <select
          className="rounded border border-stone-200 bg-white px-1.5 py-1 text-sm"
          value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
          onChange={(e) => commands.find((c) => c.key === e.target.value)?.run(editor)}
          aria-label={r.blockType}
        >
          <option value="p">{r.text}</option><option value="h1">{r.h1}</option><option value="h2">{r.h2}</option><option value="h3">{r.h3}</option>
        </select>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <button type="button" className={`${b(editor.isActive("bold"))} font-bold`} title={`${r.bold} (Ctrl+B)`} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className={`${b(editor.isActive("italic"))} italic`} title={`${r.italic} (Ctrl+I)`} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" className={`${b(editor.isActive("underline"))} underline`} title={`${r.underline} (Ctrl+U)`} onClick={() => editor.chain().focus().toggleUnderline().run()}>S</button>
        <button type="button" className={`${b(editor.isActive("strike"))} line-through`} title={r.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>ab</button>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        {[["#fde68a", r.hlYellow], ["#bbf7d0", r.hlGreen], ["#fecaca", r.hlRed], ["#bfdbfe", r.hlBlue]].map(([c, label]) => (
          <button key={c} type="button" title={`${r.highlight} ${label}`} className={b(editor.isActive("highlight", { color: c }))} onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}>
            <span className="inline-block h-3.5 w-3.5 rounded-sm align-middle" style={{ background: c }} />
          </button>
        ))}
        {[["#b91c1c", r.colorRed], ["#15803d", r.colorGreen], ["#1d4ed8", r.colorBlue]].map(([c, label]) => (
          <button key={c} type="button" title={`${r.color} ${label}`} className={b(editor.isActive("textStyle", { color: c }))} onClick={() => (editor.isActive("textStyle", { color: c }) ? editor.chain().focus().unsetColor().run() : editor.chain().focus().setColor(c).run())}>
            <span className="font-bold" style={{ color: c }}>A</span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <button type="button" className={b(editor.isActive("bulletList"))} title={r.bullets} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</button>
        <button type="button" className={b(editor.isActive("orderedList"))} title={r.numbers} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</button>
        <button type="button" className={b(editor.isActive("taskList"))} title={r.todo} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</button>
        <button type="button" className={b(editor.isActive("callout"))} title={r.calloutInfo} onClick={() => (editor.isActive("callout") ? editor.chain().focus().lift("callout").run() : editor.chain().focus().wrapIn("callout", { variant: "info" }).run())}>ℹ</button>
        <button type="button" className={b(false)} title={r.table} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</button>
        <button type="button" className={b(false)} title={r.divider} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</button>
        <button
          type="button"
          className={b(editor.isActive("link") || link !== null)}
          title={r.link}
          onClick={() => {
            if (link !== null) return setLink(null);
            const href = editor.getAttributes("link").href as string | undefined;
            if (href) { editor.chain().focus().extendMarkRange("link").run(); return setLink(href); }
            setLink("https://");
          }}
        >🔗</button>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <button type="button" className={b(false)} title={`${r.undo} (Ctrl+Z)`} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↶</button>
        <button type="button" className={b(false)} title={`${r.redo} (Ctrl+Y)`} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↷</button>
      </div>
      {link !== null && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-sky-50 px-2 py-1.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const url = link.trim();
            if (!url || url === "https://") return;
            const href = /^(https?:|mailto:|tel:|\/)/i.test(url) ? url : `https://${url}`;
            if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            setLink(null);
          }}
        >
          <span className="text-xs font-semibold text-sky-800">🔗 {r.link}</span>
          <input autoFocus className="input min-w-0 flex-1 py-1 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Escape" && setLink(null)} />
          <button type="submit" className="btn-primary px-2.5 py-1 text-xs">{r.linkApply}</button>
          {editor.isActive("link") && <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLink(null); }}>{r.linkRemove}</button>}
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setLink(null)}>✕</button>
          <span className="w-full text-[11px] text-sky-800/80">{r.linkHint}</span>
        </form>
      )}
      {inTable && tablePos && (
        <div className="absolute z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs shadow-lg" style={{ top: tablePos.top, left: tablePos.left }} onMouseDown={(e) => e.preventDefault()}>
          <span className="mr-1 font-semibold text-stone-600">▦ {r.table} :</span>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().addRowBefore().run()}>+ {r.row} {r.above}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>+ {r.row} {r.below}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().addColumnBefore().run()}>+ {r.column} {r.left}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ {r.column} {r.right}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().deleteRow().run()}>− {r.row}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => editor.chain().focus().deleteColumn().run()}>− {r.column}</button>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs text-red-600" onClick={() => editor.chain().focus().deleteTable().run()}>{r.deleteTable}</button>
        </div>
      )}
      <div className="p-4 sm:p-6">
        <EditorContent editor={editor} className={`${proseClass} [&_table]:!mb-14`} />
      </div>
      {slash && list.length > 0 && (
        <div className="absolute z-20 max-h-80 w-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg" style={{ top: slash.top, left: Math.max(8, Math.min(slash.left, (wrap.current?.clientWidth ?? 400) - 296)) }}>
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{r.blocks}</p>
          {list.map((c, i) => (
            <button key={c.key} type="button" onMouseDown={(e) => { e.preventDefault(); apply(c); }} onMouseEnter={() => setActive(i)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${i === active ? "bg-stone-100" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-200 bg-white text-sm font-semibold text-stone-600">{c.icon}</span>
              <span><span className="block text-sm font-medium">{c.label}</span><span className="block text-xs text-stone-500">{c.hint}</span></span>
            </button>
          ))}
        </div>
      )}
      <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">{r.tip}</p>
    </div>
  );
}
