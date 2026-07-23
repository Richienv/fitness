"use client";

// "What's in your gym" — a soft, local-first inventory so recommendations can
// prefer machines you actually have. Learns silently from what you log; it only
// ever HARD-filters after you explicitly complete the picker (picked===true).
// Inference alone never hides anything (a hotel gym would otherwise collapse the
// list to one machine). Mirrors lib/foodPicks conventions.

import { scopedKey } from "./userScope";
import { EQUIPMENT, type EquipmentCategory } from "./equipment";

export type GymInventory = {
  owned: Record<string, true>;
  picked: boolean; // user completed the explicit picker
  askedAt: number | null; // when we last nudged; null = never
  skipped: boolean; // user dismissed the nudge
};

const KEY = "richie.gymInventory.v1";
const EMPTY: GymInventory = { owned: {}, picked: false, askedAt: null, skipped: false };

function read(): GymInventory {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as GymInventory) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function write(inv: GymInventory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(inv));
  } catch {
    /* ignore quota */
  }
}

export function getInventory(): GymInventory {
  return read();
}

/** Explicit toggle from the picker. */
export function setOwned(id: string, on: boolean): void {
  const inv = read();
  if (on) inv.owned[id] = true;
  else delete inv.owned[id];
  write(inv);
}

export function toggleAll(cat: EquipmentCategory, on: boolean): void {
  const inv = read();
  for (const e of EQUIPMENT) {
    if (e.category !== cat) continue;
    if (on) inv.owned[e.id] = true;
    else delete inv.owned[e.id];
  }
  write(inv);
}

/** Mark the picker as intentionally completed — this (not inference) is what
 *  turns on hard filtering. */
export function markPicked(): void {
  const inv = read();
  inv.picked = true;
  write(inv);
}

/** True only after the user completed the picker — the gate for hard filtering. */
export function hasExplicitInventory(): boolean {
  return read().picked === true;
}

/** Silent learning from every ＋CATAT: anything you log is in your gym. Never
 *  flips `picked`, so it can't start hard-filtering on its own. */
export function inferFromLog(id: string): void {
  if (!id) return;
  const inv = read();
  if (inv.owned[id]) return;
  inv.owned[id] = true;
  write(inv);
}

/** Soft gate: doable unless the user has explicitly set their gym AND left this
 *  one out. Before the picker is completed, everything is doable. */
export function isDoable(id: string): boolean {
  const inv = read();
  if (!inv.picked) return true;
  return !!inv.owned[id];
}

/** Small ordering nudge for search/reco — owned machines float up. */
export function ownedBoost(id: string): number {
  return read().owned[id] ? 40 : 0;
}

/** Dim (not hide) a row: only when we have some inventory evidence and this
 *  machine isn't in it. */
export function dimHint(id: string): boolean {
  const inv = read();
  const hasEvidence = Object.keys(inv.owned).length > 0;
  return hasEvidence && !inv.owned[id];
}

export function dismissNudge(): void {
  const inv = read();
  inv.skipped = true;
  inv.askedAt = Date.now();
  write(inv);
}

/** Show the "set up your gym" nudge once, only after a few logged sessions. */
export function shouldNudge(sessionsLogged: number): boolean {
  const inv = read();
  return !inv.picked && !inv.skipped && inv.askedAt === null && sessionsLogged >= 3;
}
