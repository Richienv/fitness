"use client";

import { useEffect } from "react";
import { clearWidget, isNativeApp, syncWidget } from "@/lib/native";

/**
 * Keeps the iOS home-screen widget in step with the app.
 *
 * Renders nothing and does nothing at all in a browser — `isNativeApp()` is
 * false unless we're inside the WKWebView shell.
 *
 * The sync runs on mount and again every time the app comes back to the
 * foreground. That second one is what matters in practice: iOS decides when a
 * widget may refresh, but a save() forces a timeline reload, so returning to
 * the home screen after logging a meal shows the new number immediately
 * instead of whenever WidgetKit next feels like it.
 */
export default function NativeBridge({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!isNativeApp()) return;

    if (!userId) {
      void clearWidget();
      return;
    }

    void syncWidget();

    const onVisible = () => {
      if (document.visibilityState === "hidden") void syncWidget();
    };
    // On hide rather than on show: the widget is what you look at *after*
    // leaving the app, so the last thing we do on the way out is push fresh
    // numbers to it.
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  return null;
}
