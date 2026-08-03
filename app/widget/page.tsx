"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { TARGETS, todayKey } from "@/lib/targets";
import { getDaily } from "@/lib/store";
import { isNativeApp, syncWidget } from "@/lib/native";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

// Scriptable widget source. __TOKEN__ / __BASE__ are filled in per user. Lines
// are plain strings so the inner `${...}` template literals stay literal.
const SCRIPT_LINES = [
  "// R2·FIT — today's calories (Scriptable widget)",
  "// Paste into a new Scriptable script, then add a small Scriptable widget",
  "// to your home screen and pick this script. Tap it → jumps to add food.",
  "const TOKEN = '__TOKEN__';",
  "const BASE = '__BASE__';",
  "const Q = '__TGT__';",
  "",
  "let d = null;",
  "try { d = await new Request(`${BASE}/api/widget/today?token=${TOKEN}${Q}`).loadJSON(); } catch (e) {}",
  "",
  "const FIRE = new Color('#ff8a4c');",
  "const MUTE = new Color('#8a837d');",
  "const w = new ListWidget();",
  "// Tap the widget → open the app straight on the add-food screen.",
  "w.url = `${BASE}/meal?add=1`;",
  "const bg = new LinearGradient();",
  "bg.colors = [new Color('#1b1210'), new Color('#0a0809')];",
  "bg.locations = [0, 1];",
  "w.backgroundGradient = bg;",
  "w.setPadding(15, 15, 15, 15);",
  "// Hint iOS to refresh sooner (it still batches on its own schedule).",
  "w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);",
  "",
  "if (!d || !d.ok) {",
  "  const t = w.addText('R2·FIT'); t.font = Font.heavySystemFont(15); t.textColor = FIRE;",
  "  w.addSpacer(4);",
  "  const e = w.addText('Tap — buka app / salin ulang token'); e.font = Font.systemFont(9); e.textColor = MUTE;",
  "  Script.setWidget(w); Script.complete(); w.presentSmall(); return;",
  "}",
  "const x = d.data;",
  "const consumed = Math.round(x.totals.kcal);",
  "const target = x.targets.kcal || 2200;",
  "const left = Math.max(0, Math.round(x.remaining.kcal));",
  "const frac = Math.max(0, Math.min(1, consumed / target));",
  "",
  "// header row",
  "const head = w.addStack(); head.centerAlignContent();",
  "const brand = head.addText('🔥 MAKAN'); brand.font = Font.heavySystemFont(11); brand.textColor = FIRE;",
  "head.addSpacer();",
  "const day = head.addText('HARI INI'); day.font = Font.mediumSystemFont(8); day.textColor = MUTE;",
  "w.addSpacer(9);",
  "",
  "// big calories",
  "const kc = w.addStack(); kc.bottomAlignContent();",
  "const big = kc.addText(`${consumed}`); big.font = Font.boldSystemFont(38); big.textColor = new Color('#ffe9d6');",
  "kc.addSpacer(5);",
  "const unit = kc.addText(`/ ${target}`); unit.font = Font.mediumSystemFont(11); unit.textColor = MUTE;",
  "w.addSpacer(3);",
  "const rem = w.addText(`${left} kkal sisa`); rem.font = Font.semiboldSystemFont(10); rem.textColor = FIRE;",
  "w.addSpacer(10);",
  "",
  "// progress bar",
  "const TOT = 150;",
  "const track = w.addStack(); track.size = new Size(TOT, 7); track.cornerRadius = 3.5; track.backgroundColor = new Color('#ffffff', 0.10);",
  "const fill = track.addStack(); fill.size = new Size(Math.max(5, TOT * frac), 7); fill.cornerRadius = 3.5;",
  "const fg = new LinearGradient(); fg.colors = [new Color('#ff8a52'), new Color('#ee3c30')]; fg.locations = [0, 1]; fill.backgroundGradient = fg;",
  "w.addSpacer(11);",
  "",
  "// macro line",
  "const m = w.addStack(); m.spacing = 9;",
  "const macro = (val, unitTxt, color) => {",
  "  const s = m.addStack(); s.bottomAlignContent();",
  "  const v = s.addText(`${val}`); v.font = Font.boldSystemFont(11); v.textColor = color;",
  "  const u = s.addText(unitTxt); u.font = Font.mediumSystemFont(8); u.textColor = MUTE;",
  "};",
  "macro(Math.round(x.totals.protein), 'p', new Color('#5fe39a'));",
  "macro(Math.round(x.totals.carbs), 'c', new Color('#5ac8f5'));",
  "macro(Math.round(x.totals.fat), 'f', new Color('#eab308'));",
  "macro(Math.round(x.totals.sugar), 's', new Color('#ff8a72'));",
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
  // Resolved in an effect, not at render: `isNativeApp()` reads window, and
  // guessing on the server would flip the layout on hydration.
  const [native, setNative] = useState(false);
  const [synced, setSynced] = useState<"" | "syncing" | "ok" | "failed">("");

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

  const [tgt, setTgt] = useState<{ kt: number; pt: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setBase(window.location.origin);
    setNative(isNativeApp());
    mint();
    // Capture the user's personal daily target (today's gym/rest goal) so the
    // widget shows /1700 etc. instead of the server default.
    try {
      const t = getDaily(todayKey()).gymDay ? TARGETS.gymDay : TARGETS.restDay;
      setTgt({ kt: Math.round(t.kcal), pt: Math.round(t.protein) });
    } catch {
      /* fall back to server defaults */
    }
  }, [mint]);

  const tgtQuery = tgt ? `&kt=${tgt.kt}&pt=${tgt.pt}` : "";
  const scriptText =
    token && base
      ? SCRIPT_LINES.join("\n")
          .replace("__TOKEN__", token)
          .replace("__BASE__", base)
          .replace("__TGT__", tgtQuery)
      : "";
  const widgetUrl =
    token && base
      ? `${base}/api/widget/today?token=${token}${tgtQuery}`
      : "";

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
          iPhone Widget
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

      {native ? (
        // Inside the iOS shell the widget is built in — no Scriptable, no
        // copy-paste. The token is pushed to the shared App Group on every
        // launch; this card just makes that visible and offers a manual kick.
        <div style={{ ...card, marginBottom: 16 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: ".14em",
              color: "#6a6660",
              marginBottom: 10,
            }}
          >
            // WIDGET BAWAAN APP
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: "#cfc8c2" }}>
            Tahan home screen → <b>+</b> → cari <b>R2·FIT</b> → tambah widget
            kecil atau sedang. Datanya nyambung sendiri, nggak usah tempel token.
          </div>
          <button
            type="button"
            onClick={async () => {
              setSynced("syncing");
              setSynced((await syncWidget()) === "ok" ? "ok" : "failed");
            }}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 12,
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
              cursor: "pointer",
              background: FIRE,
              border: "1px solid rgba(255,150,120,.6)",
            }}
          >
            {synced === "syncing"
              ? "MENYAMBUNGKAN…"
              : synced === "ok"
                ? "✓ TERSAMBUNG"
                : synced === "failed"
                  ? "GAGAL — COBA LAGI"
                  : "SAMBUNGKAN ULANG"}
          </button>
        </div>
      ) : (
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
      )}

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
          {/* The Scriptable route only exists because the web app can't ship a
              widget. Inside the shell there IS a real widget, so showing both
              would just be two ways to do the same thing. The raw URL card
              below stays either way — it's still useful for Shortcuts. */}
          {native ? null : (
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
            </>
          )}

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
