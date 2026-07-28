"use client";

// The two metal treatments from the design handoff. They are deliberately
// different and must not be mixed:
//
//   1. Badge  — a RAISED notched shield with a banded gradient and silver
//               engraved lettering. Used on feed rows and profiles.
//   2. Carved — used ONLY on the podium. No fill, no plaque: the letters are a
//               darker shade of the pedestal's own metal and the relief comes
//               entirely from light (dark shadows above the glyph, light lips
//               below), so the text reads as chiselled into the block.

import type { CSSProperties } from "react";
import type { BadgeTier } from "@/lib/badges";

const CINZEL = "Cinzel, 'Times New Roman', serif";

// 7-stop diagonal band per tier — the sweep is what makes it read as metal.
const BANDS: Record<BadgeTier | "locked", string> = {
  gold:   "linear-gradient(115deg,#6b4810 0%,#b8862c 18%,#f4dfa6 38%,#d8ab52 52%,#9c6c1c 72%,#c79a3e 86%,#6b4810 100%)",
  silver: "linear-gradient(115deg,#4f585f 0%,#8f9aa3 18%,#e8eef4 38%,#b3bdc5 52%,#69737b 72%,#9ca7af 86%,#4f585f 100%)",
  bronze: "linear-gradient(115deg,#5f3812 0%,#a56c36 18%,#e8bd92 38%,#c08a54 52%,#7d4f1d 72%,#a97games 86%,#5f3812 100%)".replace("a97games", "a97a4a"),
  fire:   "linear-gradient(115deg,#7a1408 0%,#c9331f 18%,#ff9d6b 38%,#ee3c30 52%,#a8180c 72%,#e0603f 86%,#7a1408 100%)",
  green:  "linear-gradient(115deg,#14532d 0%,#2f8f52 18%,#9df0bd 38%,#37b366 52%,#1c6b39 72%,#4fbf7d 86%,#14532d 100%)",
  locked: "linear-gradient(115deg,#25292c 0%,#3a4045 18%,#565e64 38%,#41484d 52%,#2c3134 72%,#484f55 86%,#25292c 100%)",
};

const RIM: Record<BadgeTier | "locked", string> = {
  gold: "#4a3208",
  silver: "#343b41",
  bronze: "#3d240c",
  fire: "#5c0f06",
  green: "#0d3a1f",
  locked: "#1a1d20",
};

/** Raised notched shield. `size` scales the whole badge. */
export function badgeStyle(
  tier: BadgeTier | "locked",
  size: "xs" | "sm" | "md" = "sm"
): CSSProperties {
  const pad =
    size === "xs" ? "3px 6px 6px" : size === "sm" ? "4px 8px 8px" : "6px 12px 12px";
  const font = size === "xs" ? 6.5 : size === "sm" ? 7.5 : 9.5;
  return {
    display: "inline-block",
    padding: pad,
    // The notch is what makes it a shield rather than a chip.
    clipPath: "polygon(0 0,100% 0,100% 66%,50% 100%,0 66%)",
    background: BANDS[tier],
    border: `1px solid ${RIM[tier]}`,
    fontFamily: CINZEL,
    fontWeight: 900,
    fontSize: font,
    letterSpacing: ".08em",
    lineHeight: 1,
    whiteSpace: "nowrap",
    // Silver engraved lettering: light above, dark below.
    color: tier === "locked" ? "#7b848b" : "#f4f7fa",
    textShadow:
      tier === "locked"
        ? "0 -1px 0 rgba(0,0,0,.6)"
        : "0 -1px 0 rgba(255,255,255,.45), 0 1px 1px rgba(0,0,0,.75)",
    boxShadow: "inset 0 2px 1px rgba(255,255,255,.4), 0 2px 5px rgba(0,0,0,.5)",
  };
}

// Carved: the glyph colour is a DARKER shade of the pedestal metal, never a
// fill. Relief comes from two dark shadows above and two light lips below.
const CARVED_INK: Record<"gold" | "silver" | "bronze", string> = {
  gold: "#7a5514",
  silver: "#5f6a72",
  bronze: "#77501f",
};

export function carved(
  tone: "gold" | "silver" | "bronze",
  size: number,
  weight: 600 | 700 | 900 = 700,
  tracking = 1.5
): CSSProperties {
  return {
    fontFamily: CINZEL,
    fontWeight: weight,
    fontSize: size,
    letterSpacing: `${tracking}px`,
    color: CARVED_INK[tone],
    // Recessed inner wall above, lit lip below.
    textShadow: [
      "0 -1px 0 rgba(0,0,0,.55)",
      "0 -2px 2px rgba(0,0,0,.35)",
      "0 1px 0 rgba(255,255,255,.34)",
      "0 2px 3px rgba(255,255,255,.16)",
    ].join(","),
  };
}
