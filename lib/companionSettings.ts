"use client";
import { scopedKey } from "./userScope";
import type { Character, CompanionGoal } from "./companionProgress";
export type CompanionSettings = {
  character: Character;
  goal: CompanionGoal | null;
};
const KEY = "r2.companion.v1";
export function readCompanion(name?: string | null): CompanionSettings {
  const fallback: CompanionSettings = {
    character: /renita/i.test(name ?? "") ? "renita" : "richie",
    goal: null,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const x = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "null");
    if (!x || !["richie", "renita"].includes(x.character)) return fallback;
    return {
      character: x.character,
      goal:
        x.goal && ["weight", "recomp"].includes(x.goal.mode) ? x.goal : null,
    };
  } catch {
    return fallback;
  }
}
export function saveCompanion(settings: CompanionSettings) {
  localStorage.setItem(scopedKey(KEY), JSON.stringify(settings));
  window.dispatchEvent(new Event("r2:data"));
}
