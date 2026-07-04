// Sleep tracking — local-first, mirrors the lib/store.ts conventions.
// Pure data module: NO "use client" (server routes may import it and the
// build guard fails otherwise).

import { SLEEP_FLOOR_MIN, SLEEP_TARGET_MIN } from "./targets";
import { scopedKey } from "./userScope";

export type SleepQuality = 1 | 2 | 3;

export type SleepLog = {
  /** The WAKE date this night belongs to, YYYY-MM-DD. */
  date: string;
  /** "HH:MM" — may be "" for logs migrated from the old T-LVL sleepHours. */
  bedtime: string;
  wakeTime: string;
  durationMin: number;
  quality?: SleepQuality;
  note?: string;
};

const SLEEP_KEY = "richie.sleep.v1";
const SLEEP_MIGRATED_KEY = "richie.sleep.migrated.v1";
// Legacy: old per-day flags that stored sleepHours under `tlvl`.
const DAILY_KEY = "richie.daily.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

/** Minutes slept from bedtime → wakeTime, wrapping past midnight. */
export function durationFromTimes(bedtime: string, wakeTime: string): number {
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  if ([bh, bm, wh, wm].some((n) => Number.isNaN(n))) return 0;
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

/** One-time seed of sleep logs from the retired T-LVL `sleepHours` input. */
function migrateFromTLvl(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(scopedKey(SLEEP_MIGRATED_KEY))) return;
  const daily = read<Record<string, { tlvl?: { sleepHours?: number } }>>(
    DAILY_KEY,
    {}
  );
  const sleep = read<Record<string, SleepLog>>(SLEEP_KEY, {});
  let changed = false;
  for (const [date, flags] of Object.entries(daily)) {
    const h = flags?.tlvl?.sleepHours;
    if (typeof h === "number" && h > 0 && !sleep[date]) {
      sleep[date] = { date, bedtime: "", wakeTime: "", durationMin: Math.round(h * 60) };
      changed = true;
    }
  }
  if (changed) write(SLEEP_KEY, sleep);
  window.localStorage.setItem(scopedKey(SLEEP_MIGRATED_KEY), "1");
}

export function getAllSleep(): Record<string, SleepLog> {
  migrateFromTLvl();
  return read<Record<string, SleepLog>>(SLEEP_KEY, {});
}

export function getSleep(date: string): SleepLog | null {
  return getAllSleep()[date] ?? null;
}

export function setSleep(log: SleepLog): void {
  const all = read<Record<string, SleepLog>>(SLEEP_KEY, {});
  all[log.date] = log;
  write(SLEEP_KEY, all);
}

export function getSleepForRange(from: string, to: string): SleepLog[] {
  return Object.values(getAllSleep())
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- derived metrics (pure) ----------

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Consecutive nights (back from today) meeting the floor. Today un-logged
 *  is a grace day (doesn't break the run), matching the meal streak. */
export function sleepStreak(all: Record<string, SleepLog>, todayStr: string): number {
  const [y, m, d] = todayStr.split("-").map(Number);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const dt = new Date(y, m - 1, d - i);
    const log = all[ymd(dt)];
    if (log && log.durationMin >= SLEEP_FLOOR_MIN) streak++;
    else if (i === 0) continue; // last night not logged yet — grace
    else break;
  }
  return streak;
}

/** Rolling sleep debt (minutes) over the last `days` logged nights: net
 *  deficit vs target, floored at 0 (surplus offsets deficit). */
export function sleepDebtMin(logs: SleepLog[], days = 7): number {
  const recent = logs.slice(-days);
  const net = recent.reduce((a, s) => a + (SLEEP_TARGET_MIN - s.durationMin), 0);
  return Math.max(0, net);
}

/** Bedtime/wake regularity → 0–100. Needs ≥3 nights with real clock times.
 *  Returns null when there isn't enough data. */
export function consistencyScore(logs: SleepLog[], days = 7): number | null {
  const timed = logs
    .slice(-days)
    .filter((s) => s.bedtime && s.wakeTime);
  if (timed.length < 3) return null;
  // Represent bedtime on a continuous axis: pre-noon clock times are
  // "late night" → push past 24h so 23:30 and 00:30 sit next to each other.
  const toAxis = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    let mins = h * 60 + mm;
    if (mins < 12 * 60) mins += 24 * 60;
    return mins;
  };
  const bedVar = stdev(timed.map((s) => toAxis(s.bedtime)));
  const wakeVar = stdev(
    timed.map((s) => {
      const [h, mm] = s.wakeTime.split(":").map(Number);
      return h * 60 + mm;
    })
  );
  const avg = (bedVar + wakeVar) / 2;
  return Math.max(0, Math.min(100, Math.round(100 - avg * 0.45)));
}

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}
