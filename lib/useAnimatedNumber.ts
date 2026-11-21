"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Smoothly tween a number between renders using requestAnimationFrame and an
 * ease-out curve (matches the CSS `--ease-out` token). Returns the current
 * display value, which jumps instantly when reduced-motion is set.
 *
 * Use for headline metrics — calories, protein, sugar, day counter, streak —
 * so they count up on mount and glide on update instead of snapping.
 *
 * `from` sets the first displayed value, so a celebration can count from the
 * number before a log to the number after it.
 */
const EASE_OUT = (t: number): number => 1 - Math.pow(1 - t, 3);

export function useAnimatedNumber(
  target: number,
  durationMs = 700,
  from?: number
): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(from ?? target);
  const fromRef = useRef(from ?? target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    if (reduced || durationMs <= 0) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = fromRef.current;
    const delta = target - from;

    // Already there — nothing to animate.
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = from + delta * EASE_OUT(t);
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    // Frames don't run while the page is hidden. Land on the real number
    // anyway, so a count-up can never leave a stale value on screen.
    const settle = setTimeout(() => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      fromRef.current = target;
      setValue(target);
    }, durationMs + 120);

    return () => {
      clearTimeout(settle);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);

  return value;
}
