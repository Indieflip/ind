"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

/** Retour : revient à la page d'où l'on vient (ex. la liste des anomalies avec ses filtres), sinon à l'adresse donnée */
export function BackLink({ href, label, className = "btn-ghost -ml-2 px-2" }: { href: string; label: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        const fromApp = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
        if (fromApp && window.history.length > 1) { e.preventDefault(); router.back(); }
      }}
    >
      <Icon name="chevronLeft" className="h-4 w-4" /> {label}
    </Link>
  );
}
