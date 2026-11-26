"use client";
// Client preferences & persistence for unlocked stage backgrounds + achievements.

import { scopedKey } from "./userScope";
import { sendOrQueue } from "./offlineOutbox";
import {
  DEFAULT_STAGE_ID,
  isStageBackgroundId,
  type StageBackgroundId,
} from "./stageBackgrounds";
import type { HealthAchievementProgress } from "./healthAchievements";

const STAGE_KEY = "r2.stageBackground.v1";
const EARNED_KEY = "r2.healthEarned.v1";
const SYNCED_UNLOCK_KEY = "r2.healthSynced.v1";

export function readSelectedStageId(setupStageId?: unknown): StageBackgroundId {
  if (typeof window !== "undefined") {
    try {
      const local = window.localStorage.getItem(scopedKey(STAGE_KEY));
      if (isStageBackgroundId(local)) return local;
    } catch {
      /* ignore */
    }
  }
  if (isStageBackgroundId(setupStageId)) return setupStageId;
  return DEFAULT_STAGE_ID;
}

export function saveSelectedStageId(stageId: StageBackgroundId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(STAGE_KEY), stageId);
    window.dispatchEvent(new Event("r2:data"));
  } catch {
    /* ignore */
  }
  void sendOrQueue({
    url: "/api/setup",
    method: "PATCH",
    body: { stageBackgroundId: stageId },
    dedupeKey: "setup:stageBackgroundId",
  });
}

export function readEarnedAchievementKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(window.localStorage.getItem(scopedKey(EARNED_KEY)) || "[]");
    return Array.isArray(raw)
      ? new Set(raw.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function recordEarnedAchievementKeys(keys: readonly string[]): string[] {
  if (typeof window === "undefined" || keys.length === 0) return [];
  const prev = readEarnedAchievementKeys();
  const newlyAdded: string[] = [];
  for (const k of keys) {
    if (!prev.has(k)) {
      prev.add(k);
      newlyAdded.push(k);
    }
  }
  if (newlyAdded.length > 0) {
    try {
      window.localStorage.setItem(scopedKey(EARNED_KEY), JSON.stringify(Array.from(prev)));
    } catch {
      /* ignore */
    }
  }
  return newlyAdded;
}

export function syncAchievementsToServer(
  items: HealthAchievementProgress[],
  stageNames: Map<string, string>,
): void {
  if (typeof window === "undefined") return;
  const unlocked = items.filter((x) => x.unlocked);
  if (unlocked.length === 0) return;

  let syncedSet: Set<string>;
  try {
    const raw = JSON.parse(window.localStorage.getItem(scopedKey(SYNCED_UNLOCK_KEY)) || "[]");
    syncedSet = Array.isArray(raw) ? new Set(raw) : new Set();
  } catch {
    syncedSet = new Set();
  }

  const hasUnsyncedUnlock = unlocked.some((x) => !syncedSet.has(x.key));
  if (!hasUnsyncedUnlock) return;

  const payload = items.map((x) => ({
    key: x.key,
    title: x.title,
    stageName: stageNames.get(x.stageId),
    progress: x.current,
    unlocked: x.unlocked,
  }));

  void sendOrQueue({
    url: "/api/achievements/sync",
    method: "POST",
    body: { achievements: payload },
    dedupeKey: "achievements:sync",
  }).then((res) => {
    if (res.ok) {
      for (const u of unlocked) syncedSet.add(u.key);
      try {
        window.localStorage.setItem(
          scopedKey(SYNCED_UNLOCK_KEY),
          JSON.stringify(Array.from(syncedSet)),
        );
      } catch {
        /* ignore */
      }
    }
  });
}
