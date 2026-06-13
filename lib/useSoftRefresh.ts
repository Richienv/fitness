"use client";

import { useEffect } from "react";

/**
 * Soft refresh event fired by ServerSync when Hermes-logged rows arrive
 * from the DB. Pages that read from localStorage subscribe to this and
 * re-read into state — replacing the old window.location.reload() with
 * a proper React refresh.
 */
export const SOFT_REFRESH_EVENT = "r2:data";

export function useSoftRefresh(cb: () => void): void {
  useEffect(() => {
    const handler = () => cb();
    window.addEventListener(SOFT_REFRESH_EVENT, handler);
    return () => window.removeEventListener(SOFT_REFRESH_EVENT, handler);
  }, [cb]);
}
