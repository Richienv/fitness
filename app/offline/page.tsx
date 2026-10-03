// Precached by the service worker and served when a navigation fails.
//
// Deliberately NOT a client component. This page is the one page guaranteed to
// render when things are broken, so it must not depend on hydration: offline,
// the JS chunks it would need may not be in the cache at all. Everything here
// is inline-styled markup plus a plain <a> — no React on the client, no
// handlers that silently do nothing.

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div style={{ maxWidth: 320 }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 18px",
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 20,
            color: "var(--accent)",
            background: "#e5eddd",
            border: "1px solid var(--border)",
          }}
        >
          R2
        </div>
        <h1
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-.02em",
            margin: 0,
          }}
        >
          Nggak ada koneksi
        </h1>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--muted)",
            marginTop: 10,
          }}
        >
          R2·FIT butuh internet buat sinkronin data kamu. Cek Wi-Fi atau data
          seluler, terus coba lagi.
        </p>
        {/* A link, not a button: navigating re-enters the service worker's
            network-first path, and it works with zero JavaScript. */}
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "12px 22px",
            borderRadius: 12,
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 13,
            color: "#fff",
            textDecoration: "none",
            background: "var(--accent)",
            border: "1px solid var(--accent)",
          }}
        >
          Coba lagi
        </a>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".1em",
            color: "var(--muted)",
            marginTop: 16,
          }}
        >
          OFFLINE
        </div>
      </div>
    </main>
  );
}
