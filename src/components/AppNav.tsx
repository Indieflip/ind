"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";
import { LocaleSwitch } from "./LocaleSwitch";
import { logoutAction } from "@/lib/actions/auth";

export interface NavItem { href: string; label: string; icon: string }

export function AppNav(props: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  logoutLabel: string;
  restaurant: string;
  appName: string;
  moreLabel: string;
}) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <>
      {/* Ordinateur : barre latérale */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold leading-snug">{props.appName}</div>
            <div className="text-xs leading-snug text-stone-500">{props.restaurant}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {props.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}
            >
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-4">
          <div className="text-sm font-semibold">{props.userName}</div>
          <div className="mb-3 text-xs text-stone-500">{props.roleLabel}</div>
          <div className="flex items-center justify-between">
            <LocaleSwitch />
            <form action={logoutAction}>
              <button className="btn-ghost px-2 py-1.5 text-xs" title={props.logoutLabel}>
                <Icon name="logout" className="h-4 w-4" /> {props.logoutLabel}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile : en-tête + barre d'onglets en bas */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold">{props.appName}</div>
            <div className="text-[11px] text-stone-500">{props.restaurant}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitch />
          <form action={logoutAction}>
            <button className="btn-ghost p-2" aria-label={props.logoutLabel}><Icon name="logout" className="h-4 w-4" /></button>
          </form>
        </div>
      </header>
      <MobileTabs items={props.items} active={active} moreLabel={props.moreLabel} />
    </>
  );
}

/** Barre d'onglets mobile : 4 onglets + « Plus » pour les autres */
function MobileTabs({ items, active, moreLabel }: { items: NavItem[]; active: (href: string) => boolean; moreLabel: string }) {
  const [open, setOpen] = useState(false);
  const main = items.length > 5 ? items.slice(0, 4) : items;
  const more = items.length > 5 ? items.slice(4) : [];
  const moreActive = more.some((i) => active(i.href));
  const tab = (on: boolean) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${on ? "text-brand-600" : "text-stone-500"}`;
  return (
    <>
      {open && (
        <div className="no-print fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3" style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            {more.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-3 font-medium ${active(i.href) ? "bg-brand-50 text-brand-700" : "text-stone-700"}`}>
                <Icon name={i.icon} /> {i.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-200 bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {main.map((i) => (
          <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={tab(active(i.href))}>
            <Icon name={i.icon} className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{i.label}</span>
          </Link>
        ))}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={tab(moreActive || open)}>
            <Icon name="menu" className="h-5 w-5" />
            <span>{moreLabel}</span>
          </button>
        )}
      </nav>
    </>
  );
}
