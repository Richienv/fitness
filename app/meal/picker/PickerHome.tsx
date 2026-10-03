"use client";

// The empty screen of "Catat makan": what you probably want, then where to look.
//
//   SEKARANG · SARAPAN     ← foods this person eats at this meal, one tap
//   [🍚 Nasi] [🍗 Ayam] [🥚 Telur]
//   [🐟 Ikan] [🍜 Mie ] [🫘 Tahu]   ← tiles, ordered by habit, then by prior
//   …
//
// It replaces a flat alphabetical list that put "Ayam Bakar", "Ayam Goreng" and
// a second, different "Ayam Goreng" in a column and made you read all 151 rows
// starting with "Ayam" to find the one you ate. Nothing here asks a question; a
// tile opens the portion sheet already sitting on the most likely food.
//
// Tiles tilt toward your finger while pressed. That is press feedback, not
// information, so it is small (≤6°), CSS-only, and off under reduced motion.

import { memo, useRef, useState, type CSSProperties } from "react";
import { haptic } from "@/lib/haptics";
import type { Tile } from "@/lib/foodTiles";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";

export type UsualChip = { id: string; name: string; kcal: number };

export type TileView = {
  id: string;
  label: string;
  emoji: string;
  /** "Biasa: Ayam goreng" once there is history, otherwise "151 pilihan". */
  hint: string;
  personal: boolean;
};

function TileButton({ t, i, onOpen }: { t: TileView; i: number; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);

  // Tilt toward the press point. Written straight to the element's style: a
  // pointermove must not re-render a 14-tile grid.
  const tilt = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(520px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 10).toFixed(1)}deg) scale(.975)`;
  };
  const rest = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  const style: CSSProperties = {
    position: "relative",
    textAlign: "left",
    padding: "13px 12px 12px",
    borderRadius: 17,
    cursor: "pointer",
    minHeight: 84,
    color: "#f1ede9",
    background: t.personal
      ? "linear-gradient(160deg, rgba(238,60,48,.14), rgba(255,255,255,.04) 60%)"
      : "linear-gradient(160deg, rgba(255,255,255,.075), rgba(255,255,255,.03) 60%)",
    border: t.personal ? "1px solid rgba(255,150,120,.32)" : "1px solid rgba(255,255,255,.1)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.07), 0 8px 18px rgba(0,0,0,.35)",
    transition: "transform .22s cubic-bezier(.16,1,.3,1), border-color .2s",
    animationDelay: `${Math.min(i, 11) * 34}ms`,
    willChange: "transform",
  };

  return (
    <button
      ref={ref}
      type="button"
      className="pk-tile-in"
      aria-label={`${t.label}, ${t.hint}`}
      onClick={() => {
        haptic("tap");
        onOpen(t.id);
      }}
      onPointerMove={(e) => e.buttons > 0 && tilt(e)}
      onPointerDown={tilt}
      onPointerUp={rest}
      onPointerLeave={rest}
      onPointerCancel={rest}
      style={style}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 8,
          top: 6,
          fontSize: 30,
          lineHeight: 1,
          filter: "drop-shadow(0 6px 8px rgba(0,0,0,.5))",
          // A little parallax lift: the glyph sits above the card plane.
          transform: "translateZ(0)",
        }}
      >
        {t.emoji}
      </span>
      <span
        style={{
          display: "block",
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: "-.01em",
          maxWidth: "78%",
          lineHeight: 1.15,
        }}
      >
        {t.label}
      </span>
      <span
        style={{
          display: "block",
          marginTop: 8,
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: ".04em",
          color: t.personal ? "#ffb99e" : "#8a837d",
          lineHeight: 1.35,
        }}
      >
        {t.hint}
      </span>
    </button>
  );
}

function PickerHome({
  mealLabel,
  usual,
  tiles,
  loading,
  error,
  onRetry,
  onTile,
  onUsual,
  onMore,
  onImport,
  onGroup,
}: {
  mealLabel: string;
  usual: UsualChip[];
  tiles: TileView[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onTile: (id: string) => void;
  onUsual: (id: string) => void;
  onMore: () => void;
  onImport: () => void;
  onGroup: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="picker-home" style={{ marginTop: 14 }}>
      {usual.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#b6aea7", margin: "0 0 7px 2px" }}>
            Pilihan cepat · {mealLabel.toLowerCase()}
          </div>
          <div
            className="mk-rail"
            style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "2px 16px 4px" }}
          >
            {usual.map((u, i) => (
              <button
                key={u.id}
                type="button"
                className="pk-chip-in"
                onClick={() => {
                  haptic("tap");
                  onUsual(u.id);
                }}
                style={{
                  flexShrink: 0,
                  animationDelay: `${i * 40}ms`,
                  padding: "11px 14px",
                  borderRadius: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#f6efe9",
                  background: "rgba(238,60,48,.1)",
                  border: "1px solid rgba(255,150,120,.3)",
                }}
              >
                <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: 13.5, lineHeight: 1.1 }}>
                  {u.name}
                </span>
                <span style={{ display: "block", fontFamily: MONO, fontSize: 11, color: "#ffb99e", marginTop: 4 }}>
                  {Math.round(u.kcal)} kkal
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ textAlign: "center", padding: "26px 12px" }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: "#e8e4e0" }}>{error}</div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: "#6a6660", marginTop: 6 }}>
            Kategori dasar tetap tersedia. Cari atau coba muat lagi.
          </div>
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 12,
              padding: "11px 20px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: ".12em",
              color: "#e8e4e0",
              background: "rgba(255,255,255,.06)",
            }}
          >
            COBA LAGI
          </button>
        </div>
      ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {(expanded ? tiles : tiles.slice(0, 6)).map((t, i) => (
            <TileButton key={t.id} t={t} i={i} onOpen={onTile} />
          ))}
        </div>
      {tiles.length > 6 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}
        className="picker-secondary" style={{ width: "100%", marginTop: 10 }}>
        {expanded ? "Ringkas kategori" : "Kategori lainnya"}
      </button>}

      {loading && !error ? (
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".12em", color: "#7c736e", textAlign: "center", marginTop: 14 }}>
          MEMUAT LIBRARY…
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 20, flexWrap: "wrap" }}>
        {[
          { label: "Semua makanan", go: onMore },
          { label: "Impor", go: onImport },
          { label: "Buat warung", go: onGroup },
        ].map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              haptic("tap");
              a.go();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px 2px",
              minHeight: 44,
              fontFamily: MONO,
              fontSize: 12,
              letterSpacing: ".1em",
              color: "#8a837d",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(255,255,255,.18)",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// memo: the builder re-renders on every keystroke, and this must not.
export default memo(PickerHome);
export type { Tile };
