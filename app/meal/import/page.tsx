"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { CUISINES } from "@/lib/cuisine";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const EXAMPLE = `[
  {
    "name": "Rendang Sapi",
    "servingGrams": 100,
    "kcal": 195,
    "protein": 14,
    "fat": 12,
    "carbs": 8,
    "cuisine": "padang",
    "nameEn": "Beef Rendang"
  },
  {
    "name": "Chicken Katsu",
    "servingGrams": 200,
    "kcal": 420,
    "protein": 30,
    "fat": 22,
    "carbs": 25,
    "cuisine": "japanese"
  }
]`;

type Result = { imported: number; failed: number; errors: { index: number; name: string; reason: string }[] };

export default function MealImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live-parse for a count + validity hint before importing.
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return { ok: false as const, count: 0, msg: "" };
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : j?.foods;
      if (!Array.isArray(arr)) return { ok: false as const, count: 0, msg: "Harus array atau { foods: [...] }" };
      return { ok: true as const, count: arr.length, msg: "" };
    } catch (e) {
      return { ok: false as const, count: 0, msg: "JSON belum valid: " + (e as Error).message };
    }
  }, [text]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    setResult(null);
    setError(null);
  }

  async function doImport() {
    if (!parsed.ok || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const j = JSON.parse(text);
      const foods = Array.isArray(j) ? j : j.foods;
      const res = await fetch("/api/foods/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foods }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message || data?.error || `Gagal (HTTP ${res.status})`);
      } else {
        setResult(data.data as Result);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        minHeight: "100dvh",
        fontFamily: SANS,
        background: "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
        padding: "calc(20px + env(safe-area-inset-top)) 18px calc(30px + env(safe-area-inset-bottom))",
      }}
    >
      <Link href="/meal" className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#8a837d", textDecoration: "none" }}>
        ← MAKAN
      </Link>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1ede9", marginTop: 12 }}>
        IMPOR <span style={FIRE_TEXT}>MAKANAN</span>
      </h1>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "#cfc8c2", marginTop: 8 }}>
        Tempel JSON (atau pilih file <span className="mono">.json</span>) berisi daftar makanan. Angka gizi
        <b> per porsi</b>, dengan <span className="mono">servingGrams</span> berat porsinya. Makanan masuk ke
        library bersama — langsung bisa dicari &amp; dikelompokkan semua orang.
      </p>

      <input
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="mono"
        style={{ marginTop: 14, fontSize: 12, color: "#cfc8c2" }}
      />

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
          setError(null);
        }}
        placeholder="Tempel JSON di sini…"
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 220,
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          background: "#0c0a0b",
          border: "1px solid rgba(255,255,255,.12)",
          color: "#f1ede9",
          fontFamily: MONO,
          fontSize: 12.5,
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, minHeight: 20 }}>
        {parsed.ok ? (
          <span className="mono" style={{ fontSize: 11, color: "#5fe39a" }}>
            ✓ {parsed.count} makanan siap diimpor
          </span>
        ) : parsed.msg ? (
          <span className="mono" style={{ fontSize: 11, color: "#ff9a80" }}>{parsed.msg}</span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={doImport}
        disabled={!parsed.ok || busy}
        style={{
          width: "100%",
          marginTop: 8,
          padding: 16,
          borderRadius: 16,
          border: "1px solid rgba(255,150,120,.6)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: "1px",
          background: FIRE,
          cursor: parsed.ok && !busy ? "pointer" : "default",
          opacity: parsed.ok && !busy ? 1 : 0.5,
          textShadow: "0 1px 2px rgba(120,15,5,.5)",
        }}
      >
        {busy ? "MENGIMPOR…" : parsed.ok ? `IMPOR ${parsed.count} MAKANAN` : "IMPOR"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            background: "rgba(238,60,48,.1)",
            border: "1px solid rgba(238,60,48,.4)",
            color: "#ff9a80",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 14,
            background: "linear-gradient(180deg,rgba(34,197,94,.12),transparent)",
            border: "1px solid rgba(34,197,94,.35)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1ede9" }}>
            ✓ {result.imported} makanan masuk
          </div>
          {result.failed > 0 && (
            <div className="mono" style={{ fontSize: 11, color: "#ff9a80", marginTop: 6 }}>
              {result.failed} gagal
            </div>
          )}
          {result.errors?.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#b79a8c", fontSize: 11.5, lineHeight: 1.5 }}>
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="mono">#{e.index}</span> {e.name}: {e.reason}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/meal"
            className="mono"
            style={{
              display: "inline-block",
              marginTop: 12,
              fontSize: 11,
              letterSpacing: ".1em",
              color: "#22c55e",
              textDecoration: "underline",
            }}
          >
            SELESAI → CATAT MAKAN
          </Link>
        </div>
      )}

      {/* Schema help */}
      <div style={{ marginTop: 26 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "#7c736e", marginBottom: 8 }}>
          FORMAT · CONTOH
        </div>
        <pre
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 14,
            background: "#0c0a0b",
            border: "1px solid rgba(255,255,255,.1)",
            color: "#cfc8c2",
            fontFamily: MONO,
            fontSize: 11.5,
            lineHeight: 1.5,
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {EXAMPLE}
        </pre>
        <button
          type="button"
          onClick={() => {
            setText(EXAMPLE);
            setResult(null);
            setError(null);
          }}
          className="mono"
          style={{
            marginTop: 10,
            fontSize: 10,
            letterSpacing: ".08em",
            color: "#ff8a72",
            background: "rgba(238,60,48,.08)",
            border: "1px solid rgba(238,60,48,.3)",
            borderRadius: 999,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          PAKAI CONTOH INI
        </button>

        <div style={{ marginTop: 18, fontSize: 12.5, lineHeight: 1.6, color: "#9a938d" }}>
          <div>
            <b style={{ color: "#cfc8c2" }}>Wajib:</b> <span className="mono">name</span>,{" "}
            <span className="mono">servingGrams</span>, <span className="mono">kcal</span>.
          </div>
          <div style={{ marginTop: 4 }}>
            <b style={{ color: "#cfc8c2" }}>Opsional:</b> <span className="mono">protein</span>,{" "}
            <span className="mono">fat</span>, <span className="mono">carbs</span>,{" "}
            <span className="mono">nameEn</span>, <span className="mono">cuisine</span>.
          </div>
          <div style={{ marginTop: 8 }}>
            <b style={{ color: "#cfc8c2" }}>cuisine</b> (buat pengelompokan) —{" "}
            {CUISINES.map((c) => c.key).join(", ")}. Kosongin aja kalau ga yakin; nanti ditebak dari nama.
          </div>
          <div style={{ marginTop: 8, color: "#7c736e" }}>
            Nama yang sama akan diperbarui (bukan dobel). Maks 2000 per impor.
          </div>
        </div>
      </div>
    </main>
  );
}
