"use client";

// The link you send to a friend. Deliberately public — nobody has an account
// yet when they open it, so gating this behind /login would be a dead end.
//
// It shows one set of instructions, for the device in their hand. Showing all
// four platforms at once is how install pages usually fail: people read the
// wrong one and conclude it's broken.

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { detectPlatform, type Platform } from "@/lib/install";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-sans), sans-serif";
const FIRE = "var(--accent)";

const card: CSSProperties = {
  borderRadius: 16,
  padding: 16,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  boxShadow: "0 3px 12px rgba(40,53,43,.06)",
};

/** The iOS Share glyph, so "tap this button" points at something recognisable. */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
      style={{ verticalAlign: "-3px", margin: "0 2px" }}
    >
      <path
        d="M12 3.2 8.6 6.6M12 3.2l3.4 3.4M12 3.2v11"
        stroke="#4da3ff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M7 10.2H5.6A1.6 1.6 0 0 0 4 11.8v7.4a1.6 1.6 0 0 0 1.6 1.6h12.8a1.6 1.6 0 0 0 1.6-1.6v-7.4a1.6 1.6 0 0 0-1.6-1.6H17"
        stroke="#4da3ff"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((s, i) => (
        <li
          key={i}
          style={{
            fontFamily: SANS,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text)",
            marginBottom: 9,
          }}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}

export default function InstallPage() {
  // Resolved in an effect: the platform depends on window, and rendering a
  // guess on the server would flash the wrong instructions on hydration.
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setPlatform(detectPlatform());
    setOrigin(window.location.origin);

    // Chrome usually fires beforeinstallprompt before React hydrates, so the
    // event is normally already waiting for us — the layout stashes it. The
    // listener below only covers the case where it fires late.
    const stashed = (window as unknown as { __r2bip?: Event | null }).__r2bip;
    if (stashed) setDeferred(stashed);

    // Android/desktop Chrome hands us the install prompt to fire later.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setPlatform("installed");
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/install");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the URL bar still works */
    }
  }, []);

  const install = useCallback(async () => {
    const e = deferred as (Event & { prompt?: () => Promise<void> }) | null;
    if (!e?.prompt) return;
    await e.prompt();
    setDeferred(null);
  }, [deferred]);

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100dvh",
        padding:
          "calc(22px + env(safe-area-inset-top)) 20px calc(120px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: 23,
          color: "var(--text)",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          boxShadow: "0 3px 12px rgba(40,53,43,.06)",
        }}
      >
        R2
      </div>

      <h1
        style={{
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: 27,
          letterSpacing: "-.02em",
          margin: "18px 0 0",
        }}
      >
        Pasang R2·FIT
      </h1>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".12em",
          color: "var(--muted)",
          marginTop: 6,
        }}
      >
        Di layar utama · gratis
      </div>

      <p
        style={{
          fontFamily: SANS,
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--muted)",
          margin: "16px 0 20px",
        }}
      >
        Nggak perlu App Store, nggak perlu install apa-apa dulu. Habis dipasang,
        R2·FIT punya ikon sendiri dan kebuka full screen — persis kayak app
        biasa.
      </p>

      {platform === "unknown" ? (
        <div
          style={{
            ...card,
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          Ngecek device…
        </div>
      ) : platform === "installed" ? (
        <div style={card}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16 }}>
            ✓ Udah kepasang
          </div>
          <p
            style={{
              fontFamily: SANS,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "var(--muted)",
              margin: "8px 0 0",
            }}
          >
            Kamu lagi buka R2·FIT dari home screen. Nggak ada yang perlu
            dilakuin lagi.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "12px 20px",
              borderRadius: 12,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
              textDecoration: "none",
              background: FIRE,
              border: "1px solid var(--border)",
            }}
          >
            MULAI →
          </Link>
        </div>
      ) : platform === "ios-other" ? (
        <div style={card}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".14em",
              color: "var(--muted)",
              marginBottom: 10,
            }}
          >
            // BUKA DI SAFARI DULU
          </div>
          <p
            style={{
              fontFamily: SANS,
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text)",
              margin: 0,
            }}
          >
            Di iPhone, cuma <b>Safari</b> yang bisa pasang app ke home screen.
            Chrome bikin bookmark doang — tetep kebuka di browser.
          </p>
          <button
            type="button"
            onClick={copyLink}
            style={{
              marginTop: 14,
              padding: "12px 20px",
              borderRadius: 12,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
              cursor: "pointer",
              background: FIRE,
              border: "1px solid var(--border)",
            }}
          >
            {copied ? "✓ LINK TERSALIN" : "SALIN LINK"}
          </button>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 1.5,
              color: "var(--muted)",
              margin: "12px 0 0",
            }}
          >
            Buka Safari, tempel link-nya, terus balik ke halaman ini.
          </p>
        </div>
      ) : platform === "ios-safari" ? (
        <div style={card}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".14em",
              color: "var(--muted)",
              marginBottom: 12,
            }}
          >
            // IPHONE · 3 LANGKAH
          </div>
          <Steps
            items={[
              <>
                Tap tombol <b>Share</b> <ShareGlyph /> di bawah layar Safari
                (kotak dengan panah ke atas).
              </>,
              <>
                Scroll ke bawah, pilih <b>Add to Home Screen</b> /{" "}
                <b>Tambah ke Layar Utama</b>.
              </>,
              <>
                Tap <b>Add</b>. Ikon R2·FIT langsung nongol di home screen.
              </>,
            ]}
          />
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,138,82,.07)",
              border: "1px solid var(--border)",
              fontFamily: SANS,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "#e8c2ad",
            }}
          >
            Habis dipasang, kamu perlu <b>login sekali lagi</b> di dalam
            app-nya. iOS misahin data app home screen dari Safari — itu normal,
            bukan bug.
          </div>
        </div>
      ) : platform === "android" ? (
        <div style={card}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".14em",
              color: "var(--muted)",
              marginBottom: 12,
            }}
          >
            // ANDROID
          </div>
          {deferred ? (
            <>
              <p
                style={{
                  fontFamily: SANS,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  margin: 0,
                }}
              >
                Tinggal satu tap.
              </p>
              <button
                type="button"
                onClick={install}
                style={{
                  marginTop: 14,
                  padding: "13px 22px",
                  borderRadius: 12,
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid var(--border)",
                }}
              >
                PASANG SEKARANG
              </button>
            </>
          ) : (
            <Steps
              items={[
                <>
                  Tap menu <b>⋮</b> di pojok kanan atas Chrome.
                </>,
                <>
                  Pilih <b>Install app</b> atau <b>Add to Home screen</b>.
                </>,
                <>
                  Tap <b>Install</b>.
                </>,
              ]}
            />
          )}
        </div>
      ) : (
        <div style={card}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".14em",
              color: "var(--muted)",
              marginBottom: 12,
            }}
          >
            // DESKTOP
          </div>
          {deferred ? (
            <button
              type="button"
              onClick={install}
              style={{
                padding: "13px 22px",
                borderRadius: 12,
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 14,
                color: "#fff",
                cursor: "pointer",
                background: FIRE,
                border: "1px solid var(--border)",
              }}
            >
              PASANG SEKARANG
            </button>
          ) : (
            <p
              style={{
                fontFamily: SANS,
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Di Chrome/Edge, klik ikon <b>install</b> di ujung kanan address
              bar. R2·FIT ini paling enak dipakai di HP — buka link ini di
              iPhone atau Android kamu.
            </p>
          )}
        </div>
      )}

      {/* Widget — the free route, and the reason this page mentions a
          second app at all. WidgetKit needs a native build; Scriptable is
          how you get a real home-screen widget without one. */}
      <div style={{ ...card, marginTop: 12 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".14em",
            color: "var(--muted)",
            marginBottom: 10,
          }}
        >
          // WIDGET KALORI (OPSIONAL)
        </div>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "#cfc8c2",
            margin: 0,
          }}
        >
          Mau kalori hari ini kelihatan langsung di home screen tanpa buka app?
          Bisa, lewat app gratis <b>Scriptable</b>. Setelah login, buka{" "}
          <b>Settings → iPhone Widget</b>.
        </p>
      </div>

      {/* Share — this page exists to be forwarded. */}
      <button
        type="button"
        onClick={copyLink}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "13px 18px",
          borderRadius: 13,
          cursor: "pointer",
          background: "rgba(255,255,255,.04)",
          border: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            display: "block",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".1em",
            color: "#c8c1bb",
          }}
        >
          {copied ? "✓ TERSALIN" : "SALIN LINK BUAT TEMEN"}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 5,
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--muted)",
            wordBreak: "break-all",
          }}
        >
          {origin.replace(/^https?:\/\//, "")}/install
        </span>
      </button>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <Link
          href="/"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".1em",
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          LANGSUNG BUKA DI BROWSER →
        </Link>
      </div>
    </main>
  );
}
