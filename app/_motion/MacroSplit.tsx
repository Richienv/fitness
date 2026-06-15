"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Props = {
  protein: number;
  carbs: number;
  fat: number;
  /** Compact = bar only (for per-meal rows). Full = bar + legend + headline. */
  compact?: boolean;
};

const P_KCAL = 4;
const C_KCAL = 4;
const F_KCAL = 9;

/**
 * Calorie-composition bar: shows what share of energy came from protein /
 * carbs / fat. A genuine insight the rest of the app doesn't surface —
 * "are you protein-forward today?" — computed from kcal contribution, not
 * gram weight (so fat reads heavier, correctly).
 */
export default function MacroSplit({ protein, carbs, fat, compact }: Props) {
  const pCal = protein * P_KCAL;
  const cCal = carbs * C_KCAL;
  const fCal = fat * F_KCAL;
  const total = pCal + cCal + fCal;

  const pPct = total > 0 ? (pCal / total) * 100 : 0;
  const cPct = total > 0 ? (cCal / total) * 100 : 0;
  const fPct = total > 0 ? (fCal / total) * 100 : 0;

  // Animate the segments in from 0 on mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const seg = (pct: number) =>
    ({ ["--w" as string]: `${shown ? pct : 0}%` } as CSSProperties);

  if (total <= 0) {
    return (
      <div className={`msplit${compact ? " compact" : ""}`}>
        <div className="msplit-bar msplit-empty" />
      </div>
    );
  }

  return (
    <div className={`msplit${compact ? " compact" : ""}`}>
      {!compact && (
        <div className="msplit-head mono">
          <span className="msplit-title">CALORIE SPLIT</span>
          <span className="msplit-lead">
            {Math.round(Math.max(pPct, cPct, fPct)) === Math.round(pPct)
              ? "PROTEIN-FORWARD"
              : Math.round(Math.max(pPct, cPct, fPct)) === Math.round(cPct)
                ? "CARB-FORWARD"
                : "FAT-FORWARD"}
          </span>
        </div>
      )}
      <div className="msplit-bar">
        <div className="msplit-seg p" style={seg(pPct)} />
        <div className="msplit-seg c" style={seg(cPct)} />
        <div className="msplit-seg f" style={seg(fPct)} />
      </div>
      {!compact && (
        <div className="msplit-legend mono">
          <span className="msplit-leg p">{Math.round(pPct)}% PROTEIN</span>
          <span className="msplit-leg c">{Math.round(cPct)}% CARBS</span>
          <span className="msplit-leg f">{Math.round(fPct)}% FAT</span>
        </div>
      )}
    </div>
  );
}
