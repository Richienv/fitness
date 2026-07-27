"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { useVTNavigate } from "@/lib/navigate";

const OS_URL = "https://r2-os.vercel.app";

type Tab = { href: string; label: string; icon: string; match: (p: string) => boolean };

// The daily loop (eat / train / stats) lives in the nav; TIDUR is a card on
// Beranda and SET is the gear icon in the Beranda header.
const LEFT: Tab[] = [
  { href: "/",     label: "BERANDA", icon: "🏠", match: (p) => p === "/" || p.startsWith("/sleep") || p.startsWith("/settings") },
  { href: "/meal", label: "MAKAN",   icon: "🍽️", match: (p) => p.startsWith("/meal") },
];

const RIGHT: Tab[] = [
  { href: "/workout",   label: "LATIHAN", icon: "🏋️", match: (p) => p.startsWith("/workout") },
  // TEMAN was only reachable from a grey row at the very bottom of Beranda —
  // below the fold and styled like a footnote, so it was effectively hidden.
  { href: "/social",    label: "TEMAN",   icon: "👥", match: (p) => p.startsWith("/social") },
  { href: "/dashboard", label: "STATS",   icon: "📊", match: (p) => p.startsWith("/dashboard") },
];

export default function BottomNav() {
  const pathname = usePathname();
  const vtNavigate = useVTNavigate();

  function nav(href: string, e: React.MouseEvent) {
    e.preventDefault();
    if (href === pathname) return;
    vtNavigate(href);
  }

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary"
      style={{ viewTransitionName: "bottom-nav" } as React.CSSProperties}
    >
      {LEFT.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={(e) => nav(t.href, e)}
          className={`bn-item${t.match(pathname) ? " active" : ""}`}
        >
          <span className="bn-icon">{t.icon}</span>
          <span className="bn-label">{t.label}</span>
        </Link>
      ))}

      <div className="bn-os-slot">
        <button
          className="bn-os-btn"
          onClick={() => {
            haptic("tap");
            window.location.href = OS_URL;
          }}
          aria-label="Open R2·OS"
        >
          OS
        </button>
      </div>

      {RIGHT.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={(e) => nav(t.href, e)}
          className={`bn-item${t.match(pathname) ? " active" : ""}`}
        >
          <span className="bn-icon">{t.icon}</span>
          <span className="bn-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
