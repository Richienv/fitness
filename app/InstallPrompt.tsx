"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  detectPlatform,
  dismissInstallPrompt,
  installPromptDismissed,
} from "@/lib/install";

/**
 * A one-line nudge to install, shown once someone is actually using the app.
 *
 * Only for people who are signed in: a stranger who lands on /login has no
 * reason to want an icon yet, and the shareable /install page covers them.
 * Dismissal sticks for 30 days, in plain localStorage rather than the
 * user-scoped store — "I already installed this" is a fact about the device,
 * not the account.
 */
export default function InstallPrompt({ userId }: { userId: string | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const p = detectPlatform();
    // "ios-other" is excluded on purpose: telling someone in Chrome to go open
    // Safari is a real instruction, but it belongs on /install where there is
    // room to explain why, not in a one-line bar.
    if (p !== "ios-safari" && p !== "android") return;
    if (installPromptDismissed()) return;
    // A beat after load, so it doesn't compete with the page painting.
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [userId]);

  if (!show) return null;

  return (
    <div
      role="complementary"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Clear of the global bottom nav (~64px) and the home indicator.
        bottom: "calc(76px + env(safe-area-inset-bottom))",
        zIndex: 60,
        width: "calc(100% - 28px)",
        maxWidth: 452,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px 11px 14px",
        borderRadius: 14,
        background: "rgba(20,14,13,.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255,138,82,.28)",
        boxShadow: "0 12px 30px rgba(0,0,0,.55)",
        animation: "installNudgeIn .42s cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif",
            fontWeight: 800,
            fontSize: 13,
            color: "#f4ece6",
          }}
        >
          Pasang di home screen
        </div>
        <div
          style={{
            fontFamily: "var(--font-dm-mono), 'JetBrains Mono', monospace",
            fontSize: 9.5,
            letterSpacing: ".06em",
            color: "#9a938d",
            marginTop: 2,
          }}
        >
          TANPA BROWSER · LEBIH CEPET
        </div>
      </div>
      <Link
        href="/install"
        onClick={() => {
          dismissInstallPrompt();
          setShow(false);
        }}
        style={{
          flexShrink: 0,
          padding: "9px 14px",
          borderRadius: 10,
          fontFamily: "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: 12,
          color: "#fff",
          textDecoration: "none",
          background: "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)",
          border: "1px solid rgba(255,150,120,.6)",
        }}
      >
        CARANYA
      </Link>
      <button
        type="button"
        aria-label="Tutup"
        onClick={() => {
          dismissInstallPrompt();
          setShow(false);
        }}
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: 999,
          fontSize: 15,
          lineHeight: 1,
          color: "#8a837d",
          cursor: "pointer",
          background: "transparent",
          border: "none",
        }}
      >
        ×
      </button>
    </div>
  );
}
