"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string; match: (p: string) => boolean };

const TABS: Tab[] = [
  { href: "/",          label: "HOME",   icon: "🏠", match: (p) => p === "/" },
  { href: "/meal",      label: "MEALS",  icon: "🍽️", match: (p) => p.startsWith("/meal") },
  { href: "/workout",   label: "GYM",    icon: "🏋️", match: (p) => p.startsWith("/workout") },
  { href: "/dashboard", label: "STATS",  icon: "📊", match: (p) => p.startsWith("/dashboard") },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`bn-item${active ? " active" : ""}`}
          >
            <span className="bn-icon">{t.icon}</span>
            <span className="bn-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
