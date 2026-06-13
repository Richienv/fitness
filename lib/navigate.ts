"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { haptic, type HapticKind } from "./haptics";

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => unknown;
};

/**
 * Wraps router.push with the View Transitions API for smooth cross-fade /
 * shared-element morphs between pages. Graceful fallback to a plain push
 * when the browser doesn't support it (older iOS, Firefox).
 *
 * Optional haptic — pass null to skip.
 *
 *   const go = useVTNavigate();
 *   go("/meal");                  // tap haptic + VT
 *   go("/meal", { haptic: null }); // silent VT
 *   go("/meal", { haptic: "success" });
 */
export function useVTNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string, opts: { haptic?: HapticKind | null } = {}) => {
      const kind = opts.haptic === undefined ? "tap" : opts.haptic;
      if (kind !== null) haptic(kind);
      const doc =
        typeof document !== "undefined"
          ? (document as ViewTransitionDocument)
          : null;
      if (doc && typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => router.push(href));
      } else {
        router.push(href);
      }
    },
    [router]
  );
}
