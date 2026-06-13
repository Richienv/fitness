"use client";

/**
 * Lightweight haptic feedback. Backed by navigator.vibrate so it's truly
 * free on Android/PWA. iOS Safari ignores vibrate — we fall back to a
 * silent no-op. Patterns are intentionally short so they never feel buzzy.
 *
 * Use sparingly: high-signal commits (log, save, complete, target-hit),
 * never on plain navigation.
 */
export type HapticKind = "tap" | "success" | "warn" | "error";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [10, 35, 10],
  warn: [20, 40, 20],
  error: [30, 50, 30],
};

export function haptic(kind: HapticKind = "tap"): void {
  if (typeof navigator === "undefined") return;
  // Respect users who explicitly asked for less motion — fewer buzzes too.
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    // ignore — feature not supported
  }
}
