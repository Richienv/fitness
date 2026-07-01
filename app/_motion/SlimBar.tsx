"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AnimatedNumber from "./AnimatedNumber";

export type BarTint =
  | "kcal" | "protein" | "carbs" | "fat" | "sugar" | "fire";

// Per-macro colours from the fire mockup: kcal→orange, protein→green,
// carbs→blue, fat→gold, sugar→fire-red. So each bar reads at a glance.
const TINTS: Record<BarTint, { grad: string; glow: string }> = {
  kcal:    { grad: "linear-gradient(90deg,#ff8a3d,#ee2f1f)", glow: "rgba(238,60,48,.55)" },
  protein: { grad: "linear-gradient(90deg,#6ff0a4,#22c55e)", glow: "rgba(34,197,94,.5)" },
  carbs:   { grad: "linear-gradient(90deg,#5ac8f5,#229ed9)", glow: "rgba(34,158,217,.5)" },
  fat:     { grad: "linear-gradient(90deg,#ffd25a,#eab308)", glow: "rgba(234,179,8,.5)" },
  sugar:   { grad: "linear-gradient(90deg,#ff8a72,#ee3c30)", glow: "rgba(238,60,48,.55)" },
  fire:    { grad: "linear-gradient(90deg,#ff8a3d,#ee2f1f)", glow: "rgba(238,60,48,.55)" },
};

type Props = {
  label: string;
  value: number;
  target: number;
  /** Suffix on the numerator/denominator: "g", "" for kcal, etc. */
  unit?: string;
  /** Per-macro colour. Defaults to the generic fire gradient. */
  tint?: BarTint;
  /** Warn glyph appended to the label when over the cap (e.g. sugar). */
  warnIfOver?: boolean;
  /** Override left-side footer text. */
  leftFoot?: string;
  /** Override right-side footer text. */
  rightFoot?: string;
};

/**
 * Drop-in replacement for the old <div class="slim-row"> blocks in MealHome.
 * - Bar fill animates via transform: scaleX(--p) (set in CSS).
 * - --p starts at 0 on mount and animates to the real ratio next frame,
 *   so the bar "fills in" like the iOS Timer ring on first paint.
 * - The headline number counts up via AnimatedNumber.
 */
export default function SlimBar({
  label,
  value,
  target,
  unit = "",
  tint = "fire",
  warnIfOver = false,
  leftFoot,
  rightFoot,
}: Props) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const pct = Math.round(ratio * 100);
  const left = Math.max(0, Math.round(target - value));
  const over = warnIfOver && value > target;

  // Start at 0 → animate to ratio on first paint.
  const [pAnim, setPAnim] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPAnim(ratio));
    return () => cancelAnimationFrame(raf);
  }, [ratio]);

  // Over a cap → hot red; otherwise the macro's own colour.
  const t = over ? TINTS.sugar : TINTS[tint];
  const style = {
    ["--p" as string]: pAnim,
    background: t.grad,
    boxShadow: pAnim > 0 ? `0 0 10px ${t.glow}` : "none",
  } as CSSProperties;

  return (
    <div className="slim-row">
      <div className="slim-head mono">
        <span className="slim-label">
          {label}
          {over ? " ⚠" : ""}
        </span>
        <span className="slim-nums">
          <strong>
            <AnimatedNumber value={value} />
          </strong>{" "}
          / {target.toLocaleString()}
          {unit}
        </span>
      </div>
      <div className="slim-track">
        <div className="slim-fill" style={style} />
      </div>
      <div className="slim-foot mono">
        <span>
          {leftFoot ?? (
            <>
              <AnimatedNumber value={pct} />%
            </>
          )}
        </span>
        <span>
          {rightFoot ??
            (over ? (
              <>
                <AnimatedNumber value={value - target} />
                {unit} over cap
              </>
            ) : (
              <>
                <AnimatedNumber value={left} />
                {unit} left
              </>
            ))}
        </span>
      </div>
    </div>
  );
}
