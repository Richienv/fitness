"use client";
// Apple Health days on this device: filled from /api/widget/health during
// sync, read by Latihan. Per user (scopedKey), like the other stores.
import { scopedKey } from "./userScope";
import { todayKey } from "./targets";
import type { HealthDay } from "./healthImport";

export type StoredHealthDay = HealthDay & { receivedAt?: string };
const KEY = "richie.health.v1";

function readAll(): Record<string, StoredHealthDay> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(scopedKey(KEY)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function getHealthDay(date: string): StoredHealthDay | null {
  return readAll()[date] ?? null;
}

/** The newest time any day was received, to say "diperbarui …". */
export function lastHealthReceived(): string | null {
  const times = Object.values(readAll())
    .map((d) => d.receivedAt)
    .filter((t): t is string => !!t)
    .sort();
  return times.at(-1) ?? null;
}

/** "hari ini 21.00", "kemarin 21.00", or "Kamis 21.00" (China Standard Time). */
export function receivedLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  });
  const day = todayKey(at);
  if (day === todayKey(now)) return `hari ini ${time}`;
  if (day === todayKey(new Date(now.getTime() - 86_400_000))) return `kemarin ${time}`;
  const weekday = at.toLocaleDateString("id-ID", { weekday: "long", timeZone: "Asia/Shanghai" });
  return `${weekday} ${time}`;
}

/** Merge days from the server; returns how many changed. */
export function mergeServerHealth(days: StoredHealthDay[]): number {
  const all = readAll();
  let changed = 0;
  for (const d of days) {
    if (!d || typeof d.date !== "string") continue;
    const cur = all[d.date];
    if (cur && cur.receivedAt === d.receivedAt) continue;
    all[d.date] = d;
    changed++;
  }
  if (changed) localStorage.setItem(scopedKey(KEY), JSON.stringify(all));
  return changed;
}
