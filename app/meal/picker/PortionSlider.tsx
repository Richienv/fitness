"use client";

// The portion slider: drag for grams, and it clicks into household portions.
//
// Why snap points: nobody knows what 137 g is. People know "one potong", "half a
// plate", "two". The stops are the multiples the old sheet already used
// (PORTION_STEPS: ¼ ½ ¾ 1 1¼ 1½ 2 3), now sitting on a continuous track, so you
// can still land on 137 g — it only pulls in when you are close to a stop.
//
// Why the pulse: iOS Safari has no navigator.vibrate, so a "detent" you cannot
// feel has to be one you can SEE. Crossing a stop pops the number.
//
// The input is a real <input type="range"> underneath, so keyboard, screen
// reader, and the OS's own drag physics all work for free. The ticks and the
// readout are layered on top.

import { useEffect, useMemo, useRef, useState } from "react";
import { PORTION_STEPS } from "@/lib/satuan";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";

const THUMB = 24; // keep in sync with .racik-range's thumb

export type PortionSliderProps = {
  grams: number;
  onChange: (grams: number) => void;
  /** Grams in "1 <unit>" for this food — where the stops are anchored. */
  portionG: number;
  /** "potong", "porsi", "butir" … for the readout under the number. */
  unit?: string;
  /**
   * The food has no real gram weight, so `grams` is really (units × portionG)
   * and showing it as grams would be a number we made up. The big readout
   * becomes the count ("1½ mangkuk") and the word "gram" never appears. This is
   * the mode that stopped noodle soup opening at 950 kkal.
   */
  unitsOnly?: boolean;
};

const fmtMult = (m: number): string => {
  const whole = Math.floor(m + 1e-9);
  const frac = Math.round((m - whole) * 100) / 100;
  const f = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  if (!f) return String(Math.round(m * 100) / 100);
  return whole === 0 ? f : `${whole}${f}`;
};

export default function PortionSlider({ grams, onChange, portionG, unit = "porsi", unitsOnly = false }: PortionSliderProps) {
  const pg = portionG > 0 ? portionG : 100;
  // Counted units run higher than a gram range does: you eat 4 eggs, not 1.4 of
  // a notional 250 g.
  const min = unitsOnly ? Math.round(pg * 0.25) : 1;
  const max = Math.max(grams, unitsOnly ? Math.round(pg * 6) : Math.max(Math.round(pg * 3.4), 150));

  const stops = useMemo(
    () => PORTION_STEPS.map((s) => ({ ...s, g: Math.round(pg * s.mult) })).filter((s) => s.g >= min && s.g <= max),
    [pg, min, max]
  );

  const clamped = Math.max(min, Math.min(max, grams));
  const frac = (v: number) => (v - min) / (max - min);

  // Which stop (if any) we are sitting on, to pulse only on ENTERING one.
  const atStop = stops.find((s) => Math.abs(s.g - clamped) < 0.5);
  const lastStop = useRef<number | null>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = atStop ? atStop.g : null;
    if (id !== null && id !== lastStop.current) {
      setPulse((n) => n + 1);
      haptic("tap");
    }
    lastStop.current = id;
  }, [atStop]);

  const snap = (raw: number): number => {
    // Magnetic, not mandatory: within ~3.5% of the range of a stop, pull in.
    const radius = (max - min) * 0.035;
    let best = raw;
    let bestD = radius;
    for (const s of stops) {
      const d = Math.abs(s.g - raw);
      if (d < bestD) {
        bestD = d;
        best = s.g;
      }
    }
    return Math.round(best);
  };

  const nudge = (dir: 1 | -1) => {
    // Units step by a quarter-unit; grams by 5 g, then 10 g once past 100.
    const step = unitsOnly ? pg * 0.25 : clamped >= 100 ? 10 : 5;
    onChange(Math.max(min, Math.min(max, Math.round(clamped / step) * step + dir * step)));
  };

  const mult = clamped / pg;
  const readout = atStop ? `${fmtMult(atStop.mult)} ${unit}` : `≈ ${fmtMult(Math.round(mult * 4) / 4)} ${unit}`;

  const nudgeBtn = (dir: 1 | -1, label: string): React.ReactNode => (
    <button
      type="button"
      aria-label={dir === 1 ? "Tambah porsi" : "Kurangi porsi"}
      onClick={() => {
        haptic("tap");
        nudge(dir);
      }}
      style={{
        flexShrink: 0,
        width: 44,
        height: 44,
        borderRadius: 12,
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 20,
        lineHeight: 1,
        color: "#f1ede9",
        cursor: "pointer",
        background: "rgba(255,255,255,.07)",
        border: "1px solid rgba(255,255,255,.14)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "12px 0" }}>
        <span style={{ fontFamily: SANS, fontSize: 13, color: "#b6aea7" }}>{unitsOnly ? `Jumlah ${unit}` : "Berat (gram)"}</span>
        <input type="number" aria-label={unitsOnly ? `Jumlah ${unit}` : "Berat dalam gram"}
          min={unitsOnly ? 0.25 : 1} max={unitsOnly ? 30 : 3000} step={unitsOnly ? 0.25 : 1}
          inputMode="decimal" value={unitsOnly ? grams / pg : grams}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v) && v > 0) onChange(Math.min(3000, unitsOnly ? v * pg : v));
          }}
          style={{ width: 92, minHeight: 44, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", color: "#fff", fontFamily: SANS, fontSize: 16, textAlign: "right" }} />
      </label>
      {/* readout */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
        <span
          key={pulse}
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "-.03em",
            lineHeight: 1,
            color: atStop ? "#ffd2b8" : "#f6efe9",
            animation: pulse ? "pk-pop .32s cubic-bezier(.34,1.56,.64,1)" : "none",
            display: "inline-block",
            transition: "color .2s",
          }}
        >
          {unitsOnly ? fmtMult(Math.round((clamped / pg) * 4) / 4) : Math.round(clamped)}
        </span>
        {unitsOnly ? (
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: atStop ? "#ff9a80" : "#9a938d", transition: "color .2s" }}>
            {unit}
          </span>
        ) : (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#8a837d" }}>gram</span>
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 14,
                color: atStop ? "#ff9a80" : "#9a938d",
                marginLeft: 6,
                transition: "color .2s",
              }}
            >
              {readout}
            </span>
          </>
        )}
      </div>

      {/* track */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        {nudgeBtn(-1, "−")}
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="range"
            className="racik-range"
            min={min}
            max={max}
            step={1}
            value={clamped}
            aria-label={unitsOnly ? `Porsi dalam ${unit}` : "Porsi dalam gram"}
            aria-valuetext={unitsOnly ? `${fmtMult(Math.round((clamped / pg) * 4) / 4)} ${unit}` : `${Math.round(clamped)} gram, ${readout}`}
            onChange={(e) => onChange(unitsOnly ? Math.round(Number(e.target.value) / 25) * 25 : snap(Number(e.target.value)))}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                nudge(e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1);
              }
            }}
            style={{ width: "100%", minHeight: 44, display: "block", position: "relative", zIndex: 2 }}
          />
          {/* the filled part of the track */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: THUMB / 2,
              top: "50%",
              marginTop: -3,
              height: 6,
              borderRadius: 999,
              width: `calc((100% - ${THUMB}px) * ${frac(clamped)})`,
              background: "linear-gradient(90deg,#ff9d5c,#ee3c30)",
              boxShadow: "0 0 12px rgba(238,60,48,.45)",
              zIndex: 1,
              pointerEvents: "none",
              transition: "box-shadow .2s",
            }}
          />
        </div>
        {nudgeBtn(1, "+")}
      </div>

      {/* ticks: the household portions */}
      <div className="mk-rail" style={{ display: "flex", overflowX: "auto", gap: 6, marginTop: 8 }}>
        {stops.map((s) => {
          const on = atStop?.g === s.g;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                haptic("tap");
                onChange(s.g);
              }}
              aria-label={unitsOnly ? `${s.label} ${unit}` : `${s.label} ${unit}, ${s.g} gram`}
              aria-pressed={on}
              style={{
                flex: "1 0 44px",
                minHeight: 44,
                padding: "6px 8px",
                borderRadius: 7,
                cursor: "pointer",
                background: on ? "rgba(238,60,48,.18)" : "transparent",
                border: "none",
                fontFamily: MONO,
                fontSize: 13,
                color: on ? "#ffb99e" : "#7c746e",
                transition: "color .2s, background .2s",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  width: 1,
                  height: 5,
                  margin: "0 auto 2px",
                  background: on ? "#ff9a80" : "rgba(255,255,255,.22)",
                }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
