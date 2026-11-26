"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "./ui/Icon";
import { haptic } from "@/lib/haptics";

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

// Four direct routes: home, food, workouts, and progress.

type Tab = {
  href: string;
  label: string;
  match: (p: string) => boolean;
  Icon: (p: IconProps) => React.ReactElement;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Beranda",
    Icon: HomeIcon,
    match: (p) =>
      p === "/" ||
      p.startsWith("/sleep") ||
      (p.startsWith("/settings") && !p.startsWith("/settings/health")) ||
      p.startsWith("/social"),
  },
  {
    href: "/meal",
    label: "Makan",
    Icon: () => <Icon name="meal" size={23} />,
    match: (p) => p.startsWith("/meal"),
  },
  {
    href: "/workout",
    label: "Latihan",
    Icon: () => <Icon name="workout" size={23} />,
    // Apple Health setup is opened from Latihan's "Hari ini" card.
    match: (p) => p.startsWith("/workout") || p.startsWith("/settings/health"),
  },
  {
    href: "/companion",
    label: "Progres",
    Icon: StatsIcon,
    match: (p) => p.startsWith("/dashboard") || p.startsWith("/companion"),
  },
];

const EXTRA_PREFETCH_ROUTES = [
  "/settings",
  "/dashboard/progress",
  "/dashboard",
  "/settings/health",
  "/settings/advanced",
];

/** How long a prefetched tab stays warm before it is fetched again. Next keeps
 *  a prefetch for 5 minutes; refreshing a little sooner means a tap never lands
 *  on an expired one and has to wait for the server. */
const WARM_EVERY_MS = 4 * 60 * 1000;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // The tab you just tapped, shown as selected at once. The URL only changes
  // when the next screen is ready, and waiting for that made a tap feel dead.
  const [pending, setPending] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"syncing" | "synced" | "offline">("synced");
  const [outboxPending, setOutboxPending] = useState(0);

  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (
        e as CustomEvent<{ state?: "syncing" | "synced" | "offline"; pendingCount?: number }>
      ).detail;
      if (detail?.state) setSyncState(detail.state);
      if (typeof detail?.pendingCount === "number") setOutboxPending(detail.pendingCount);
    };
    const onOutbox = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") setOutboxPending(detail.count);
    };
    window.addEventListener("r2:sync-status", onStatus);
    window.addEventListener("r2:outbox-change", onOutbox);
    return () => {
      window.removeEventListener("r2:sync-status", onStatus);
      window.removeEventListener("r2:outbox-change", onOutbox);
    };
  }, []);

  // Every page here is dynamic (the layout reads the session), so without a
  // prefetch each tab switch waits for the server: ~1 s on a slow connection.
  // Fetch all four tabs PLUS settings/progress routes once, and again when the
  // app returns to the front, so tapping Settings or any tab opens instantly.
  useEffect(() => {
    if (["/login", "/register", "/welcome", "/onboarding"].includes(pathname)) return;
    const warm = () => {
      for (const t of TABS) router.prefetch(t.href);
      for (const href of EXTRA_PREFETCH_ROUTES) router.prefetch(href);
    };
    warm();
    const onVisible = () => {
      if (document.visibilityState === "visible") warm();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(warm, WARM_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [router, pathname]);

  // The screen changed (or the tap went nowhere): stop pretending.
  useEffect(() => {
    setPending(null);
  }, [pathname]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 4000);
    return () => clearTimeout(t);
  }, [pending]);

  function nav(href: string, e: React.MouseEvent) {
    // Let the browser handle new-tab / download clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (href === pathname) return;
    haptic("tap");
    setPending(href);
    router.push(href);
  }

  if (["/login", "/register", "/welcome", "/onboarding"].includes(pathname)) return null;
  // While logging sets, the screen belongs to the set dock at the bottom.
  if (/^\/workout\/session\/[^/]+$/.test(pathname)) return null;

  const syncLabel =
    syncState === "syncing"
      ? "Menyinkronkan…"
      : outboxPending > 0
        ? `Tersimpan lokal (${outboxPending})`
        : syncState === "offline"
          ? "Offline · cache aktif"
          : "Tersinkron · Laptop ↔ HP";

  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      <div className="bn-desktop-brand">
        <Link href="/" className="friendly-brand">
          r2<span>fit</span>
        </Link>
        <small>Laptop ↔ iPhone Sync</small>
      </div>
      <div className="bn-nav-list">
        {TABS.map((t) => {
          const on = pending ? t.href === pending : t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              onClick={(e) => nav(t.href, e)}
              className={`bn-item${on ? " active" : ""}`}
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
            >
              <span className="bn-ico-wrap">
                <t.Icon active={on} />
              </span>
              <span className="bn-label">{t.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="bn-desktop-footer">
        <button
          type="button"
          className={`bn-sync-pill is-${syncState}`}
          disabled={syncState === "syncing"}
          onClick={() => window.dispatchEvent(new Event("r2:force-sync"))}
          title="Klik untuk sinkronkan sekarang"
        >
          <span className="bn-sync-dot" aria-hidden="true" />
          <span>{syncLabel}</span>
        </button>
        <Link
          href="/settings"
          className={`bn-desktop-settings${pathname.startsWith("/settings") && !pathname.startsWith("/settings/health") ? " active" : ""}`}
        >
          <Icon name="settings" size={16} />
          <span>Pengaturan</span>
        </Link>
      </div>
    </nav>
  );
}
