"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { useVTNavigate } from "@/lib/navigate";

const OS_URL = "https://r2-os.vercel.app";

type Tab = { href: string; label: string; match: (p: string) => boolean };

// Four slots, not six — and labels only.
//
// The icons were emoji, which iOS renders as full-colour sprites that fight
// the app's metal/fire palette and go muddy under the grayscale filter they
// needed to look calm. The mono labels were already doing the work.
//
// MAKAN and LATIHAN are gone from here on purpose: they're the two full-width
// primary CTAs at the top of Beranda, so the nav was offering a second, worse
// route to the same places. Six items also meant six 8.5px labels competing
// for a phone's width, which made none of them read.
//
// What's left is what has nowhere else to live: home, the OS jump, friends,
// and stats. TIDUR is a card on Beranda; SET is the gear in its header.
const LEFT: Tab[] = [
  { href: "/", label: "BERANDA", match: (p) => p === "/" || p.startsWith("/sleep") || p.startsWith("/settings") || p.startsWith("/meal") || p.startsWith("/workout") },
];

const RIGHT: Tab[] = [
  { href: "/social",    label: "TEMAN", match: (p) => p.startsWith("/social") },
  { href: "/dashboard", label: "STATS", match: (p) => p.startsWith("/dashboard") },
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
          <span className="bn-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
