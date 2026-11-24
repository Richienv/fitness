"use client";

import { todayKey } from "./targets";
import { dayTarget } from "./dayBudgetData";

/** Push today's resolved daily target (gym or rest, plus what training earned,
 *  from the same function the app uses) to the server so the widget always shows the current goal without
 *  re-pasting the script. Fire-and-forget; safe to call often. */
export function syncResolvedTargets(): void {
  if (typeof window === "undefined") return;
  try {
    const t = dayTarget(todayKey()).target;
    fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kcal: Math.round(t.kcal), protein: Math.round(t.protein) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
