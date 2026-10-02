"use client";

// A plate that carries information.
//
// The rule for this component: every piece of depth has to MEAN something, or it
// is decoration and goes.
//
//   column height   = grams of that macro in the portion you are choosing.
//                     ONE shared scale for all three, so a 40 g carb column
//                     really does tower over a 6 g fat column. Per-macro scales
//                     would make every column look "full" and tell you nothing.
//   dashed ghost    = what is LEFT of that macro in today's budget.
//   column vs ghost = when the column rises past its ghost the column turns red:
//                     this portion would take you over for the day. That is the
//                     only reason this is 3D rather than three flat bars — the
//                     ghost and the column occupy the same footprint, so
//                     "how much of what's left does this eat" is read at a glance.
//   food mound      = how much FOOD this is, against a plate of known size. It
//                     is the one element that is estimation rather than data, so
//                     the plate carries its reference ("piring ±350 g").
//
// Built from plain CSS 3D (perspective + preserve-3d) and React state: no WebGL,
// no dependency, ~16 elements. Safari rules observed: no overflow:hidden or
// backdrop-filter on any ancestor of the preserve-3d scene, no `filter` on the
// faces (colours are pre-shaded instead), and the labels are counter-rotated
// billboards rather than 3D text.

import { useRef, useState, type CSSProperties } from "react";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";

export const MACRO_COLORS = { protein: "#5fe39a", carbs: "#5ac8f5", fat: "#eab308" } as const;
const OVER = "#ff5a4a";

type Macro = "protein" | "carbs" | "fat";
const MACROS: { key: Macro; label: string; letter: string }[] = [
  { key: "protein", label: "PROTEIN", letter: "P" },
  { key: "carbs", label: "KARBO", letter: "K" },
  { key: "fat", label: "LEMAK", letter: "L" },
];

/** Reference plate, grams of food that fill it. Shown on the plate itself. */
const PLATE_REF_G = 350;

/** px of column height per gram of macro, and the tallest a column may grow. */
const PX_PER_G = 1.7;
const MAX_H = 112;

/** "#rrggbb" -> shaded "rgb()" — pre-computed so no CSS filter is needed. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export type Plate3DProps = {
  /** Grams of food in the chosen portion. */
  grams: number;
  /** Macros for THIS portion, in grams. */
  macros: { protein: number; carbs: number; fat: number };
  /** What is left of today's budget, in grams. Omit to hide the ghosts. */
  remaining?: { protein: number; carbs: number; fat: number };
  /** Colour of the food mound. */
  tint?: string;
  /** Height of the stage in px. Width follows. */
  height?: number;
  /**
   * `grams` is a notional figure (the food has no real weight). The mound still
   * scales with the portion, but the legend must not claim "piring ±350 g" for
   * a number nobody measured.
   */
  nominal?: boolean;
};

const W = 32; // column footprint
const SPACING = 66;

function Column({
  index,
  macro,
  grams,
  ghost,
  scale,
}: {
  index: number;
  macro: (typeof MACROS)[number];
  grams: number;
  ghost: number | null;
  scale: number;
}) {
  const color = MACRO_COLORS[macro.key];
  // Animate the number itself, not just the CSS: the label and the height then
  // move together instead of the label snapping ahead of a transitioning face.
  const g = useAnimatedNumber(grams, 420);
  const h = Math.max(3, Math.min(MAX_H, g * scale));
  const gh = ghost == null ? 0 : Math.max(3, Math.min(MAX_H - 10, ghost * scale));
  const over = ghost != null && grams > ghost + 0.5;
  const face = over ? OVER : color;
  const x = (index - 1) * SPACING - W / 2;
  const y = 58;

  const base: CSSProperties = {
    position: "absolute",
    transition: "height .42s cubic-bezier(.16,1,.3,1), width .42s cubic-bezier(.16,1,.3,1), transform .42s cubic-bezier(.16,1,.3,1), background .3s",
  };

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: W,
        height: W,
        transformStyle: "preserve-3d",
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      {/* the ghost: what is left of today's budget, same footprint */}
      {ghost != null ? (
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", pointerEvents: "none" }}>
          <div
            style={{
              ...base,
              left: 0,
              top: W,
              width: W,
              height: gh,
              transformOrigin: "top",
              transform: "rotateX(90deg)",
              border: `1px dashed ${color}99`,
              background: `${color}12`,
            }}
          />
          <div
            style={{
              ...base,
              left: W,
              top: 0,
              width: gh,
              height: W,
              transformOrigin: "left center",
              transform: "rotateY(-90deg)",
              border: `1px dashed ${color}77`,
              background: `${color}0c`,
            }}
          />
          <div
            style={{
              ...base,
              left: 0,
              top: 0,
              width: W,
              height: W,
              transform: `translateZ(${gh}px)`,
              border: `1px dashed ${color}cc`,
              background: `${color}10`,
            }}
          />
        </div>
      ) : null}

      {/* the column: top, front, right — three faces, shaded for light from the upper left */}
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
        <div
          style={{
            ...base,
            left: 0,
            top: W,
            width: W,
            height: h,
            transformOrigin: "top",
            transform: "rotateX(90deg)",
            background: `linear-gradient(180deg, ${shade(face, 1.0)}, ${shade(face, 0.82)})`,
          }}
        />
        <div
          style={{
            ...base,
            left: W,
            top: 0,
            width: h,
            height: W,
            transformOrigin: "left center",
            transform: "rotateY(-90deg)",
            background: `linear-gradient(90deg, ${shade(face, 0.7)}, ${shade(face, 0.55)})`,
          }}
        />
        <div
          style={{
            ...base,
            left: 0,
            top: 0,
            width: W,
            height: W,
            transform: `translateZ(${h}px)`,
            background: shade(face, 1.22),
            boxShadow: over ? `0 0 14px ${OVER}` : "none",
          }}
        />
      </div>

      {/* the label: a billboard, counter-rotated so it always faces the viewer */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: W / 2,
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `translateZ(${h + 16}px) rotateZ(var(--pk-yaw-inv, 32deg)) rotateX(-58deg)`,
          transition: "transform .42s cubic-bezier(.16,1,.3,1)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -30,
            top: -10,
            width: 60,
            textAlign: "center",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 16,
            lineHeight: 1,
            color: over ? OVER : "#f6efe9",
            textShadow: "0 1px 6px rgba(0,0,0,.8)",
          }}
        >
          {Math.round(g)}
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 500, color: face, marginLeft: 1 }}>g</span>
        </div>
      </div>
    </div>
  );
}

export default function Plate3D({ grams, macros, remaining, tint = "#d89a5a", height = 236, nominal = false }: Plate3DProps) {
  // Drag to look around. Optional: nothing depends on it, but a 3D object you
  // cannot turn feels like a picture of one. Springs back on release.
  const [yaw, setYaw] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  // ONE scale for all three macros — see the header. Shrinks only when the
  // tallest thing on the plate (a column OR a ghost) would not fit.
  const tallest = Math.max(
    macros.protein,
    macros.carbs,
    macros.fat,
    remaining ? Math.min(remaining.protein, 140) : 0,
    remaining ? Math.min(remaining.carbs, 140) : 0,
    remaining ? Math.min(remaining.fat, 140) : 0,
    1
  );
  const scale = Math.min(PX_PER_G, (MAX_H + 10) / tallest);

  const animatedGrams = useAnimatedNumber(grams, 420);
  // sqrt: doubling the food doubles the AREA on the plate, not the radius.
  const r = Math.max(10, Math.min(46, 8 + 34 * Math.sqrt(Math.max(0, animatedGrams) / PLATE_REF_G)));

  const sceneYaw = -32 + yaw;

  return (
    <div
      role="img"
      aria-label={`${nominal ? "" : Math.round(grams) + " gram: "}protein ${Math.round(macros.protein)} gram, karbo ${Math.round(
        macros.carbs
      )} gram, lemak ${Math.round(macros.fat)} gram`}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, yaw };
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        setYaw(Math.max(-38, Math.min(38, drag.current.yaw + dx * 0.35)));
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
        setYaw(0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setYaw(0);
      }}
      style={
        {
          position: "relative",
          width: "100%",
          height,
          perspective: 760,
          perspectiveOrigin: "50% 26%",
          touchAction: "pan-y",
          cursor: dragging ? "grabbing" : "grab",
          // The counter-rotation the labels need, as a variable so they stay
          // readable while the plate is being turned.
          ["--pk-yaw-inv" as string]: `${-sceneYaw}deg`,
        } as CSSProperties
      }
    >
      {/* Idle sway lives on its OWN wrapper. A running CSS animation replaces
          the element's inline transform, so putting it on the board would erase
          the yaw the moment it started. */}
      <div
        className="pk-sway"
        style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}
      >
      {/* the board: everything stands on this plane */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "54%",
          width: 232,
          height: 232,
          marginLeft: -116,
          marginTop: -116,
          transformStyle: "preserve-3d",
          transform: `rotateX(58deg) rotateZ(${sceneYaw}deg)`,
          transition: dragging ? "none" : "transform .6s cubic-bezier(.16,1,.3,1)",
        }}
      >
        {/* plate: rim, well, and a cast shadow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 50% 50%, #26211f 0 46%, #3a3330 47% 49%, #1b1716 50% 100%)",
            boxShadow: "0 0 0 2px rgba(255,255,255,.07), 0 30px 46px rgba(0,0,0,.65), inset 0 0 26px rgba(0,0,0,.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 14,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,.06)",
          }}
        />

        {/* contact shadow: grounds the mound on the plate */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: r * 2.1,
            height: r * 1.5,
            marginTop: -70 - r * 0.75,
            marginLeft: -r * 1.05 - 8,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,0))",
          }}
        />

        {/* food mound — a billboarded sphere resting in the well, sized to the portion */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            transformStyle: "preserve-3d",
            transform: `translate3d(-8px, -70px, ${r * 1.18}px) rotateZ(${-sceneYaw}deg) rotateX(-58deg)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -r,
              top: -r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle at 34% 28%, ${shade(tint, 1.45)}, ${tint} 46%, ${shade(tint, 0.45)} 100%)`,
              boxShadow: "inset -6px -8px 14px rgba(0,0,0,.35)",
            }}
          />
        </div>

        {MACROS.map((m, i) => (
          <Column
            key={m.key}
            index={i}
            macro={m}
            grams={macros[m.key]}
            ghost={remaining ? Math.max(0, remaining[m.key]) : null}
            scale={scale}
          />
        ))}
      </div>
      </div>

      {/* legend: the macro names live here, flat and readable, in the same colours */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 16,
          display: "flex",
          justifyContent: "center",
          gap: 16,
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: ".1em",
          pointerEvents: "none",
        }}
      >
        {MACROS.map((m) => (
          <span key={m.key} style={{ color: MACRO_COLORS[m.key] }}>
            ■ {m.label}
          </span>
        ))}
      </div>

      {/* the key: what the depth means, said once, in words */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
          gap: 14,
          fontFamily: MONO,
          fontSize: 8.5,
          letterSpacing: ".08em",
          color: "#6f6862",
          pointerEvents: "none",
        }}
      >
        <span>TINGGI = GRAM</span>
        {remaining ? <span>┆ = SISA HARI INI</span> : null}
        {nominal ? <span>● PIRING = PORSI</span> : <span>● PIRING ±{PLATE_REF_G}g</span>}
      </div>
    </div>
  );
}
