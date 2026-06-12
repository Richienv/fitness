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

const RELOAD_GUARD_KEY = "richie.serversync.lastReload";

/** Reload so pages re-read localStorage — at most once per 30s, and never
 * mid-typing (active input/textarea focus). */
function maybeReload(): void {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < 30_000) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
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

    // Initial pull — refresh the page if Hermes logged something new.
    pullFromServer().then((added) => {
      if (cancelled) return;
      if (added > 0) {
        console.log("[ServerSync] imported", added, "records from server");
        maybeReload();
      }
    });

    // Re-pull when the tab regains focus (came back from Telegram).
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      pullFromServer().then((added) => {
        if (!cancelled && added > 0) maybeReload();
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
