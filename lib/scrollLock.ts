"use client";

import { useEffect } from "react";

export type ScrollLockHost = {
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  getScrollY: () => number;
  restoreScrollY: (y: number) => void;
};

const MODAL_OPEN_CLASS = "modal-open";

/**
 * Creates a reference-counted scroll lock controller so stacked sheets never
 * unlock prematurely or lose the underlying page scroll offset on iOS.
 */
export function createScrollLockController(getHost: () => ScrollLockHost | null) {
  let lockCount = 0;
  let savedScrollY = 0;

  return {
    acquire(): () => void {
      const host = getHost();
      if (!host) return () => {};
      if (lockCount === 0) {
        savedScrollY = host.getScrollY();
        host.addClass(MODAL_OPEN_CLASS);
      }
      lockCount += 1;

      let released = false;
      return () => {
        if (released) return;
        released = true;
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount === 0) {
          const currentHost = getHost();
          if (!currentHost) return;
          currentHost.removeClass(MODAL_OPEN_CLASS);
          if (currentHost.getScrollY() !== savedScrollY) {
            currentHost.restoreScrollY(savedScrollY);
          }
        }
      };
    },
    getCount(): number {
      return lockCount;
    },
  };
}

function browserHost(): ScrollLockHost | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  return {
    addClass: (cls) => {
      document.documentElement.classList.add(cls);
      document.body?.classList.add(cls);
    },
    removeClass: (cls) => {
      document.documentElement.classList.remove(cls);
      document.body?.classList.remove(cls);
    },
    getScrollY: () => window.scrollY || window.pageYOffset || 0,
    restoreScrollY: (y) => {
      window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
    },
  };
}

const defaultController = createScrollLockController(browserHost);

/** Locks document scrolling while `active` is true without resetting scroll position. */
export function useModalScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return defaultController.acquire();
  }, [active]);
}
