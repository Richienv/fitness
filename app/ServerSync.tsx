"use client";

import { useEffect } from "react";
import { useAccountSetup } from "./SetupProvider";
import {
  mergeServerFoods,
  mergeServerMeals,
  pushLocalMealsToDb,
  syncCustomFoodsToDbOnce,
} from "@/lib/store";
import { mergeServerWorkouts, pushLocalWorkoutsToDb } from "@/lib/workouts";
import { mergeServerMeasurements, pushLocalMeasurementsToDb } from "@/lib/measurements";
import { mergeServerHealth } from "@/lib/health";
import { mergeServerWater, pushLocalWaterToDb } from "@/lib/water";
import { flushOutbox, getOutboxCount } from "@/lib/offlineOutbox";
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

function emitSyncStatus(
  state: "syncing" | "synced" | "offline",
  pendingCount = getOutboxCount(),
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("r2:sync-status", {
      detail: { state, pendingCount, updatedAt: Date.now() },
    }),
  );
}

/** Pull server data (Hermes/Telegram-logged + laptop/iPhone devices) into the local
 * store. Returns `{ added, online }`. */
async function pullFromServer(days = 30): Promise<{ added: number; online: boolean }> {
  const from = daysBefore(todayKey(), days);

  const [mealsRes, foodsRes, workoutsRes, measRes, healthRes, waterRes] = await Promise.all([
    fetchJson<{ meals: never[] }>(`/api/meals?from=${from}`),
    fetchJson<{ data: { foods: never[] } }>("/api/foods"),
    fetchJson<{ data: { sessions: never[] } }>(`/api/workouts?from=${from}`),
    fetchJson<{ data: { measurements: never[] } }>(
      `/api/measurements?from=${from}`
    ),
    // Apple Health days sent by the iPhone Shortcut (see /settings/health).
    fetchJson<{ data: { days: never[] } }>(`/api/widget/health?from=${from}`),
    fetchJson<{ data: { days: Array<{ date: string; waterMl: number }> } }>(
      `/api/water?from=${from}`
    ),
  ]);

  const online = Boolean(
    mealsRes || foodsRes || workoutsRes || measRes || healthRes || waterRes,
  );
  let added = 0;
  if (mealsRes?.meals) added += mergeServerMeals(mealsRes.meals, { fromDate: from });
  if (foodsRes?.data?.foods) added += mergeServerFoods(foodsRes.data.foods);
  if (workoutsRes?.data?.sessions)
    added += mergeServerWorkouts(workoutsRes.data.sessions);
  if (measRes?.data?.measurements)
    added += mergeServerMeasurements(measRes.data.measurements);
  if (healthRes?.data?.days) added += mergeServerHealth(healthRes.data.days);
  if (waterRes?.data?.days) added += mergeServerWater(waterRes.data.days);
  return { added, online };
}

const SOFT_GUARD_KEY = "richie.serversync.lastSoftRefresh";
const SOFT_REFRESH_EVENT = "r2:data";

/** Soft refresh — emit an event the data-reading pages listen to and
 * re-read localStorage into state. NO full page reload. */
function softRefresh(): void {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
  const last = Number(sessionStorage.getItem(SOFT_GUARD_KEY) ?? 0);
  if (Date.now() - last < 1500) return;
  sessionStorage.setItem(SOFT_GUARD_KEY, String(Date.now()));
  window.dispatchEvent(new Event(SOFT_REFRESH_EVENT));
}

export default function ServerSync({ userId }: { userId: string | null }) {
  const ready = !!useAccountSetup()?.setup;
  useEffect(() => {
    if (!userId || !ready) return;

    let cancelled = false;
    let inFlight = false;

    const seed = seedApr13Meals();
    if (seed && seed.seeded > 0)
      console.log("[ServerSync] seeded", seed.seeded, "APR 13 meals");

    syncResolvedTargets();
    void syncCustomFoodsToDbOnce();
    void syncHabitGraphFromServer();

    const idleWarm = window.setTimeout(() => {
      if (cancelled) return;
      warmFoodCatalogue();
    }, 150);

    const runSync = async ({
      initial = false,
      forceRefresh = false,
    }: { initial?: boolean; forceRefresh?: boolean } = {}) => {
      if (cancelled || inFlight) return;
      inFlight = true;
      emitSyncStatus("syncing");
      try {
        await flushOutbox();
        await Promise.allSettled([
          pushLocalMealsToDb(),
          pushLocalMeasurementsToDb(),
          pushLocalWorkoutsToDb(),
          pushLocalWaterToDb(),
          syncCustomFoodsToDbOnce(),
        ]);
        const res = await pullFromServer(initial ? 90 : 30);
        if (!cancelled) {
          emitSyncStatus(res.online ? "synced" : "offline", getOutboxCount());
          if (res.added > 0 || forceRefresh) {
            if (res.added > 0) {
              console.log("[ServerSync] synced", res.added, "changes from server");
            }
            softRefresh();
          }
        }
      } catch {
        if (!cancelled) emitSyncStatus("offline", getOutboxCount());
      } finally {
        inFlight = false;
      }
    };

    const onOutboxChange = () => {
      emitSyncStatus(
        typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "synced",
        getOutboxCount(),
      );
    };

    void runSync({ initial: true });

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void runSync();
    };
    const onOnline = () => {
      void runSync({ forceRefresh: true });
    };
    const onForceSync = () => {
      void runSync({ forceRefresh: true });
    };

    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("r2:force-sync", onForceSync);
    window.addEventListener("r2:outbox-change", onOutboxChange);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void runSync();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearTimeout(idleWarm);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("r2:force-sync", onForceSync);
      window.removeEventListener("r2:outbox-change", onOutboxChange);
      clearInterval(interval);
    };
  }, [userId, ready]);

  return null;
}
