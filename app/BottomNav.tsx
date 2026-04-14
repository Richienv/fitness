"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const OS_URL = "https://r2-os.vercel.app";

type Tab = { href: string; label: string; icon: string; match: (p: string) => boolean };

const LEFT: Tab[] = [
  { href: "/",     label: "HOME",  icon: "🏠", match: (p) => p === "/" },
  { href: "/meal", label: "MEALS", icon: "🍽️", match: (p) => p.startsWith("/meal") },
];

const RIGHT: Tab[] = [
  { href: "/workout",   label: "GYM",   icon: "🏋️", match: (p) => p.startsWith("/workout") },
  { href: "/dashboard", label: "STATS", icon: "📊", match: (p) => p.startsWith("/dashboard") },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {LEFT.map((t) => (
        <Link key={t.href} href={t.href} className={`bn-item${t.match(pathname) ? " active" : ""}`}>
          <span className="bn-icon">{t.icon}</span>
          <span className="bn-label">{t.label}</span>
        </Link>
      ))}

      <div className="bn-os-slot">
        <button
          className="bn-os-btn"
          onClick={() => (window.location.href = OS_URL)}
          aria-label="Open R2·OS"
        >
          OS
        </button>
      </div>

      {RIGHT.map((t) => (
        <Link key={t.href} href={t.href} className={`bn-item${t.match(pathname) ? " active" : ""}`}>
          <span className="bn-icon">{t.icon}</span>
          <span className="bn-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
