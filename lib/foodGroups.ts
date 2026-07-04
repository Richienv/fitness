// Custom food "libraries" — user-made groups like "Warung Bu Tini" that hold
// their own saved menu items. Local-first, mirrors the lib/store.ts /
// lib/sleep.ts conventions. Pure data module: NO "use client".

import { scopedKey } from "./userScope";

export type CustomFoodDef = {
  id: string;
  name: string;
  unit: string;
  group: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar?: number;
};

export type FoodGroup = {
  id: string;
  name: string;
  emoji: string;
  foods: CustomFoodDef[];
};

const FOODGROUPS_KEY = "richie.foodgroups.v1";

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

export function getFoodGroups(): FoodGroup[] {
  return read<FoodGroup[]>(FOODGROUPS_KEY, []);
}

/** Upsert a whole group by id. */
export function saveFoodGroup(g: FoodGroup): void {
  const all = getFoodGroups();
  const idx = all.findIndex((x) => x.id === g.id);
  if (idx === -1) all.push(g);
  else all[idx] = g;
  write(FOODGROUPS_KEY, all);
}

/** Append a food to an existing group and persist. */
export function addFoodToGroup(groupId: string, food: CustomFoodDef): void {
  const all = getFoodGroups();
  const idx = all.findIndex((x) => x.id === groupId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], foods: [...all[idx].foods, food] };
  write(FOODGROUPS_KEY, all);
}

/** Create + persist a new empty group. Id generated inside the function so it
 *  is never baked in at module load. */
export function createFoodGroup(name: string, emoji: string): FoodGroup {
  const g: FoodGroup = {
    id: "grp-" + crypto.randomUUID(),
    name: name.trim().toUpperCase(),
    emoji,
    foods: [],
  };
  const all = getFoodGroups();
  all.push(g);
  write(FOODGROUPS_KEY, all);
  return g;
}
