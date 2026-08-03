// Precached by the service worker and served when a navigation fails. It has
// to be self-contained: no data fetch, no client state, nothing that assumes a
// network. The retry is a plain reload, which the SW will pass through to the
// network first.
"use client";

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
        background:
          "radial-gradient(720px 520px at 50% -10%, #17100f, #0a0809 55%, #070608)",
        color: "#f1ede9",
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
            color: "#faf1ea",
            background: "linear-gradient(180deg,#241614,#0d0a0b)",
            border: "1px solid rgba(255,255,255,.08)",
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
            color: "#a9a29c",
            marginTop: 10,
          }}
        >
          R2·FIT butuh internet buat sinkronin data kamu. Cek Wi-Fi atau data
          seluler, terus coba lagi.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 20,
            padding: "12px 22px",
            borderRadius: 12,
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 13,
            color: "#fff",
            cursor: "pointer",
            background: "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)",
            border: "1px solid rgba(255,150,120,.6)",
          }}
        >
          COBA LAGI
        </button>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".1em",
            color: "#6a6660",
            marginTop: 16,
          }}
        >
          OFFLINE
        </div>
      </div>
    </main>
  );
}
