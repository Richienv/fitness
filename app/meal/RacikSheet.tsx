"use client";

// The RACIK composer, as a sheet you can actually work in.
//
// What this replaces: a single card that said "Nasi + Ayam goreng + Sambal ·
// 495 kkal · tap untuk tambah semua". One tap, all-or-nothing, no macros, no
// portions. If the parse got one part wrong — and it sometimes does — your only
// options were to accept it or abandon the whole plate. And 495 kkal alone
// tells a person tracking protein nothing at all.
//
// What this is instead: every part on its own row, each with its own grams and
// its own protein/carbs/fat, each removable, with the plate total updating
// under your thumb as you drag. You see what you are about to log before you
// log it.

import { useEffect, useMemo, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useSheetBack } from "@/lib/backSheet";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

const P_COLOR = "#5fe39a";
const C_COLOR = "#5ac8f5";
const F_COLOR = "#eab308";

export type RacikPart = {
  id: string;
  name: string;
  /** Grams this part contributes by default. */
  grams: number;
  /** Per-100g macros, so any gram amount can be costed. */
  per100: { kcal: number; protein: number; carbs: number; fat: number };
};

type Row = RacikPart & { grams: number; on: boolean };

/** Round to something a person would say out loud. */
function niceGrams(g: number): number {
  if (g >= 200) return Math.round(g / 10) * 10;
  if (g >= 50) return Math.round(g / 5) * 5;
  return Math.round(g);
}

export default function RacikSheet({
  query,
  parts,
  mealLabel,
  onCancel,
  onConfirm,
}: {
  query: string;
  parts: RacikPart[];
  mealLabel: string;
  onCancel: () => void;
  /** Only the parts still switched on, with their chosen grams. */
  onConfirm: (chosen: { id: string; grams: number }[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    parts.map((p) => ({ ...p, grams: niceGrams(p.grams), on: true }))
  );

  // Re-seed if the parse changes underneath us (the user edited the query).
  useEffect(() => {
    setRows(parts.map((p) => ({ ...p, grams: niceGrams(p.grams), on: true })));
  }, [parts]);

  // Hardware/browser back closes the sheet instead of leaving the page.
  useSheetBack(true, onCancel);

  const total = useMemo(() => {
    let kcal = 0,
      protein = 0,
      carbs = 0,
      fat = 0;
    for (const r of rows) {
      if (!r.on) continue;
      const k = r.grams / 100;
      kcal += r.per100.kcal * k;
      protein += r.per100.protein * k;
      carbs += r.per100.carbs * k;
      fat += r.per100.fat * k;
    }
    return {
      kcal: Math.round(kcal),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    };
  }, [rows]);

  const onCount = rows.filter((r) => r.on).length;

  const setGrams = (id: string, grams: number) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, grams } : r)));

  const toggle = (id: string) => {
    haptic("tap");
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        background: "rgba(5,4,6,.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "dlgBackdropIn .28s var(--ease-out) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Racik makanan"
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "22px 22px 0 0",
          background: "radial-gradient(700px 400px at 50% -10%, #1a1211, #0b0809 60%)",
          border: "1px solid rgba(255,255,255,.09)",
          borderBottom: "none",
          animation: "sheetCardIn .34s cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* drag handle — the affordance that says "this is a sheet" */}
        <div style={{ display: "grid", placeItems: "center", padding: "9px 0 3px" }}>
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,.22)",
            }}
          />
        </div>

        <div style={{ padding: "6px 18px 0" }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".16em",
              color: "#ffb99e",
            }}
          >
            RACIK · {onCount} BAHAN
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 19,
              letterSpacing: "-.02em",
              color: "#f5f0ec",
              marginTop: 4,
            }}
          >
            {query}
          </div>
        </div>

        {/* the parts */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px" }}>
          {rows.map((r) => {
            const k = r.grams / 100;
            const kcal = Math.round(r.per100.kcal * k);
            const macro = (key: "protein" | "carbs" | "fat") => Math.round(r.per100[key] * k);
            return (
              <div
                key={r.id}
                style={{
                  marginBottom: 10,
                  padding: "12px 13px",
                  borderRadius: 15,
                  opacity: r.on ? 1 : 0.42,
                  background: r.on ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)",
                  border: r.on
                    ? "1px solid rgba(255,150,120,.26)"
                    : "1px solid rgba(255,255,255,.08)",
                  transition: "opacity .18s, background .18s, border-color .18s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    aria-label={r.on ? `Buang ${r.name}` : `Pakai ${r.name}`}
                    onClick={() => toggle(r.id)}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: "pointer",
                      color: r.on ? "#fff" : "#6a6660",
                      background: r.on ? FIRE : "rgba(255,255,255,.06)",
                      border: r.on
                        ? "1px solid rgba(255,150,120,.6)"
                        : "1px solid rgba(255,255,255,.14)",
                    }}
                  >
                    {r.on ? "✓" : ""}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: SANS,
                        fontWeight: 700,
                        fontSize: 14.5,
                        color: "#f1ede9",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.name}
                    </div>
                    {/* per-part macros — the whole reason this sheet exists */}
                    <div
                      style={{
                        display: "flex",
                        gap: 9,
                        marginTop: 3,
                        fontFamily: MONO,
                        fontSize: 10,
                      }}
                    >
                      <span style={{ color: "#cfc8c2" }}>{kcal} kkal</span>
                      <span style={{ color: P_COLOR }}>{macro("protein")}p</span>
                      <span style={{ color: C_COLOR }}>{macro("carbs")}c</span>
                      <span style={{ color: F_COLOR }}>{macro("fat")}f</span>
                    </div>
                  </div>
                  <div
                    style={{
                      flexShrink: 0,
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 14,
                      color: r.on ? "#ffb99e" : "#6a6660",
                      minWidth: 54,
                      textAlign: "right",
                    }}
                  >
                    {r.grams} g
                  </div>
                </div>

                {/* drag to set the portion. A slider beats a stepper here: the
                    useful range is 20-400g and nobody taps + thirty times. */}
                {r.on ? (
                  <input
                    type="range"
                    min={10}
                    max={Math.max(300, Math.round(r.grams * 2.5))}
                    step={5}
                    value={r.grams}
                    aria-label={`Porsi ${r.name} dalam gram`}
                    onChange={(e) => setGrams(r.id, Number(e.target.value))}
                    onPointerUp={() => haptic("tap")}
                    className="racik-range"
                    style={{ width: "100%", marginTop: 10 }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* live total + commit */}
        <div
          style={{
            padding: "12px 16px calc(16px + env(safe-area-inset-bottom))",
            borderTop: "1px solid rgba(255,255,255,.08)",
            background: "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.5))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 30,
                  color: "#ffe9d6",
                  letterSpacing: "-.02em",
                }}
              >
                {total.kcal}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#8a837d" }}>KKAL</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 11.5 }}>
              <span style={{ color: P_COLOR }}>{total.protein}g p</span>
              <span style={{ color: C_COLOR }}>{total.carbs}g c</span>
              <span style={{ color: F_COLOR }}>{total.fat}g f</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "14px 18px",
                borderRadius: 14,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".08em",
                color: "#9a938d",
                cursor: "pointer",
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.12)",
              }}
            >
              BATAL
            </button>
            <button
              type="button"
              disabled={onCount === 0}
              onClick={() => {
                haptic("success");
                onConfirm(rows.filter((r) => r.on).map((r) => ({ id: r.id, grams: r.grams })));
              }}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 14,
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 14.5,
                color: "#fff",
                cursor: onCount === 0 ? "not-allowed" : "pointer",
                opacity: onCount === 0 ? 0.4 : 1,
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                textShadow: "0 1px 2px rgba(120,15,5,.5)",
              }}
            >
              TAMBAH KE {mealLabel.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
