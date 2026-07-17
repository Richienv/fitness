"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

// Scriptable widget source. __TOKEN__ / __BASE__ are filled in per user. Lines
// are plain strings so the inner `${...}` template literals stay literal.
const SCRIPT_LINES = [
  "// R2·FIT — today's calories (Scriptable widget)",
  '// Paste into a new script in the Scriptable app, then add a Scriptable',
  '// widget to your home screen and pick this script.',
  'const TOKEN = "__TOKEN__";',
  'const BASE = "__BASE__";',
  "",
  "let d = null;",
  "try {",
  "  d = await new Request(`${BASE}/api/widget/today?token=${TOKEN}`).loadJSON();",
  "} catch (e) {}",
  "",
  'const w = new ListWidget();',
  'w.backgroundColor = new Color("#0c0a0b");',
  "w.setPadding(14, 14, 14, 14);",
  "w.url = BASE;",
  "",
  "if (!d || !d.ok) {",
  '  const t = w.addText("R2·FIT"); t.font = Font.boldSystemFont(13); t.textColor = new Color("#ff8a5c");',
  '  const e = w.addText("Buka app / salin ulang token"); e.font = Font.systemFont(9); e.textColor = Color.gray();',
  "} else {",
  "  const x = d.data;",
  '  const title = w.addText("MAKAN — HARI INI"); title.font = Font.boldSystemFont(10); title.textColor = new Color("#7c736e");',
  "  w.addSpacer(6);",
  "  const kcal = w.addText(`${Math.round(x.totals.kcal)}`); kcal.font = Font.boldSystemFont(34); kcal.textColor = new Color(\"#ff8a5c\");",
  "  const sub = w.addText(`/ ${x.targets.kcal} kkal · ${Math.max(0, x.remaining.kcal)} sisa`); sub.font = Font.mediumSystemFont(10); sub.textColor = Color.gray();",
  "  w.addSpacer(8);",
  "  const rowFn = (label, val, color) => {",
  "    const s = w.addStack();",
  "    const l = s.addText(label); l.font = Font.mediumSystemFont(11); l.textColor = Color.gray();",
  "    s.addSpacer();",
  "    const v = s.addText(val); v.font = Font.boldSystemFont(11); v.textColor = color;",
  "  };",
  '  rowFn("Protein", `${Math.round(x.totals.protein)} g`, new Color("#5fe39a"));',
  '  rowFn("Karbo", `${Math.round(x.totals.carbs)} g`, new Color("#e8e2dc"));',
  '  rowFn("Lemak", `${Math.round(x.totals.fat)} g`, new Color("#e8e2dc"));',
  '  rowFn("Gula", `${Math.round(x.totals.sugar)} g`, new Color("#ffb39e"));',
  "  w.addSpacer(6);",
  "  const ts = w.addText(`upd ${new Date().toLocaleTimeString()}`); ts.font = Font.systemFont(8); ts.textColor = new Color(\"#5a534f\");",
  "}",
  "",
  "Script.setWidget(w);",
  "Script.complete();",
  "w.presentSmall();",
];

const STEPS = [
  "Pasang app gratis Scriptable dari App Store.",
  "Buka Scriptable, tap + untuk buat script baru.",
  "Hapus isinya, lalu tempel (paste) script di bawah.",
  "Simpan (namai mis. “R2FIT”), lalu keluar ke home screen.",
  "Tahan home screen → + → cari Scriptable → tambah widget kecil.",
  "Tahan widget itu → Edit Widget → Script: pilih R2FIT.",
];

export default function WidgetSetupPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauth" | "error">(
    "loading"
  );
  const [base, setBase] = useState("");
  const [copied, setCopied] = useState<"" | "script" | "url">("");

  const mint = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await fetch("/api/widget/token", { credentials: "same-origin" });
      if (r.status === 401) {
        setStatus("unauth");
        return;
      }
      const j = await r.json();
      if (!j?.ok || !j?.data?.token) {
        setStatus("error");
        return;
      }
      setToken(j.data.token as string);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") setBase(window.location.origin);
    mint();
  }, [mint]);

  const scriptText =
    token && base
      ? SCRIPT_LINES.join("\n").replace("__TOKEN__", token).replace("__BASE__", base)
      : "";
  const widgetUrl =
    token && base ? `${base}/api/widget/today?token=${token}` : "";

  const copy = useCallback(async (text: string, which: "script" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }, []);

  const card: CSSProperties = {
    borderRadius: 16,
    padding: 16,
    background: "#0c0a0b",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
  };

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100dvh",
        padding: "calc(14px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom))",
        background:
          "radial-gradient(720px 520px at 50% -10%, #17100f, #0a0809 55%, #070608)",
        color: "#f1ede9",
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <Link
          href="/settings"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".1em",
            color: "#7c736e",
            textDecoration: "none",
          }}
        >
          ← SETTINGS
        </Link>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 24,
            marginTop: 10,
            letterSpacing: "-.02em",
          }}
        >
          📱 iPhone Widget
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".08em",
            color: "#7c736e",
            marginTop: 5,
          }}
        >
          KALORI HARI INI · DI HOME SCREEN
        </div>
      </header>

      <p
        style={{
          fontFamily: SANS,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "#cfc8c2",
          marginBottom: 16,
        }}
      >
        iOS tidak bisa bikin widget langsung dari web app, tapi lewat app gratis{" "}
        <b>Scriptable</b> kamu bisa nampilin kalori &amp; makro hari ini di home
        screen. Token di bawah cuma buat akun kamu — jangan dibagikan.
      </p>

      {status === "unauth" ? (
        <div style={card}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>
            Kamu belum login
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#8a837d", marginTop: 6 }}>
            Login dulu untuk bikin token widget.
          </div>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 12,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
              textDecoration: "none",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
            }}
          >
            LOGIN →
          </Link>
        </div>
      ) : status === "error" ? (
        <div style={card}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>
            Gagal bikin token
          </div>
          <button
            type="button"
            onClick={mint}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 12,
              fontFamily: MONO,
              fontSize: 11,
              color: "#ff8a72",
              cursor: "pointer",
              background: "rgba(238,60,48,.08)",
              border: "1px solid rgba(238,60,48,.35)",
            }}
          >
            COBA LAGI
          </button>
        </div>
      ) : status === "loading" ? (
        <div style={{ ...card, fontFamily: MONO, fontSize: 11, color: "#8a837d" }}>
          Menyiapkan token…
        </div>
      ) : (
        <>
          {/* steps */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: ".14em",
                color: "#6a6660",
                marginBottom: 10,
              }}
            >
              // CARA PASANG
            </div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {STEPS.map((s, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "#d8d2cc",
                    marginBottom: 6,
                  }}
                >
                  {s}
                </li>
              ))}
            </ol>
          </div>

          {/* script */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: "#6a6660",
                }}
              >
                // SCRIPT SCRIPTABLE
              </div>
              <button
                type="button"
                onClick={() => copy(scriptText, "script")}
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 12,
                  padding: "8px 14px",
                  borderRadius: 10,
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                }}
              >
                {copied === "script" ? "✓ TERSALIN" : "SALIN SCRIPT"}
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 240,
                overflow: "auto",
                fontFamily: MONO,
                fontSize: 10,
                lineHeight: 1.45,
                color: "#b9b2ac",
                background: "#08070a",
                borderRadius: 10,
                padding: 12,
                whiteSpace: "pre",
              }}
            >
              {scriptText}
            </pre>
          </div>

          {/* raw url (for Shortcuts / debugging) */}
          <div style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: "#6a6660",
                }}
              >
                // URL DATA (buat Shortcut)
              </div>
              <button
                type="button"
                onClick={() => copy(widgetUrl, "url")}
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "7px 12px",
                  borderRadius: 9,
                  color: "#ff8a72",
                  cursor: "pointer",
                  background: "rgba(238,60,48,.08)",
                  border: "1px solid rgba(238,60,48,.3)",
                }}
              >
                {copied === "url" ? "✓" : "SALIN URL"}
              </button>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                lineHeight: 1.4,
                color: "#8a837d",
                wordBreak: "break-all",
              }}
            >
              {widgetUrl}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: "#6a6660",
                marginTop: 10,
              }}
            >
              Token berlaku ±180 hari. Rahasiakan — siapa pun dengan URL ini bisa
              lihat ringkasan kalorimu.
            </div>
          </div>
        </>
      )}
    </main>
  );
}
