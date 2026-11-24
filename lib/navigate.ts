"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { haptic, type HapticKind } from "./haptics";

/**
 * router.push with an optional haptic. It used to wrap the push in
 * document.startViewTransition, but that callback returned before the new
 * screen existed, so the browser froze the page for the cross-fade and every
 * tap cost about a second on top of the network (measured: 1.6 s per tab
 * switch against 0.6 s without it). Screens arrive with their own short
 * entrance animation instead.
 *
 *   const go = useVTNavigate();
 *   go("/meal");                   // tap haptic
 *   go("/meal", { haptic: null }); // silent
 *   go("/meal", { haptic: "success" });
 */
export function useVTNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string, opts: { haptic?: HapticKind | null } = {}) => {
      const kind = opts.haptic === undefined ? "tap" : opts.haptic;
      if (kind !== null) haptic(kind);
      router.push(href);
    },
    [router],
  );
}
