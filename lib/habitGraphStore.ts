"use client";
// Low-level browser persistence & event hooks for the real-time Habit Graph.
//
// Deliberately does NOT import lib/store.ts, lib/workouts.ts, or lib/activity.ts
// so those modules can notify the Habit Graph in real time with zero circular
// dependencies.

import {
  createHabitGraph,
  normalizeHabitGraph,
  recordMealEvent,
  recordShadowConfirm,
  recordShadowDismiss,
  recordWorkoutEvent,
  type DayType,
  type HabitFoodSnapshot,
  type HabitGraph,
  type HabitWorkoutPayload,
} from "./habitGraph.ts";
import type { MealType } from "./presets.ts";
import { getActiveUser, scopedKey } from "./userScope.ts";

const GRAPH_KEY = "r2.habitGraph.v1";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let serverSyncDisabled = false;

function currentUserKey(): string {
  return getActiveUser() || "default";
}

export function readHabitGraph(): HabitGraph {
  if (typeof window === "undefined") return createHabitGraph(currentUserKey());
  try {
    const raw = window.localStorage.getItem(scopedKey(GRAPH_KEY));
    if (!raw) return createHabitGraph(currentUserKey());
    return normalizeHabitGraph(JSON.parse(raw), currentUserKey());
  } catch {
    return createHabitGraph(currentUserKey());
  }
}

export function writeHabitGraph(graph: HabitGraph, opts: { sync?: boolean; emit?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(GRAPH_KEY), JSON.stringify(graph));
  } catch {
    // quota — non-fatal
  }
  if (opts.emit !== false) {
    window.dispatchEvent(new Event("r2:data"));
  }
  if (opts.sync !== false) {
    scheduleHabitGraphPush();
  }
}

export function scheduleHabitGraphPush(): void {
  if (typeof window === "undefined" || serverSyncDisabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const graph = readHabitGraph();
    fetch("/api/habit-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { degraded?: boolean } } | null) => {
        if (json?.data?.degraded) serverSyncDisabled = true;
      })
      .catch(() => {});
  }, 1500);
}

/** Pull remote habit graph (when available) and merge conservatively: keep the
 *  fresher / richer snapshot without clobbering local real-time updates. */
export async function syncHabitGraphFromServer(): Promise<boolean> {
  if (typeof window === "undefined" || serverSyncDisabled) return false;
  try {
    const res = await fetch("/api/habit-graph", { cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean; data?: { graph?: unknown; degraded?: boolean } };
    if (json?.data?.degraded) {
      serverSyncDisabled = true;
      return false;
    }
    if (!json?.data?.graph) return false;
    const remote = normalizeHabitGraph(json.data.graph, currentUserKey());
    const local = readHabitGraph();
    const localEdgeCount = Object.keys(local.edges).length;
    const remoteEdgeCount = Object.keys(remote.edges).length;
    if (remoteEdgeCount === 0) return false;

    let changed = false;
    for (const [id, rNode] of Object.entries(remote.nodes)) {
      const lNode = local.nodes[id];
      if (!lNode || rNode.updatedAt > lNode.updatedAt) {
        local.nodes[id] = rNode;
        changed = true;
      }
    }
    for (const [k, rEdge] of Object.entries(remote.edges)) {
      const lEdge = local.edges[k];
      if (!lEdge || rEdge.updatedAt > lEdge.updatedAt) {
        local.edges[k] = rEdge;
        changed = true;
      }
    }
    if (remote.bootstrapped && !local.bootstrapped && remoteEdgeCount >= localEdgeCount) {
      local.bootstrapped = true;
      changed = true;
    }
    if (changed) {
      local.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
      writeHabitGraph(local, { sync: false, emit: true });
    }
    return changed;
  } catch {
    return false;
  }
}

export function learnMealToGraph(input: {
  eventId?: string;
  date: string;
  mealType: MealType;
  at?: number;
  dayType: DayType;
  items: HabitFoodSnapshot[];
}): void {
  if (typeof window === "undefined" || !input.items.length) return;
  const g = readHabitGraph();
  const at = input.at ?? Date.now();
  recordMealEvent(g, {
    eventId: input.eventId,
    date: input.date,
    mealType: input.mealType,
    at,
    dayType: input.dayType,
    items: input.items,
  });
  writeHabitGraph(g, { emit: false });
}

export function learnWorkoutToGraph(input: {
  eventId?: string;
  date: string;
  at?: number;
  dayType: DayType;
  payload: HabitWorkoutPayload;
}): void {
  if (typeof window === "undefined") return;
  const g = readHabitGraph();
  recordWorkoutEvent(g, {
    eventId: input.eventId,
    date: input.date,
    at: input.at ?? Date.now(),
    dayType: input.dayType,
    payload: input.payload,
  });
  writeHabitGraph(g, { emit: false });
}

export function confirmShadowInGraph(targetNodeId: string, at = Date.now()): void {
  if (typeof window === "undefined") return;
  const g = readHabitGraph();
  recordShadowConfirm(g, targetNodeId, at);
  writeHabitGraph(g, { emit: true });
}

export function dismissShadowInGraph(targetNodeId: string, at = Date.now()): void {
  if (typeof window === "undefined") return;
  const g = readHabitGraph();
  recordShadowDismiss(g, targetNodeId, at);
  writeHabitGraph(g, { emit: true });
}
