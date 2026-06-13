"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AnimatedNumber from "./AnimatedNumber";

type Props = {
  label: string;
  value: number;
  target: number;
  /** Suffix on the numerator/denominator: "g", "" for kcal, etc. */
  unit?: string;
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

  const style = { ["--p" as string]: pAnim } as CSSProperties;

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
