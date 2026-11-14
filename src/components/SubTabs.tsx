"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="no-print -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const on = tab.exact ? path === tab.href : path === tab.href || path.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${on ? "border-brand-600 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
