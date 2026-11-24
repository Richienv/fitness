"use client";
// Activities logged by hand on Latihan: steps, cycling, push-ups and the like.
// Local-first and per user (scopedKey), like the other stores. Nothing here is
// synced to the server yet; Apple Health import would write to this same list.
import { scopedKey } from "./userScope";
import type { ActivityKey, Intensity } from "./burn";

export type ActivityEntry = {
  id: string;
  /** YYYY-MM-DD, China Standard Time (todayKey). */
  date: string;
  kind: ActivityKey;
  steps?: number;
  minutes?: number;
  reps?: number;
  intensity?: Intensity;
  /** When it was logged, epoch ms. */
  at: number;
};

const KEY = "richie.activity.v1";

function readAll(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "[]");
    return Array.isArray(raw) ? (raw as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ActivityEntry[]): void {
  localStorage.setItem(scopedKey(KEY), JSON.stringify(list));
  window.dispatchEvent(new Event("r2:data"));
}

export function getActivities(date?: string): ActivityEntry[] {
  const all = readAll();
  return (date ? all.filter((a) => a.date === date) : all).sort(
    (a, b) => a.at - b.at,
  );
}

export function getAllActivities(): ActivityEntry[] {
  return readAll();
}

export function addActivity(e: Omit<ActivityEntry, "id" | "at">): ActivityEntry {
  const entry: ActivityEntry = { ...e, id: crypto.randomUUID(), at: Date.now() };
  writeAll([...readAll(), entry]);
  return entry;
}

export function deleteActivity(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}
