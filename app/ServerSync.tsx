"use client";

import { useEffect } from "react";
import { useAccountSetup } from "./SetupProvider";
import {
  mergeServerFoods,
  mergeServerMeals,
  pushLocalMealsToDb,
  syncCustomFoodsToDbOnce,
} from "@/lib/store";
import { mergeServerWorkouts } from "@/lib/workouts";
import { mergeServerMeasurements } from "@/lib/measurements";
import { mergeServerHealth } from "@/lib/health";
import { syncResolvedTargets } from "@/lib/targetSync";
import { seedApr13Meals } from "@/lib/mealSeed";
import { todayKey } from "@/lib/targets";
import { warmFoodCatalogue } from "@/lib/foodCatalogue";
import { syncHabitGraphFromServer } from "@/lib/habitGraphStore";

/** YYYY-MM-DD n days before the given CST date key. */
function daysBefore(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull server data (Hermes/Telegram-logged + other devices) into the local
 * store. Returns the number of records imported. */
async function pullFromServer(): Promise<number> {
  const from = daysBefore(todayKey(), 45);

  const [mealsRes, foodsRes, workoutsRes, measRes, healthRes] = await Promise.all([
    fetchJson<{ meals: never[] }>(`/api/meals?from=${from}`),
    fetchJson<{ data: { foods: never[] } }>("/api/foods"),
    fetchJson<{ data: { sessions: never[] } }>(`/api/workouts?from=${from}`),
    fetchJson<{ data: { measurements: never[] } }>(
      `/api/measurements?from=${from}`
    ),
    // Apple Health days sent by the iPhone Shortcut (see /settings/health).
    fetchJson<{ data: { days: never[] } }>(`/api/widget/health?from=${from}`),
  ]);

  let added = 0;
  if (mealsRes?.meals) added += mergeServerMeals(mealsRes.meals);
  if (foodsRes?.data?.foods) added += mergeServerFoods(foodsRes.data.foods);
  if (workoutsRes?.data?.sessions)
    added += mergeServerWorkouts(workoutsRes.data.sessions);
  if (measRes?.data?.measurements)
    added += mergeServerMeasurements(measRes.data.measurements);
  if (healthRes?.data?.days) added += mergeServerHealth(healthRes.data.days);
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

/**
 * `userId` is what makes this work, and it used to be missing.
 *
 * This component lives in the root layout, which also wraps /login. With an
 * empty dependency array it mounted on the login page, fired all five pulls
 * with no session, took five 401s, and — because fetchJson swallows a non-OK
 * response — imported nothing. Signing in is a client-side navigation into the
 * SAME layout, so the effect never re-ran. The result: you signed in and your
 * own data wasn't there. It only appeared after a manual refresh, a tab
 * refocus, or the 60s interval, by which point you'd assume it was lost.
 *
 * Keying the effect on the session id fixes both halves: nothing runs while
 * signed out, and the moment login's router.refresh() re-renders the layout
 * with a real id, the pull runs for the first time — with cookies.
 */
export default function ServerSync({ userId }: { userId: string | null }) {
  const ready = !!useAccountSetup()?.setup;
  useEffect(() => {
    // Signed out: every one of these calls is a guaranteed 401.
    if (!userId || !ready) return;

    let cancelled = false;

    const seed = seedApr13Meals();
    if (seed && seed.seeded > 0)
      console.log("[ServerSync] seeded", seed.seeded, "APR 13 meals");

    // Push local meals up to the DB on every load (idempotent) so anything a
    // flaky save missed becomes durable — then a fresh login can restore it.
    pushLocalMealsToDb().then((res) => {
      if (res) console.log("[ServerSync] pushed", res.pushed, "meals to DB");
    });

    // Keep the server's copy of today's calorie/protein target fresh so the
    // widget reflects the current goal without re-pasting its script.
    syncResolvedTargets();
    syncCustomFoodsToDbOnce().then((res) => {
      if (res) console.log("[ServerSync] pushed", res.synced, "foods to DB");
    });

    // Warm food catalogue & static posters during idle so searching food and
    // switching pages stay instant even when signal drops later.
    const idleWarm = window.setTimeout(() => {
      if (cancelled) return;
      warmFoodCatalogue();
    }, 350);

    // Initial pull — emit a soft refresh if Hermes logged something new.
    // The records are already saved by the time this resolves, so tell the
    // pages even if this effect was torn down meanwhile (Strict Mode runs it
    // twice in dev; the re-run's pull then finds nothing new to announce).
    pullFromServer().then((added) => {
      if (added > 0) {
        console.log("[ServerSync] imported", added, "records from server");
        softRefresh();
      }
    });
    void syncHabitGraphFromServer();

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
      window.clearTimeout(idleWarm);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [userId, ready]);

  return null;
}
