"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";

const OS_URL = "https://r2-os.vercel.app";

type Tab = { href: string; label: string; icon: string; match: (p: string) => boolean };

const LEFT: Tab[] = [
  { href: "/",     label: "HOME",  icon: "🏠", match: (p) => p === "/" },
  { href: "/tlvl", label: "T-LVL", icon: "⚡", match: (p) => p.startsWith("/tlvl") },
];

const RIGHT: Tab[] = [
  { href: "/dashboard", label: "STATS", icon: "📊", match: (p) => p.startsWith("/dashboard") },
  { href: "/settings",  label: "SET",   icon: "⚙️", match: (p) => p.startsWith("/settings") },
];

// View Transitions API — Chrome/Safari support it natively. On unsupported
// browsers (older iOS, Firefox) we fall back to a plain push and no error.
type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => unknown;
};

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  function nav(href: string, e: React.MouseEvent) {
    e.preventDefault();
    haptic("tap");
    if (href === pathname) return;
    const doc = document as ViewTransitionDocument;
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => router.push(href));
    } else {
      router.push(href);
    }
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
