"use client";

import { useEffect, useState } from "react";

/**
 * Reactive boolean mirror of `prefers-reduced-motion: reduce`. Use to gate
 * JS-driven animations (count-up, View Transitions, optimistic micro-anims).
 * CSS animations are already gated by the global @media block in globals.css.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mql.matches);
    sync();
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);

  return reduced;
}
