import type { MealItem, MealLog } from "./store.ts";
import type { MealType } from "./presets.ts";
import { scaleNutritionExtras } from "./nutritionLabel.ts";

export type ServerMealRow = {
  id: string;
  date: string;
  mealType: string;
  items: unknown;
  totals: unknown;
  createdAt?: string;
  photoUrl?: string | null;
};

function sortJsonValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortJsonValue);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[k];
    if (val !== undefined) out[k] = sortJsonValue(val);
  }
  return out;
}

export function mealItemsSig(items: MealItem[], photoUrl?: string | null): string {
  return JSON.stringify({ items: items.map(sortJsonValue), photoUrl: photoUrl ?? null });
}

/**
 * Pure server-to-local meal reconciliation shared by store.ts and unit tests:
 * imports new rows, applies edits made on another device, and (when `fromDate`
 * is passed for an authoritative server window) prunes rows deleted remotely.
 */
export function reconcileServerMeals(
  currentMeals: MealLog[],
  seenIds: Iterable<string>,
  serverSigs: Record<string, string>,
  rows: ServerMealRow[],
  opts?: { fromDate?: string },
): {
  meals: MealLog[];
  sigs: Record<string, string>;
  importedIds: string[];
  changed: number;
  sigsDirty: boolean;
} {
  const seen = new Set(seenIds);
  const sigs = { ...serverSigs };
  let sigsDirty = false;
  let all = currentMeals.map((m) => ({ ...m, items: [...m.items] }));
  const localById = new Map(all.map((m) => [m.id, m]));
  const importedIds: string[] = [];
  const serverIds = new Set(rows.map((r) => r.id));
  let changed = 0;

  for (const row of rows) {
    const items = coerceServerItems(row.items);
    const localMatch = localById.get(row.id);

    if (localMatch) {
      const serverSig = mealItemsSig(items, row.photoUrl ?? localMatch.photoUrl);
      const localSig = mealItemsSig(localMatch.items, localMatch.photoUrl);
      const lastSig = sigs[row.id];
      if (!lastSig && localSig === serverSig) {
        sigs[row.id] = serverSig;
        sigsDirty = true;
      } else if (serverSig !== localSig && serverSig !== lastSig && items.length > 0) {
        localMatch.items = items;
        localMatch.loggedAt = row.createdAt ? Date.parse(row.createdAt) : Date.now();
        if (row.photoUrl !== undefined) localMatch.photoUrl = row.photoUrl;
        sigs[row.id] = mealItemsSig(localMatch.items, localMatch.photoUrl);
        sigsDirty = true;
        changed++;
      } else if (lastSig !== serverSig) {
        sigs[row.id] = serverSig;
        sigsDirty = true;
      }
      continue;
    }

    if (seen.has(row.id)) continue;
    importedIds.push(row.id);
    if (items.length === 0) continue;
    const existing = all.find(
      (m) => m.date === row.date && m.mealType === row.mealType,
    );
    if (existing) {
      existing.items = [...existing.items, ...items];
      existing.loggedAt = Date.now();
      if (row.photoUrl) existing.photoUrl = row.photoUrl;
    } else {
      const created: MealLog = {
        id: row.id,
        date: row.date,
        mealType: row.mealType as MealType,
        items,
        loggedAt: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
        photoUrl: row.photoUrl ?? null,
      };
      all.push(created);
      localById.set(created.id, created);
      sigs[row.id] = mealItemsSig(created.items, created.photoUrl);
      sigsDirty = true;
    }
    changed++;
  }

  if (opts?.fromDate) {
    const kept: MealLog[] = [];
    for (const m of all) {
      if (m.date >= opts.fromDate && sigs[m.id] && !serverIds.has(m.id)) {
        delete sigs[m.id];
        sigsDirty = true;
        changed++;
        continue;
      }
      kept.push(m);
    }
    all = kept;
  }

  return { meals: all, sigs, importedIds, changed, sigsDirty };
}

/** Server items written by older Hermes builds lack the MealItem shape —
 * coerce anything with a name+kcal into a CustomMealItem the UI can render. */
export function coerceServerItems(raw: unknown): MealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MealItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const at =
      typeof o.addedAt === "number" && isFinite(o.addedAt)
        ? { addedAt: o.addedAt }
        : {};
    if (o.custom === true && typeof o.name === "string") {
      out.push({
        custom: true,
        name: o.name,
        grams: typeof o.grams === "number" ? o.grams : 100,
        kcal: typeof o.kcal === "number" ? o.kcal : 0,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
        ...(typeof o.portionLabel === "string"
          ? { portionLabel: o.portionLabel }
          : {}),
        ...scaleNutritionExtras(o, 1),
        ...at,
      });
    } else if (typeof o.id === "string" && typeof o.qty === "number") {
      out.push({ id: o.id, qty: o.qty, ...at });
    } else if (typeof o.name === "string" && typeof o.kcal === "number") {
      out.push({
        custom: true,
        name: o.name,
        grams: 100,
        kcal: o.kcal,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
        ...(typeof o.portionLabel === "string"
          ? { portionLabel: o.portionLabel }
          : {}),
        ...scaleNutritionExtras(o, 1),
        ...at,
      });
    }
  }
  return out;
}
