"use client";

import { useEffect } from "react";

// Registers /sw.js and keeps it current.
//
// The update dance matters more than the registration. Without it a home-screen
// launch can keep running a worker from a deploy two weeks ago, because iOS
// only swaps workers when every tab closes — and an installed app never really
// closes. So: check for an update on every load and whenever the app comes back
// to the foreground, then tell a waiting worker to take over immediately.
export default function PWA() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // A brand-new worker calls clients.claim() on activate, which fires
    // controllerchange on this very first page load. That is NOT an update —
    // reloading there throws away whatever the user has typed and gives every
    // first-time visitor a pointless flash. Only a swap from one controller to
    // another is worth a reload.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController) return;
      // Exactly one reload per swap. Without the guard this is an infinite loop.
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;

    const promote = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) {
        r.waiting.postMessage("skip-waiting");
      }
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => {
        reg = r;
        promote(r);
        r.addEventListener("updatefound", () => {
          const next = r.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed") promote(r);
          });
        });
      })
      .catch(() => {
        /* private mode, unsupported browser — the app works without it */
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
