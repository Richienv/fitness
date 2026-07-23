"use client";

// Remembers which machines the user actually trains, so search floats them up
// and LATIHAN can offer a "SERING DIPAKAI" one-tap row — the workout twin of
// lib/foodPicks. Local-first, per-user via scopedKey, keyed by stable
// Equipment.id (unlike food, which keys by name).

import { scopedKey } from "./userScope";
import type { Equipment, EquipmentCategory } from "./equipment";

export type MachinePick = {
  id: string;
  name: string;
  muscleGroup: string;
  category: EquipmentCategory;
  count: number; // times logged
  last: number; // epoch ms of last log
};

const KEY = "richie.machinepicks.v1";
const MAX = 40;

function read(): Record<string, MachinePick> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    return raw ? (JSON.parse(raw) as Record<string, MachinePick>) : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, MachinePick>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

/** Staple score: frequency + a gentle recency lift (same 21-day curve as food). */
export function pickScore(p: MachinePick, now = Date.now()): number {
  const days = Math.max(0, (now - p.last) / 86_400_000);
  return p.count + Math.exp(-days / 21) * 2;
}

/** Record that the user logged this machine (once per ＋CATAT action). */
export function recordMachinePick(e: Equipment): void {
  if (typeof window === "undefined" || !e?.id) return;
  const all = read();
  const prev = all[e.id];
  all[e.id] = {
    id: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    category: e.category,
    count: (prev?.count ?? 0) + 1,
    last: Date.now(),
  };
  const entries = Object.values(all);
  if (entries.length > MAX) {
    const keep = entries.sort((a, b) => pickScore(b) - pickScore(a)).slice(0, MAX);
    const next: Record<string, MachinePick> = {};
    for (const k of keep) next[k.id] = k;
    write(next);
    return;
  }
  write(all);
}

/** All picks, best staple first. */
export function getMachinePicks(): MachinePick[] {
  const now = Date.now();
  return Object.values(read()).sort((a, b) => pickScore(b, now) - pickScore(a, now));
}

/** id → rank (0 = top staple) for boosting searchEquipment results. */
export function getPickRank(): Map<string, number> {
  const m = new Map<string, number>();
  getMachinePicks().forEach((p, i) => m.set(p.id, i));
  return m;
}
