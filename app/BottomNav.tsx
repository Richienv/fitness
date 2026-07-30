"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { useVTNavigate } from "@/lib/navigate";

// ── Icons ───────────────────────────────────────────────────────────────────
//
// Inline SVG, stroked in currentColor — NOT emoji. Emoji were what the nav had
// originally and they were removed on purpose: iOS renders them as full-colour
// sprites that fight the fire palette and go muddy under a grayscale filter.
// A stroke path inherits the accent when active and the grey when it isn't,
// which is the whole reason to use icons here.
//
// 24px box, 1.75 stroke, round caps — one visual weight across all four.

type IconProps = { active: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg className="bn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 10.4 12 3.8l8.5 6.6V19a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 19z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        // The door fills in when you're home — a filled shape reads as "you are
        // here" faster than colour alone, and it's the one bit that changes.
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.16 : 0}
      />
      <path
        d="M9.6 20.6v-5.4a2.4 2.4 0 0 1 4.8 0v5.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FriendsIcon({ active }: IconProps) {
  return (
    <svg className="bn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="9.2"
        cy="8"
        r="3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.16 : 0}
      />
      <path
        d="M2.8 20.2c0-3.5 2.9-5.8 6.4-5.8s6.4 2.3 6.4 5.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M16.4 5.2a3.2 3.2 0 0 1 0 6M18 14.9c2.1.6 3.4 2.3 3.4 4.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatsIcon({ active }: IconProps) {
  // Three bars, ascending. The active state fills them rather than adding a
  // fourth shape, so the silhouette never changes size between states.
  return (
    <svg className="bn-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.4"
        y="13"
        width="4.4"
        height="7.6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.2 : 0}
      />
      <rect
        x="9.8"
        y="8.6"
        width="4.4"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.2 : 0}
      />
      <rect
        x="16.2"
        y="3.4"
        width="4.4"
        height="17.2"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.2 : 0}
      />
    </svg>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
//
// Three slots, icons only.
//
// MAKAN and LATIHAN are gone from here on purpose: they're the two full-width
// primary CTAs at the top of Beranda, so the nav was offering a second, worse
// route to the same places. TIDUR is a card on Beranda; SET is the gear in
// its header.
//
// The OS jump is gone too. It was the only thing in this bar that left the
// app, which made it the odd one out in every design it appeared in — a
// raised circle that couldn't be centred, then a white chip that had to
// out-shout three hollow strokes to justify its slot. Three tabs that all go
// somewhere IN the app is a bar with one job.
//
// Three columns also happen to put an icon dead centre, which four never could.

type Tab = { href: string; label: string; match: (p: string) => boolean; Icon: (p: IconProps) => React.ReactElement };

const TABS: Tab[] = [
  {
    href: "/",
    label: "Beranda",
    Icon: HomeIcon,
    match: (p) =>
      p === "/" ||
      p.startsWith("/sleep") ||
      p.startsWith("/settings") ||
      p.startsWith("/meal") ||
      p.startsWith("/workout"),
  },
  { href: "/social", label: "Teman", Icon: FriendsIcon, match: (p) => p.startsWith("/social") },
  { href: "/dashboard", label: "Statistik", Icon: StatsIcon, match: (p) => p.startsWith("/dashboard") },
];

export default function BottomNav() {
  const pathname = usePathname();
  const vtNavigate = useVTNavigate();

  // Which cell the blob sits under. -1 on a route no tab claims, which hides
  // it rather than parking it on a lie.
  const activeIndex = TABS.findIndex((t) => t.match(pathname));

  function nav(href: string, e: React.MouseEvent) {
    e.preventDefault();
    if (href === pathname) return;
    haptic("tap");
    vtNavigate(href);
  }

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary"
      style={{ viewTransitionName: "bottom-nav" } as React.CSSProperties}
    >
      {/* The travelling blob. One element for all three tabs, so it SLIDES
          between them instead of cross-fading — the movement is what tells you
          where you came from. `key` restarts the squash keyframe on every
          change; the wrapper keeps its transition so the slide isn't cut. */}
      {activeIndex >= 0 && (
        <span
          className="bn-blob"
          aria-hidden="true"
          style={{ "--bn-i": activeIndex } as React.CSSProperties}
        >
          <span key={activeIndex} className="bn-blob-skin" />
        </span>
      )}

      {TABS.map((t) => {
        const on = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={(e) => nav(t.href, e)}
            className={`bn-item${on ? " active" : ""}`}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
          >
            <span className="bn-ico-wrap">
              <t.Icon active={on} />
            </span>
          </Link>
        );
      })}

    </nav>
  );
}
