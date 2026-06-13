"use client";

import { useEffect } from "react";
import {
  mergeServerFoods,
  mergeServerMeals,
  syncCustomFoodsToDbOnce,
  syncMealsToDbOnce,
} from "@/lib/store";
import { mergeServerWorkouts } from "@/lib/workouts";
import { mergeServerMeasurements } from "@/lib/measurements";
import { seedApr13Meals } from "@/lib/mealSeed";
import { todayKey } from "@/lib/targets";

/** YYYY-MM-DD n days before the given CST date key. */
function daysBefore(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Pull server data (Hermes/Telegram-logged + other devices) into the local
 * store. Returns the number of records imported. */
async function pullFromServer(): Promise<number> {
  const from = daysBefore(todayKey(), 14);

  const [mealsRes, foodsRes, workoutsRes, measRes] = await Promise.all([
    fetchJson<{ meals: never[] }>(`/api/meals?from=${from}`),
    fetchJson<{ data: { foods: never[] } }>("/api/foods"),
    fetchJson<{ data: { sessions: never[] } }>(`/api/workouts?from=${from}`),
    fetchJson<{ data: { measurements: never[] } }>(
      `/api/measurements?from=${from}`
    ),
  ]);

  let added = 0;
  if (mealsRes?.meals) added += mergeServerMeals(mealsRes.meals);
  if (foodsRes?.data?.foods) added += mergeServerFoods(foodsRes.data.foods);
  if (workoutsRes?.data?.sessions)
    added += mergeServerWorkouts(workoutsRes.data.sessions);
  if (measRes?.data?.measurements)
    added += mergeServerMeasurements(measRes.data.measurements);
  return added;
}

const SOFT_GUARD_KEY = "richie.serversync.lastSoftRefresh";
const SOFT_REFRESH_EVENT = "r2:data";

/** Soft refresh — emit an event the data-reading pages listen to and
 * re-read localStorage into state. NO full page reload (the old version
 * called window.location.reload, which felt like the app was rebooting
 * every time Hermes wrote a row). Guarded so we don't thrash if multiple
 * pulls happen back-to-back, and never when the user is typing. */
function softRefresh(): void {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
  const last = Number(sessionStorage.getItem(SOFT_GUARD_KEY) ?? 0);
  if (Date.now() - last < 1500) return;
  sessionStorage.setItem(SOFT_GUARD_KEY, String(Date.now()));
  window.dispatchEvent(new Event(SOFT_REFRESH_EVENT));
}

export default function ServerSync() {
  useEffect(() => {
    let cancelled = false;

    const seed = seedApr13Meals();
    if (seed && seed.seeded > 0)
      console.log("[ServerSync] seeded", seed.seeded, "APR 13 meals");

    // One-shot legacy pushes: local meals + custom foods up to the DB.
    syncMealsToDbOnce().then((res) => {
      if (res) console.log("[ServerSync] pushed", res.synced, "meals to DB");
    });
    syncCustomFoodsToDbOnce().then((res) => {
      if (res) console.log("[ServerSync] pushed", res.synced, "foods to DB");
    });

    // Initial pull — emit a soft refresh if Hermes logged something new.
    pullFromServer().then((added) => {
      if (cancelled) return;
      if (added > 0) {
        console.log("[ServerSync] imported", added, "records from server");
        softRefresh();
      }
    });

    // Re-pull when the tab regains focus (came back from Telegram).
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      pullFromServer().then((added) => {
        if (!cancelled && added > 0) softRefresh();
      });
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    // Background refresh — merge silently; next navigation shows it.
    const interval = setInterval(() => {
      pullFromServer().catch(() => {});
    }, 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  return null;
}
