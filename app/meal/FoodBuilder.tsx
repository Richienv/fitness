"use client";

// Food Builder — R2·FIT "Fire" single-screen revamp, pixel-matched to the
// R2FIT-Fire standalone reference and wired to the real data layer.
//
// The old PROTEIN → KARBO → … 5-step wizard is gone. This is one search-first
// screen scoped to a meal time:
//   · empty state: big library count, glowing centered search, ambient embers
//   · typing: flat ranked result rows (category icon + chip + serving/kcal + add)
//   · picks collect in the "yang kamu makan" tray up top with live totals
//   · browse-all + custom library groups live behind the floating ⋯ button
//   · floating ＋ adds a manual food
// Saving writes one meal via the existing store (same shape as before).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSheetBack } from "@/lib/backSheet";
import { haptic } from "@/lib/haptics";
import { INGREDIENTS } from "@/lib/ingredients";
import { drinkSugarFull, SUGAR_LEVELS } from "@/lib/drinkSugar";
import { saveMeal, type MealItem, type CustomMealItem } from "@/lib/store";
import { contributeFood } from "@/lib/foodContribute";
import { prettyFoodName } from "@/lib/foodDisplayName";
import {
  recordFoodPick,
  getFoodPicks,
  getPickRank,
  type FoodPick,
} from "@/lib/foodPicks";
import {
  getFoodGroups,
  addFoodToGroup,
  createFoodGroup,
  type FoodGroup,
  type CustomFoodDef,
} from "@/lib/foodGroups";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const MONO = "var(--font-dm-mono), 'JetBrains Mono', monospace";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";
const ZH = "'Noto Serif SC',serif";
const FIRE_TEXT: CSSProperties = {
  background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const BLABEL: Record<string, string> = {
  breakfast: "SARAPAN",
  lunch: "SIANG",
  snack: "SNACK",
  dinner: "MALAM",
};

type MealT = "breakfast" | "lunch" | "snack" | "dinner";
const MEAL_KEYS: MealT[] = ["breakfast", "lunch", "snack", "dinner"];

const EMOJI_OPTS = ["🍜", "🍽️", "🥡", "☕", "🍔", "🥗", "🔥", "🏪"];

// Common shape shared by library ingredients, session custom foods and
// custom-group foods. All optional fields default to absent.
type BuilderFood = {
  id: string;
  name: string;
  unit: string;
  group: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar?: number;
  zh?: string;
  pinyin?: string;
  englishName?: string;
  foodGroup?: string;
  step?: number;
  gramsPerUnit?: number;
  favorite?: boolean;
};

// One row from /api/foods/search (per-100g values, numbers or null).
type DbFoodRow = {
  sourceCode: string;
  name: string;
  nameEn?: string | null;
  foodGroup?: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
};

type MacroPatch = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
};

type Editing = {
  mode: "edit" | "new";
  id: string | null;
  name: string;
  // Serving totals (what the user sees / eats for this portion).
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  // Portion the totals correspond to, and the per-unit density used to keep
  // grams ↔ kcal ↔ macros consistent. gramsPerUnit is 100 for DB foods.
  grams: number;
  gramsPerUnit: number;
  densityKcal: number;
  densityProtein: number;
  densityCarbs: number;
  densityFat: number;
  groupId?: string | null;
  // Sweetness selector (boba/tea drinks only). sugarFull = g sugar per
  // gramsPerUnit at 100%; sugarPct = chosen level. Undefined = not adjustable.
  sugarFull?: number;
  sugarPct?: number;
};

/** Per-unit macros after applying the chosen sweetness — removes sugar as
 *  4 kcal + 1 carb gram per gram, from the 100%-sweet density. No-op when the
 *  food has no adjustable sugar. */
function sugarAdjustedDensity(e: Editing) {
  const pct = e.sugarPct ?? 100;
  const full = e.sugarFull ?? 0;
  const removed = full * (1 - pct / 100);
  return {
    kcal: Math.max(0, e.densityKcal - removed * 4),
    protein: e.densityProtein,
    carbs: Math.max(0, e.densityCarbs - removed),
    fat: e.densityFat,
    sugarPerUnit: full * (pct / 100),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ─── Category chips ─────────────────────────────────────────────────────────
// Exact 5-bucket palette from the R2FIT-Search reference (bCard()): each
// bucket is a single hex color, with the chip/icon tints derived from it via
// alpha-suffix (color+'1f' / color+'3a' / color+'44') exactly like the source.
// Foods resolve via foodGroup (DB rows, extended to the fuller catalogue) or
// the legacy step-key group (local ingredients).

type Cat = { emoji: string; label: string; color: string };
const CAT_BUCKET: Record<string, Cat> = {
  protein: { emoji: "🥩", label: "PROTEIN", color: "#ff6a4c" },
  carb: { emoji: "🍚", label: "KARBO", color: "#5ac8f5" },
  vegetable: { emoji: "🥦", label: "SAYUR", color: "#5fe39a" },
  extra: { emoji: "✨", label: "EKSTRA", color: "#eab308" },
  drink: { emoji: "🥤", label: "MINUM", color: "#b28bf0" },
};
const CAT_FALLBACK: Cat = { emoji: "🍽️", label: "LAIN", color: "#8a837d" };

// DB foodGroup + legacy step-key → one of the 5 buckets above.
const GROUP_TO_BUCKET: Record<string, keyof typeof CAT_BUCKET> = {
  Daging: "protein",
  "Ikan dsb": "protein",
  Telur: "protein",
  Kacang: "protein",
  "Masakan Nusantara": "protein",
  "Custom/Estimasi": "protein",
  Serealia: "carb",
  Umbi: "carb",
  Sayur: "vegetable",
  Buah: "vegetable",
  Gula: "extra",
  Lemak: "extra",
  Bumbu: "extra",
  "Kue/Dessert": "extra",
  Susu: "drink",
  Minuman: "drink",
  // legacy step-key groups (local ingredients + session customs)
  protein: "protein",
  carb: "carb",
  vegetable: "vegetable",
  extra: "extra",
  drink: "drink",
  custom: "protein",
};

function catFor(f: BuilderFood): Cat {
  const key = (f.foodGroup && GROUP_TO_BUCKET[f.foodGroup]) || GROUP_TO_BUCKET[f.group];
  return (key && CAT_BUCKET[key]) || CAT_FALLBACK;
}

/** Hex + 2-hex-digit alpha suffix (e.g. "#ff6a4c" + "1f" ≈ 12% opacity),
 * exactly the tinting trick the reference uses for chip/icon backgrounds. */
function alpha(hex: string, suffix: string): string {
  return hex + suffix;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/** "1527" → "1.527" (Indonesian thousands separator, like the reference). */
function fmtCount(n: number): string {
  return n.toLocaleString("id-ID");
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease a number up to its target for the "count-up" hero number. */
function useCountUp(target: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion() || target <= 0) {
      setV(target);
      return;
    }
    let raf = 0;
    let cur = 0;
    const tick = () => {
      cur = cur + (target - cur) * 0.14;
      if (Math.abs(target - cur) < 1) {
        setV(target);
        return;
      }
      setV(Math.round(cur));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

// Exact 8-ember composition from the reference (left%, size px, delay s,
// duration s, bottom%, color, glow color).
const EMBERS: [number, number, number, number, number, string, string][] = [
  [12, 5, 0.0, 7.0, 8, "#ffb27a", "#ff8a3d"],
  [24, 4, 0.6, 9.0, 6, "#ff8a52", "#ee3c30"],
  [34, 7, 1.2, 8.0, 9, "#ffd25a", "#ff8a3d"],
  [46, 4, 1.8, 10.0, 5, "#ff9a80", "#ee3c30"],
  [56, 6, 2.4, 7.5, 10, "#ffb27a", "#ff8a3d"],
  [66, 5, 3.0, 9.5, 6, "#ff8a52", "#ee3c30"],
  [76, 4, 3.6, 8.5, 8, "#ffd25a", "#ff8a3d"],
  [88, 6, 4.2, 7.8, 7, "#ff9a80", "#ee3c30"],
];

// −/+ pill buttons inside the running tray.
const trayBtn = (plus: boolean): CSSProperties => ({
  width: 32,
  height: 32,
  flex: "none",
  borderRadius: 999,
  fontSize: 17,
  lineHeight: 1,
  cursor: "pointer",
  color: plus ? "#fff" : "#f1ede9",
  background: plus
    ? "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)"
    : "rgba(255,255,255,.06)",
  border: plus
    ? "1px solid rgba(255,150,120,.5)"
    : "1px solid rgba(255,255,255,.12)",
  boxShadow: plus ? "inset 0 1px 1px rgba(255,225,205,.5)" : "none",
});

export default function FoodBuilder({
  meal,
  dateKey,
  onClose,
  onSaved,
}: {
  meal: MealT;
  dateKey: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  // The meal time is auto-picked from the clock (see MealHome), but stays
  // changeable here via the header chip in case you're logging for another slot.
  const [activeMeal, setActiveMeal] = useState<MealT>(meal);
  const [mealMenuOpen, setMealMenuOpen] = useState(false);
  const [selection, setSelection] = useState<Record<string, number>>({});
  // Which item was just added + a parity counter, so only the freshest tray
  // row animates (alternating trayPop/trayPop2), matching the reference.
  const [justId, setJustId] = useState<string | null>(null);
  const [addTick, setAddTick] = useState(0);
  // Ephemeral "✓ ditambah" confirmation shown after adding from search.
  const [addedFlash, setAddedFlash] = useState<{ name: string; tick: number } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, MacroPatch>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodDef[]>([]);
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    all: true,
  });
  // Browse-all lives behind the floating ⋯ button (search is the hero).
  const [browseOpen, setBrowseOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newGroup, setNewGroup] = useState<{ name: string; emoji: string } | null>(null);
  // DB food-composition search results, plus a session cache so a picked DB
  // food still resolves after the query clears.
  const [dbResults, setDbResults] = useState<BuilderFood[]>([]);
  const [dbCache, setDbCache] = useState<Record<string, BuilderFood>>({});
  // True from the moment a query is typed until its DB results land, so the
  // list can show a loading spinner instead of the previous query's rows.
  const [searching, setSearching] = useState(false);
  // The user's remembered foods (staples), for the "SERING DIPAKAI" quick row
  // and for floating their picks to the top of search.
  const [picks, setPicks] = useState<FoodPick[]>([]);
  // Shared library size for the empty-state hero count.
  const [libCount, setLibCount] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Persisted custom "libraries" load client-side (localStorage).
  useEffect(() => {
    setGroups(getFoodGroups());
  }, []);

  // Library size — the public health endpoint reports the shared Food count.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/hermes/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const n = data?.data?.foodCount;
        if (typeof n === "number" && n > 0) {
          setLibCount(n + INGREDIENTS.length);
        } else {
          setLibCount(INGREDIENTS.length);
        }
      })
      .catch(() => setLibCount(INGREDIENTS.length));
    return () => {
      cancelled = true;
    };
  }, []);

  // Live search against the shared food DB (TKPI + custom + libraries).
  // Debounced; per-100g values map to a "100 g" unit so the qty math and the
  // save path work unchanged.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setDbResults([]);
      setSearching(false);
      return;
    }
    // Flip to "searching" right away so the spinner pops immediately, before the
    // debounce + network, and drop the previous query's DB rows so they never
    // linger under the spinner. (Instant local matches stay — they're correct.)
    setSearching(true);
    setDbResults([]);
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          const rows: DbFoodRow[] = data?.data?.foods ?? [];
          const mapped: BuilderFood[] = rows.map((f) => ({
            id: f.sourceCode,
            name: prettyFoodName(f.name),
            englishName: f.nameEn ?? undefined,
            foodGroup: f.foodGroup ?? undefined,
            unit: "100 g",
            group: "custom",
            kcal: f.energy_kcal ?? 0,
            protein: f.protein_g ?? 0,
            fat: f.fat_g ?? 0,
            carbs: f.carb_g ?? 0,
            gramsPerUnit: 100,
            step: 0.1, // ±10 g nudges (gramsPerUnit 100)
          }));
          setDbResults(mapped);
          setSearching(false);
          setDbCache((c) => {
            const next = { ...c };
            for (const m of mapped) next[m.id] = m;
            return next;
          });
        })
        .catch(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // A remembered pick as a builder food (for rendering + adding without a fresh
  // search — its macros are snapshotted in the pick store).
  const pickToFood = (p: FoodPick): BuilderFood => ({
    id: p.id,
    name: p.name,
    unit: p.unit ?? "100 g",
    group: "custom",
    kcal: p.kcal,
    protein: p.protein,
    fat: p.fat,
    carbs: p.carbs,
    gramsPerUnit: p.gramsPerUnit ?? 100,
    step: p.step ?? 0.1,
  });

  // On mount: load the user's staples and seed the cache so they resolve for
  // add/display even before any search this session.
  useEffect(() => {
    const p = getFoodPicks();
    if (p.length === 0) return;
    setPicks(p);
    setDbCache((c) => {
      const next = { ...c };
      for (const it of p) if (!next[it.id]) next[it.id] = pickToFood(it);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyOv = (f: BuilderFood): BuilderFood =>
    overrides[f.id] ? { ...f, ...overrides[f.id] } : f;

  const groupFoods: BuilderFood[] = groups.reduce<BuilderFood[]>(
    (a, g) => a.concat(g.foods),
    []
  );

  // Resolve any id (library / session custom / group food) with override applied.
  const bIng = (id: string): BuilderFood | null => {
    let base: BuilderFood | undefined =
      INGREDIENTS.find((i) => i.id === id) ||
      customFoods.find((i) => i.id === id) ||
      dbCache[id];
    if (!base) {
      for (const g of groups) {
        const f = g.foods.find((i) => i.id === id);
        if (f) {
          base = f;
          break;
        }
      }
    }
    if (!base) return null;
    return overrides[id] ? { ...base, ...overrides[id] } : base;
  };

  // ---------- selection ----------
  const bAdd = (id: string) => {
    haptic("tap");
    const ing = bIng(id);
    const st = (ing && ing.step) || 1;
    setSelection((sel) => ({
      ...sel,
      [id]: Math.round(((sel[id] || 0) + st) * 1000) / 1000,
    }));
    setJustId(id);
    setAddTick((t) => t + 1);
  };
  // Adding straight from the search list: drop it in the tray, then clear the
  // box and re-focus it so the next food is one search away — no manual delete.
  // Flash a quick "✓ ditambah" so the add is unmistakable.
  const bAddFromSearch = (id: string) => {
    const ing = bIng(id);
    bAdd(id);
    // Remember this pick so it floats to the top next time + fuels "SERING".
    if (ing) {
      recordFoodPick({
        id: ing.id,
        name: ing.name,
        kcal: ing.kcal,
        protein: ing.protein,
        fat: ing.fat,
        carbs: ing.carbs,
        unit: ing.unit,
        gramsPerUnit: ing.gramsPerUnit,
        step: ing.step,
      });
      setPicks(getFoodPicks());
    }
    setQuery("");
    setAddedFlash((f) => ({ name: ing?.name ?? "Makanan", tick: (f?.tick ?? 0) + 1 }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setAddedFlash(null), 1400);
    // Keep the keyboard up so typing the next item is instant.
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  const toggleReveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const bSub = (id: string) => {
    const ing = bIng(id);
    const st = (ing && ing.step) || 1;
    setSelection((sel) => {
      const after = Math.round(((sel[id] || 0) - st) * 1000) / 1000;
      const next = { ...sel };
      if (after <= 0) delete next[id];
      else next[id] = after;
      return next;
    });
  };
  const bRemove = (id: string) =>
    setSelection((sel) => {
      const next = { ...sel };
      delete next[id];
      return next;
    });
  const toggleSection = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // Hardware/browser back mirrors the UI: close an inner sheet first, then
  // the browse layer, and only then leave the builder.
  useSheetBack(true, () => {
    if (editing) {
      setEditing(null);
      return true;
    }
    if (newGroup) {
      setNewGroup(null);
      return true;
    }
    if (browseOpen) {
      setBrowseOpen(false);
      return true;
    }
    onClose();
    return false;
  });

  // ---------- save ----------
  const saveBuilderMeal = () => {
    const items: MealItem[] = [];
    for (const [id, qty] of Object.entries(selection)) {
      if (qty <= 0) continue;
      const ing = bIng(id);
      if (!ing) continue;
      const libIng = INGREDIENTS.find((i) => i.id === id);
      if (libIng && !overrides[id]) {
        // plain library ingredient — reference by id + qty
        items.push({ id, qty });
      } else {
        // overridden ingredient or custom food — snapshot macros
        const g = ing.gramsPerUnit ? ing.gramsPerUnit * qty : qty;
        const item: CustomMealItem = {
          custom: true,
          name: ing.name,
          grams: g,
          kcal: ing.kcal * qty,
          protein: ing.protein * qty,
          fat: ing.fat * qty,
          carbs: ing.carbs * qty,
          ...(ing.sugar != null ? { sugar: ing.sugar * qty } : {}),
        };
        items.push(item);
      }
    }
    if (!items.length) {
      onClose();
      return;
    }
    haptic("success");
    saveMeal({ date: dateKey, mealType: activeMeal, items });
    onSaved?.();
    onClose();
  };

  // ---------- edit / new food ----------
  const openEdit = (id: string) => {
    const ing = bIng(id);
    if (!ing) return;
    // Density = the food's current per-unit (per-100 g for DB foods) macros.
    const gpu = ing.gramsPerUnit ?? 100;
    const curQty = selection[id] || 1; // default to one unit if not yet added
    const grams = round1(curQty * gpu);
    // Adjustable-sweetness drinks: baseline sugar per unit at 100% (DB drinks
    // are per-100 with gpu 100, so the per-100 value maps straight through).
    const sf = drinkSugarFull(id);
    const sugarFull = sf != null ? (sf * gpu) / 100 : undefined;
    setEditing({
      mode: "edit",
      id,
      name: ing.name,
      grams,
      gramsPerUnit: gpu,
      densityKcal: ing.kcal,
      densityProtein: ing.protein,
      densityCarbs: ing.carbs,
      densityFat: ing.fat,
      kcal: round1(ing.kcal * curQty),
      protein: round1(ing.protein * curQty),
      carbs: round1(ing.carbs * curQty),
      fat: round1(ing.fat * curQty),
      sugarFull,
      sugarPct: sugarFull != null ? 100 : undefined,
    });
  };
  const openNewFood = (groupId: string | null = null) =>
    setEditing({
      mode: "new",
      id: null,
      name: "",
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      grams: 100,
      gramsPerUnit: 100,
      densityKcal: 0,
      densityProtein: 0,
      densityCarbs: 0,
      densityFat: 0,
      groupId,
    });

  // Portion is the anchor: typing grams recomputes kcal + macros from density.
  const editSetGrams = (grams: number) =>
    setEditing((e) => {
      if (!e) return e;
      const g = Math.max(0, Math.min(5000, grams));
      const f = g / (e.gramsPerUnit || 100);
      const d = sugarAdjustedDensity(e);
      return {
        ...e,
        grams: g,
        kcal: round1(d.kcal * f),
        protein: round1(d.protein * f),
        carbs: round1(d.carbs * f),
        fat: round1(d.fat * f),
      };
    });
  // Pick a sweetness level for boba/tea drinks; recompute the serving from the
  // current grams with sugar removed.
  const editSetSugarPct = (pct: number) =>
    setEditing((e) => {
      if (!e) return e;
      const next = { ...e, sugarPct: pct };
      const f = e.grams / (e.gramsPerUnit || 100);
      const d = sugarAdjustedDensity(next);
      return {
        ...next,
        kcal: round1(d.kcal * f),
        protein: round1(d.protein * f),
        carbs: round1(d.carbs * f),
        fat: round1(d.fat * f),
      };
    });
  // Editing total calories back-solves grams at the current density, then
  // rescales macros. If energy is unknown (density 0), just set kcal.
  const editSetKcal = (kcal: number) =>
    setEditing((e) => {
      if (!e) return e;
      const k = Math.max(0, kcal);
      if (e.densityKcal > 0) {
        const g = Math.min(5000, (k / e.densityKcal) * (e.gramsPerUnit || 100));
        const f = g / (e.gramsPerUnit || 100);
        return {
          ...e,
          kcal: k,
          grams: round1(g),
          protein: round1(e.densityProtein * f),
          carbs: round1(e.densityCarbs * f),
          fat: round1(e.densityFat * f),
        };
      }
      return { ...e, kcal: k };
    });
  // Set a serving field directly (used for macros in both modes, and for kcal
  // in "new food" mode where there's no density to back-solve from).
  const editSetField = (
    key: "kcal" | "protein" | "carbs" | "fat",
    val: number
  ) => setEditing((e) => (e ? { ...e, [key]: Math.max(0, val) } : e));
  const editSave = () => {
    // Snapshot the sheet before the state update so we can share a newly created
    // food to the community catalogue without running a side effect inside the
    // setEditing reducer (which React may invoke twice in dev).
    const snap = editing;
    if (snap && snap.mode === "new" && snap.name.trim() && snap.kcal > 0) {
      const grams = snap.gramsPerUnit || 100;
      const f = 100 / grams;
      contributeFood(
        snap.name.trim(),
        {
          kcal: round1(snap.kcal * f),
          protein: round1(snap.protein * f),
          fat: round1(snap.fat * f),
          carbs: round1(snap.carbs * f),
        },
        grams
      );
    }
    setEditing((e) => {
      if (!e) return null;
      if (e.mode === "edit" && e.id) {
        const gpu = e.gramsPerUnit || 100;
        const qty = e.grams > 0 ? Math.round((e.grams / gpu) * 1000) / 1000 : 0;
        if (qty <= 0) return null;
        const id = e.id;
        // Per-unit sugar at the chosen sweetness (only for adjustable drinks).
        const sugarPerUnit =
          e.sugarFull != null ? sugarAdjustedDensity(e).sugarPerUnit : null;
        // Store per-unit macros (serving ÷ qty) so the tray's `macro × qty`
        // math reproduces exactly the serving the user configured.
        setOverrides((ov) => ({
          ...ov,
          [id]: {
            name: e.name,
            kcal: e.kcal / qty,
            protein: e.protein / qty,
            carbs: e.carbs / qty,
            fat: e.fat / qty,
            ...(sugarPerUnit != null ? { sugar: sugarPerUnit } : {}),
          },
        }));
        // Reflect the chosen portion in the selection (adds it if not present).
        setSelection((sel) => ({ ...sel, [id]: qty }));
        return null;
      }
      // new custom food
      const id = "custom-" + crypto.randomUUID();
      const food: CustomFoodDef = {
        id,
        name: e.name || "Makanan baru",
        unit: "1 porsi",
        group: "custom",
        kcal: e.kcal,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
      };
      setSelection((sel) => ({ ...sel, [id]: 1 }));
      if (e.groupId) {
        const gid = e.groupId;
        addFoodToGroup(gid, food); // persist
        setGroups((gs) =>
          gs.map((g) => (g.id === gid ? { ...g, foods: [...g.foods, food] } : g))
        );
        setCollapsed((c) => ({ ...c, [gid]: false }));
      } else {
        setCustomFoods((cf) => [...cf, food]);
      }
      return null;
    });
  };

  // ---------- new group ----------
  const openNewGroup = () => setNewGroup({ name: "", emoji: "🍜" });
  const saveNewGroup = () => {
    if (!newGroup || !newGroup.name.trim()) {
      setNewGroup(null);
      return;
    }
    const g = createFoodGroup(newGroup.name, newGroup.emoji); // persist
    setGroups((gs) => [...gs, g]);
    setCollapsed((c) => ({ ...c, [g.id]: false }));
    setNewGroup(null);
    setEditing({
      mode: "new",
      id: null,
      name: "",
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      grams: 100,
      gramsPerUnit: 100,
      densityKcal: 0,
      densityProtein: 0,
      densityCarbs: 0,
      densityFat: 0,
      groupId: g.id,
    });
  };

  // ---------- derived ----------
  const merged: BuilderFood[] = (INGREDIENTS as BuilderFood[])
    .concat(customFoods)
    .concat(groupFoods)
    .map(applyOv);
  const q = query.trim().toLowerCase();
  const match = (i: BuilderFood) =>
    !q ||
    i.name.toLowerCase().includes(q) ||
    (!!i.zh && i.zh.includes(q)) ||
    (!!i.pinyin && i.pinyin.toLowerCase().includes(q));

  // Search results — one flat, ranked list: local library matches lead, DB
  // hits (already score-ranked by the API) follow. Then the user's own staples
  // that match the query are floated to the very top (most-used first), so what
  // you actually eat is one tap away.
  const searchFlatRaw: BuilderFood[] = q
    ? merged.filter(match).concat(dbResults)
    : [];
  const searchFlat: BuilderFood[] = (() => {
    if (!q) return searchFlatRaw;
    const rank = getPickRank();
    // Stable partition: picked matches first (by staple rank), then the rest,
    // de-duped by id so a food doesn't appear twice.
    const seen = new Set<string>();
    const picked: BuilderFood[] = [];
    const rest: BuilderFood[] = [];
    for (const f of searchFlatRaw) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      (rank.has(f.id) ? picked : rest).push(f);
    }
    picked.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    return picked.concat(rest);
  })();
  const searchResultCount = searchFlat.length;

  // Browse-all sections (behind ⋯): favorites, each custom library group and
  // the whole local catalogue — no step scoping anymore.
  type Section = {
    key: string;
    chev: string;
    emoji: string;
    name: string;
    countLabel: string;
    open: boolean;
    canAdd: boolean;
    onToggle: () => void;
    onAddFood: () => void;
    items: BuilderFood[];
  };
  const mk = (
    key: string,
    emoji: string,
    name: string,
    list: BuilderFood[],
    canAdd: boolean,
    gid: string | null
  ): Section => {
    const open = !collapsed[key];
    const sc = list.filter((x) => (selection[x.id] || 0) > 0).length;
    return {
      key,
      chev: open ? "▾" : "▸",
      emoji,
      name,
      countLabel: sc > 0 ? `${sc} dipilih` : String(list.length),
      open,
      canAdd,
      onToggle: () => toggleSection(key),
      onAddFood: gid ? () => openNewFood(gid) : () => {},
      items: open ? list.map(applyOv) : [],
    };
  };
  const favs = (INGREDIENTS as BuilderFood[]).filter((i) => i.favorite);
  const nonFavs = (INGREDIENTS as BuilderFood[])
    .filter((i) => !i.favorite)
    .concat(customFoods);
  const browseSections: Section[] = [];
  browseSections.push(mk("usual", "⭐", "USUAL KAMU", favs, false, null));
  for (const g of groups) {
    browseSections.push(mk(g.id, g.emoji, g.name, g.foods, true, g.id));
  }
  browseSections.push(mk("all", "🍽️", "SEMUA MAKANAN", nonFavs, false, null));

  // ---------- totals ----------
  let tk = 0,
    tp = 0,
    tc = 0,
    tf = 0;
  for (const [id, qty] of Object.entries(selection)) {
    if (qty <= 0) continue;
    const ing = bIng(id);
    if (!ing) continue;
    tk += ing.kcal * qty;
    tp += ing.protein * qty;
    tc += ing.carbs * qty;
    tf += ing.fat * qty;
  }
  const count = Object.values(selection).filter((x) => x > 0).length;

  // The running tray — every selected item, resolved with overrides.
  const traySelected = Object.keys(selection)
    .filter((id) => (selection[id] || 0) > 0)
    .map((id) => {
      const ing = bIng(id);
      return ing ? { id, ing, qty: selection[id] } : null;
    })
    .filter((x): x is { id: string; ing: BuilderFood; qty: number } => !!x);

  const shownLibCount = useCountUp(libCount ?? 0);
  const emptyState = !q && count === 0 && !browseOpen;

  // ---------- search-result row (reference bCard(): icon tile + category ----
  // chip + serving/kcal + add — no hanzi/edit clutter, that's for browse only.
  const renderResultRow = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const qty = selection[id] || 0;
    const inCart = qty > 0;
    const cat = catFor(ing);
    return (
      <div
        key={id}
        onClick={() => bAddFromSearch(id)}
        style={{
          position: "relative",
          borderRadius: 12,
          padding: "11px 13px",
          cursor: "pointer",
          transition: "border-color .2s",
          background: inCart
            ? "linear-gradient(180deg,rgba(255,138,60,.06),transparent 55%),#0c0a0b"
            : "#0c0a0b",
          border: inCart
            ? "1px solid rgba(255,138,60,.4)"
            : "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {/* category icon tile */}
          <div
            style={{
              width: 38,
              height: 38,
              flex: "none",
              borderRadius: 11,
              display: "grid",
              placeItems: "center",
              fontSize: 19,
              background: alpha(cat.color, "18"),
              border: `1px solid ${alpha(cat.color, "3a")}`,
            }}
          >
            {cat.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14.5,
                  color: "#f8ede8",
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ing.name}
              </span>
              {inCart ? (
                <span
                  style={{
                    flex: "none",
                    fontFamily: MONO,
                    fontSize: 9,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "rgba(238,60,48,.18)",
                    color: "#ff8a72",
                  }}
                >
                  ×{qty}
                </span>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginTop: 5,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  flex: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: ".08em",
                  color: cat.color,
                  background: alpha(cat.color, "1f"),
                  border: `1px solid ${alpha(cat.color, "44")}`,
                }}
              >
                {cat.emoji} {cat.label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: "#8a837d",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {ing.unit} · <span style={{ color: "#ff9a80" }}>{Math.round(ing.kcal)} kkal</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Tambah ${ing.name}`}
            onClick={(ev) => {
              ev.stopPropagation();
              bAddFromSearch(id);
            }}
            style={{
              width: 34,
              height: 34,
              flex: "none",
              borderRadius: 10,
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              color: "#fff",
              background: "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)",
              border: "1px solid rgba(255,150,120,.5)",
              boxShadow:
                "inset 0 1px 1px rgba(255,225,205,.5),0 5px 12px rgba(238,60,48,.4)",
            }}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  // ---------- browse row (reference: detailed card with hanzi reveal + edit,
  // used only inside the collapsed "browse-all" library, not search results) --
  const renderBrowseRow = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const qty = selection[id] || 0;
    const inCart = qty > 0;
    const isRevealed = !!revealed[id] && !!ing.zh;
    const showZi = !!ing.zh;
    const macroLine = `${Math.round(ing.protein)}p · ${Math.round(
      ing.carbs
    )}c · ${Math.round(ing.fat)}f`;
    return (
      <div
        key={id}
        onClick={() => bAdd(id)}
        style={{
          borderRadius: 14,
          padding: "13px 14px",
          cursor: "pointer",
          background:
            "linear-gradient(180deg,rgba(255,255,255,.045),transparent 40%),#0d0b0c",
          border: inCart
            ? "1px solid rgba(255,138,60,.4)"
            : "1px solid rgba(255,255,255,.09)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 14,
                color: "#f1ede9",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ing.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: "#8a837d",
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ing.unit} <span style={{ color: "#5a5551" }}>·</span>{" "}
              <span style={{ color: "#ff8a72" }}>{Math.round(ing.kcal)} kkal</span>{" "}
              <span style={{ color: "#6a6660" }}>· {macroLine}</span>
            </div>
            {isRevealed ? (
              <div
                style={{
                  marginTop: 4,
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: "#8a837d",
                }}
              >
                <span style={{ fontFamily: ZH, fontSize: 12, color: "#cfc8c2" }}>
                  {ing.zh}
                </span>{" "}
                {ing.pinyin}
              </div>
            ) : null}
          </div>
          {inCart ? (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                padding: "3px 7px",
                borderRadius: 999,
                background: "rgba(238,60,48,.15)",
                color: "#ff8a72",
                flex: "none",
              }}
            >
              ×{qty}
            </span>
          ) : null}
          {showZi ? (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                toggleReveal(id);
              }}
              style={{
                width: 28,
                height: 28,
                flex: "none",
                borderRadius: 8,
                fontFamily: ZH,
                fontSize: 12,
                cursor: "pointer",
                background: isRevealed ? "rgba(255,138,60,.12)" : "transparent",
                border: isRevealed
                  ? "1px solid rgba(255,138,60,.6)"
                  : "1px solid rgba(255,255,255,.1)",
                color: isRevealed ? "#ff8a3d" : "rgba(255,255,255,.4)",
              }}
            >
              字
            </button>
          ) : null}
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              openEdit(id);
            }}
            style={{
              width: 28,
              height: 28,
              flex: "none",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
              background: "transparent",
              border: "1px solid rgba(255,255,255,.1)",
              color: "rgba(255,255,255,.4)",
            }}
          >
            ✎
          </button>
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              bAdd(id);
            }}
            style={{
              width: 30,
              height: 30,
              flex: "none",
              borderRadius: 9,
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              color: "#fff",
              background: "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)",
              border: "1px solid rgba(255,150,120,.5)",
              boxShadow:
                "inset 0 1px 1px rgba(255,225,205,.5),0 4px 10px rgba(238,60,48,.35)",
            }}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  // Collapsible browse section (header + rows).
  const renderSection = (sec: Section) => (
    <div key={sec.key} style={{ marginBottom: 4 }}>
      <div
        onClick={sec.onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "11px 3px",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#8a837d",
            width: 11,
            flex: "none",
          }}
        >
          {sec.chev}
        </span>
        <span style={{ fontSize: 14 }}>{sec.emoji}</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".14em",
            color: "#cfc8c2",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sec.name}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            color: "#6a6660",
            flex: "none",
          }}
        >
          {sec.countLabel}
        </span>
        {sec.canAdd ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              sec.onAddFood();
            }}
            style={{
              flex: "none",
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".05em",
              padding: "5px 9px",
              borderRadius: 8,
              cursor: "pointer",
              color: "#ff8a72",
              background: "rgba(238,60,48,.08)",
              border: "1px solid rgba(238,60,48,.3)",
            }}
          >
            + FOOD
          </button>
        ) : null}
      </div>
      {sec.open ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 7,
            margin: "1px 0 14px",
          }}
        >
          {sec.items.map(renderBrowseRow)}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {/* ============ FOOD BUILDER (single screen) ============ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background:
            "radial-gradient(720px 520px at 50% -10%, #17100f, #0a0809 55%, #070608)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ambient fire — 3 drifting auroras + 2 pulsing base-glows + 8 rising
            embers, empty state only. Exact composition from the reference. */}
        {emptyState ? (
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
          >
            <div style={{ position: "absolute", top: "8%", left: "22%", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(238,60,48,.4),transparent 66%)", filter: "blur(48px)", animation: "auroraDrift 11s ease-in-out infinite" }} />
            <div style={{ position: "absolute", top: "26%", left: "42%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,138,60,.32),transparent 64%)", filter: "blur(46px)", animation: "auroraDrift2 14s ease-in-out infinite" }} />
            <div style={{ position: "absolute", bottom: "2%", left: "-6%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,90,60,.2),transparent 66%)", filter: "blur(50px)", animation: "auroraDrift 17s ease-in-out infinite" }} />
            <div style={{ position: "absolute", left: "-10%", right: "-10%", bottom: "-8%", height: 300, background: "radial-gradient(120% 100% at 50% 100%,rgba(255,120,50,.42),rgba(238,60,48,.24) 38%,transparent 72%)", filter: "blur(28px)", transformOrigin: "50% 100%", animation: "fireBase 3.4s ease-in-out infinite" }} />
            <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "-6%", height: 190, background: "radial-gradient(100% 100% at 50% 100%,rgba(255,196,90,.4),rgba(255,120,50,.22) 44%,transparent 74%)", filter: "blur(20px)", transformOrigin: "50% 100%", animation: "fireBase 2.6s ease-in-out .5s infinite" }} />
            {EMBERS.map(([left, size, delay, dur, bottom, bg, glow], i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  bottom: `${bottom}%`,
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  background: bg,
                  boxShadow: `0 0 ${size + 4}px ${glow}`,
                  animation: `emberRise ${dur}s ease-in ${delay}s infinite`,
                }}
              />
            ))}
          </div>
        ) : null}

        {/* header */}
        <div style={{ position: "relative", zIndex: 1, padding: "42px 18px 6px 18px", flex: "none" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".06em",
                color: "#9a938d",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← MAKAN
            </button>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMealMenuOpen((v) => !v)}
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".14em",
                  color: "#ff8a72",
                  background: "rgba(255,138,60,.1)",
                  border: "1px solid rgba(255,138,60,.32)",
                  borderRadius: 8,
                  padding: "4px 9px",
                  cursor: "pointer",
                }}
              >
                {BLABEL[activeMeal]} ▾
              </button>
              {mealMenuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "130%",
                    left: 0,
                    zIndex: 30,
                    minWidth: 130,
                    padding: 4,
                    borderRadius: 10,
                    background: "#161011",
                    border: "1px solid rgba(255,255,255,.12)",
                    boxShadow: "0 12px 28px rgba(0,0,0,.55)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {MEAL_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setActiveMeal(k);
                        setMealMenuOpen(false);
                        haptic("tap");
                      }}
                      style={{
                        textAlign: "left",
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: ".08em",
                        padding: "8px 10px",
                        borderRadius: 7,
                        cursor: "pointer",
                        color: k === activeMeal ? "#ff8a72" : "#cfc8c2",
                        background:
                          k === activeMeal ? "rgba(255,138,60,.12)" : "transparent",
                        border: "none",
                      }}
                    >
                      {BLABEL[k]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 14,
            }}
          >
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "-.01em",
                color: "#f1ede9",
              }}
            >
              CATAT
            </span>
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, ...FIRE_TEXT }}>
              MAKAN
            </span>
          </div>
        </div>

        {/* scroll area — centers the hero+search vertically while idle,
            matching the reference's bScrollStyle toggle. */}
        <div
          style={
            emptyState
              ? {
                  position: "relative",
                  zIndex: 1,
                  flex: 1,
                  overflowY: "auto",
                  overflowX: "hidden",
                  padding: "6px 18px 118px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }
              : {
                  position: "relative",
                  zIndex: 1,
                  flex: 1,
                  overflowY: "auto",
                  overflowX: "hidden",
                  padding: "10px 18px 170px 18px",
                }
          }
        >
          {/* ── RUNNING TRAY — what you've eaten, live totals ── */}
          {count > 0 ? (
            <div
              style={{
                borderRadius: 18,
                padding: 15,
                marginBottom: 18,
                background:
                  "linear-gradient(180deg,rgba(255,138,60,.07),transparent 42%),#0c0a0b",
                border: "1px solid rgba(255,138,60,.24)",
                boxShadow:
                  "0 14px 34px rgba(0,0,0,.45),0 0 22px rgba(238,60,48,.08)",
                animation: "trayPop .34s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: ".12em",
                    color: "#6a6660",
                  }}
                >
                  {count} ITEM
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span
                    key={Math.round(tk)}
                    style={{
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 38,
                      color: "#ffe9d6",
                      lineHeight: 1,
                      animation: "totalKick .4s ease-out",
                    }}
                  >
                    {Math.round(tk)}
                  </span>
                  <span
                    style={{
                      fontFamily: SANS,
                      fontWeight: 600,
                      fontSize: 14,
                      color: "#7c736e",
                    }}
                  >
                    kkal
                  </span>
                </div>
                {/* protein / carbs / fat stat block */}
                <div
                  style={{
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 13px",
                    borderRadius: 12,
                    fontFamily: MONO,
                    fontSize: 11.5,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.09)",
                  }}
                >
                  <span>
                    <span style={{ color: "#5fe39a" }}>{Math.round(tp)}</span>
                    <span style={{ color: "#6a6660" }}>p</span>
                  </span>
                  <span>
                    <span style={{ color: "#9a938d" }}>{Math.round(tc)}</span>
                    <span style={{ color: "#6a6660" }}>c</span>
                  </span>
                  <span>
                    <span style={{ color: "#9a938d" }}>{Math.round(tf)}</span>
                    <span style={{ color: "#6a6660" }}>f</span>
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  marginTop: 13,
                  maxHeight: 218,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                {traySelected.map(({ id, ing, qty }) => {
                  const grams = ing.gramsPerUnit
                    ? Math.round(ing.gramsPerUnit * qty)
                    : null;
                  // Exact reference formula (bTrayItems): "macro" is always
                  // "{protein}g protein · {kcal} kkal"; "sub" folds in grams
                  // when the food has a known per-unit weight, else falls
                  // back to carbs/fat only.
                  const macro = `${Math.round(ing.protein * qty)}g protein · ${Math.round(
                    ing.kcal * qty
                  )} kkal`;
                  const sub =
                    grams != null
                      ? `${grams}g · ${Math.round(ing.carbs * qty)}c ${Math.round(ing.fat * qty)}f`
                      : `${Math.round(ing.carbs * qty)}c · ${Math.round(ing.fat * qty)}f`;
                  const isJust = id === justId;
                  const popAnim = addTick % 2 ? "trayPop" : "trayPop2";
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 11px",
                        borderRadius: 12,
                        background: "#130d0c",
                        border: "1px solid rgba(255,138,60,.2)",
                        animation: isJust
                          ? `${popAnim} .42s cubic-bezier(.16,1,.3,1)`
                          : "none",
                      }}
                    >
                      {/* Tap the name to fine-tune portion / calories. */}
                      <button
                        type="button"
                        onClick={() => openEdit(id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontFamily: SANS,
                            fontWeight: 700,
                            fontSize: 13.5,
                            color: "#f8ede8",
                            lineHeight: 1.15,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ing.name}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontFamily: MONO,
                            fontSize: 9,
                            marginTop: 3,
                            color: "#ff9a80",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {macro}
                          <span style={{ color: "#7c736e" }}> · {sub}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Kurangi"
                        onClick={() => bSub(id)}
                        style={trayBtn(false)}
                      >
                        −
                      </button>
                      {/* Tap to type an exact portion (grams) instead of
                          nudging by steps. Shows grams for weight-based foods,
                          else the ×N multiplier. */}
                      <button
                        type="button"
                        onClick={() => openEdit(id)}
                        aria-label="Ubah gram"
                        style={{
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 11.5,
                          color: "#ffb39e",
                          minWidth: 40,
                          textAlign: "center",
                          lineHeight: 1,
                          padding: "6px 7px",
                          borderRadius: 8,
                          cursor: "pointer",
                          background: "rgba(255,138,60,.1)",
                          border: "1px solid rgba(255,138,60,.3)",
                        }}
                      >
                        {grams != null ? `${grams}g` : `×${qty}`}
                      </button>
                      <button
                        type="button"
                        aria-label="Tambah"
                        onClick={() => bAdd(id)}
                        style={trayBtn(true)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => bRemove(id)}
                        aria-label="Hapus"
                        style={{
                          width: 26,
                          height: 26,
                          flex: "none",
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: "pointer",
                          background: "transparent",
                          border: "none",
                          color: "#6a6660",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── EMPTY-STATE HERO — library size + hint ── */}
          {emptyState ? (
            <div style={{ textAlign: "center", padding: "0 10px" }}>
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 44,
                  lineHeight: 1,
                  letterSpacing: "-.03em",
                  ...FIRE_TEXT,
                }}
              >
                {libCount == null ? "…" : fmtCount(shownLibCount)}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: 14,
                  letterSpacing: ".01em",
                  color: "#cfc8c2",
                  marginTop: 3,
                }}
              >
                makanan di library
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".1em",
                  color: "#7c736e",
                  marginTop: 9,
                }}
              >
                TINGGAL KETIK
              </div>
            </div>
          ) : null}

          {/* ── HERO SEARCH — glowing wrapper + sweeping highlight (reference) ── */}
          <div
            style={{
              position: "relative",
              marginTop: emptyState ? 22 : 14,
              borderRadius: 20,
              overflow: "hidden",
              animation: "searchGlow 2.8s ease-in-out infinite",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 19,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 17,
                pointerEvents: "none",
                zIndex: 2,
                opacity: 0.85,
              }}
            >
              🔎
            </span>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "45%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 1,
                background:
                  "linear-gradient(105deg,transparent,rgba(255,180,120,.14),transparent)",
                animation: "searchSweep 4.5s ease-in-out infinite",
              }}
            />
            <input
              ref={searchRef}
              type="text"
              className="fb-search-input"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Cari makanan — ayam, nasi, kopi…"
              style={{
                position: "relative",
                zIndex: 1,
                width: "100%",
                boxSizing: "border-box",
                minHeight: 58,
                padding: "19px 18px 19px 52px",
                borderRadius: 20,
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: 17,
                color: "#fff",
                // Clearly a field: a lit fill + visible ember border so it never
                // reads as empty background on an all-black screen.
                background:
                  "linear-gradient(180deg,rgba(255,138,60,.14),rgba(34,23,20,.96))",
                border: "1px solid rgba(255,150,120,.45)",
                outline: "none",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
          </div>

          {/* "✓ ditambah" flash — pops after adding from search, then fades. */}
          {addedFlash && (
            <div
              key={addedFlash.tick}
              aria-live="polite"
              style={{
                position: "fixed",
                top: "calc(20px + env(safe-area-inset-top))",
                left: "50%",
                zIndex: 150,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 999,
                background: "linear-gradient(180deg,#241610,#150e0c)",
                border: "1px solid rgba(255,150,120,.4)",
                boxShadow: "0 14px 34px rgba(0,0,0,.5)",
                pointerEvents: "none",
                animation: "foodAddedFlash 1.4s cubic-bezier(.16,1,.3,1) both",
              }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 20,
                  height: 20,
                  flex: "none",
                  borderRadius: 999,
                  background: "linear-gradient(180deg,#5fe39a,#2fb872)",
                  color: "#06120b",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                ✓
              </span>
              <span
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 13,
                  color: "#fff",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {addedFlash.name}{" "}
                <span style={{ color: "#9a938d", fontWeight: 500 }}>ditambah</span>
              </span>
            </div>
          )}

          {/* ── SERING DIPAKAI — the user's staples, one tap to log ── */}
          {!q && !browseOpen && picks.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".16em",
                  color: "#6a6660",
                  margin: "16px 0 10px",
                }}
              >
                ⭐ SERING DIPAKAI
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {picks.slice(0, 6).map((p) => renderResultRow(pickToFood(p)))}
              </div>
            </>
          ) : null}

          {/* ── SEARCH RESULTS — flat ranked rows ── */}
          {q ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".16em",
                  color: "#6a6660",
                  margin: "16px 0 10px",
                }}
              >
                {searching ? (
                  <>
                    <span className="fb-spinner" aria-hidden="true" />
                    <span style={{ color: "#ff9a80" }}>MENCARI…</span>
                  </>
                ) : (
                  <span>// {searchResultCount} HASIL</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {searchFlat.map(renderResultRow)}
              </div>
              {searchResultCount === 0 && searching ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    padding: "34px 10px",
                  }}
                >
                  <span className="fb-spinner fb-spinner-lg" aria-hidden="true" />
                  <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: "#7c736e" }}>
                    MENCARI…
                  </span>
                </div>
              ) : searchResultCount === 0 ? (
                <div style={{ textAlign: "center", padding: "26px 10px" }}>
                  <div
                    style={{ fontFamily: MONO, fontSize: 11, color: "#7c736e" }}
                  >
                    Ga ketemu &ldquo;{query}&rdquo;
                  </div>
                  <button
                    type="button"
                    onClick={() => openNewFood(null)}
                    style={{
                      marginTop: 12,
                      fontFamily: MONO,
                      fontSize: 10,
                      padding: "9px 14px",
                      borderRadius: 10,
                      cursor: "pointer",
                      color: "#ff8a72",
                      background: "rgba(238,60,48,.08)",
                      border: "1px solid rgba(238,60,48,.35)",
                    }}
                  >
                    + TAMBAH MANUAL
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ── BROWSE ALL (behind the ⋯ button) ── */}
          {browseOpen ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  margin: "18px 0 4px",
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: ".16em",
                    color: "#6a6660",
                  }}
                >
                  // LIBRARY KAMU
                </span>
                <button
                  type="button"
                  onClick={() => setBrowseOpen(false)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: ".06em",
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: "#8a837d",
                    background: "none",
                    border: "none",
                  }}
                >
                  TUTUP ▴
                </button>
              </div>
              {browseSections.map(renderSection)}
              <button
                type="button"
                onClick={openNewGroup}
                style={{
                  width: "100%",
                  marginTop: 2,
                  padding: 13,
                  borderRadius: 13,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  cursor: "pointer",
                  color: "#9a938d",
                  background: "transparent",
                  border: "1px dashed rgba(255,255,255,.16)",
                }}
              >
                + GRUP BARU · SIMPAN KE LIBRARY
              </button>
            </>
          ) : null}
        </div>

        {/* floating ⋯ (browse all) + ＋ (add manual) — reference: bottom-right,
            hidden while an active search query is present (bNoQuery). */}
        {!q ? (
          <div
            style={{
              position: "absolute",
              right: 18,
              bottom: 96,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              zIndex: 5,
            }}
          >
            <button
              type="button"
              aria-label="Jelajahi semua makanan"
              onClick={() => {
                haptic("tap");
                setBrowseOpen((v) => !v);
              }}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
                color: browseOpen ? "#ff8a72" : "#cfc8c2",
                background: browseOpen
                  ? "linear-gradient(180deg,rgba(255,138,60,.16),rgba(255,138,60,.03))"
                  : "linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.02))",
                border: browseOpen
                  ? "1px solid rgba(255,138,60,.45)"
                  : "1px solid rgba(255,255,255,.16)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.1),0 8px 18px rgba(0,0,0,.4)",
              }}
            >
              ⋯
            </button>
            <button
              type="button"
              aria-label="Tambah makanan manual"
              onClick={() => {
                haptic("tap");
                openNewFood(null);
              }}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                fontSize: 26,
                lineHeight: 1,
                cursor: "pointer",
                color: "#fff",
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                boxShadow:
                  "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 26px rgba(238,60,48,.5)",
              }}
            >
              ＋
            </button>
          </div>
        ) : null}

        {/* bottom bar — BATAL + SIMPAN (reference).
            zIndex must clear the scroll container (z1) and floating buttons
            (z5): the scroll container is flex:1 and its box (incl. its empty
            bottom padding) overlaps this bar, so without a higher z-index it
            paints on top and swallows every tap on SIMPAN. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            padding: "16px 16px calc(22px + env(safe-area-inset-bottom)) 16px",
            background: "linear-gradient(180deg,rgba(7,6,8,0),#070608 30%)",
          }}
        >
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: "none",
                padding: "15px 20px",
                borderRadius: 14,
                fontFamily: MONO,
                fontSize: 12,
                cursor: "pointer",
                color: "#9a938d",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              BATAL
            </button>
            <button
              type="button"
              onClick={saveBuilderMeal}
              style={{
                flex: 1,
                position: "relative",
                overflow: "hidden",
                padding: 15,
                borderRadius: 14,
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 15,
                color: "#fff",
                cursor: "pointer",
                background: FIRE,
                border: "1px solid rgba(255,150,120,.6)",
                boxShadow:
                  "inset 0 1.5px 1px rgba(255,225,205,.7),0 12px 26px rgba(238,60,48,.45)",
                textShadow: "0 1px 2px rgba(120,15,5,.5)",
                opacity: count > 0 ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: "-55%",
                  width: "55%",
                  height: "100%",
                  background:
                    "linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent)",
                  animation: "btnSheen 5.5s ease-in-out infinite",
                }}
              />
              <span style={{ position: "relative" }}>
                SIMPAN ✓{count > 0 ? ` · ${Math.round(tk)} KKAL` : ""}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* food edit / new sheet */}
      {editing ? (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 215,
            background: "rgba(5,4,6,.74)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              borderRadius: "26px 26px 42px 42px",
              padding: "22px 20px 30px 20px",
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "#f5f2ef",
              }}
            >
              {editing.mode === "edit" ? "EDIT MAKANAN" : "MAKANAN BARU"}
            </div>
            <input
              type="text"
              value={editing.name}
              onChange={(ev) =>
                setEditing((e) => (e ? { ...e, name: ev.target.value } : e))
              }
              placeholder="Nama makanan"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 14,
                padding: "13px 15px",
                borderRadius: 13,
                fontFamily: SANS,
                fontSize: 15,
                color: "#f1ede9",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
                outline: "none",
              }}
            />
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".14em",
                color: "#6a6660",
                margin: "18px 0 10px",
              }}
            >
              {editing.mode === "edit" ? "PORSI & GIZI" : "PER PORSI"}
            </div>
            {editing.mode === "edit" && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: "#6a6660",
                  marginBottom: 12,
                  lineHeight: 1.4,
                }}
              >
                Ubah PORSI atau KALORI — sisanya dihitung otomatis. Ketik angka
                berapa pun (mis. 300, 30).
              </div>
            )}
            {editing.mode === "new" && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: "#6a6660",
                  marginBottom: 12,
                  lineHeight: 1.4,
                }}
              >
                Isi berat 1 porsi + gizinya. Makanan ini otomatis masuk ke
                database bersama — biar semua orang bisa cari juga. 🤝
              </div>
            )}
            {editing.sugarFull != null ? (
              <div style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: ".12em",
                    color: "#7c736e",
                  }}
                >
                  KADAR GULA
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {SUGAR_LEVELS.map((lvl) => {
                    const active = (editing.sugarPct ?? 100) === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => editSetSugarPct(lvl)}
                        style={{
                          flex: 1,
                          padding: "9px 0",
                          borderRadius: 10,
                          fontFamily: MONO,
                          fontSize: 12,
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          color: active ? "#fff" : "#9a938d",
                          background: active
                            ? FIRE
                            : "rgba(255,255,255,.04)",
                          border: active
                            ? "1px solid rgba(255,150,120,.6)"
                            : "1px solid rgba(255,255,255,.1)",
                        }}
                      >
                        {lvl}%
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {(() => {
              const e = editing;
              type Row = {
                label: string;
                val: number;
                step: number;
                onStep: (d: number) => void;
                onSet: (n: number) => void;
              };
              const rows: Row[] = [];
              if (e.mode === "edit") {
                rows.push({
                  label: e.gramsPerUnit === 100 ? "PORSI (g)" : "PORSI",
                  val: round1(e.grams),
                  step: e.gramsPerUnit === 100 ? 10 : 0.5,
                  onStep: (d) =>
                    editSetGrams(
                      e.grams + d * (e.gramsPerUnit === 100 ? 10 : 0.5)
                    ),
                  onSet: editSetGrams,
                });
                rows.push({
                  label: "KALORI",
                  val: Math.round(e.kcal),
                  step: 10,
                  onStep: (d) => editSetKcal(e.kcal + d * 10),
                  onSet: editSetKcal,
                });
              } else {
                rows.push({
                  label: "BERAT PORSI (g)",
                  val: Math.round(e.gramsPerUnit || 100),
                  step: 10,
                  onStep: (d) =>
                    setEditing((x) =>
                      x
                        ? { ...x, gramsPerUnit: Math.max(1, (x.gramsPerUnit || 100) + d * 10) }
                        : x
                    ),
                  onSet: (n) =>
                    setEditing((x) =>
                      x ? { ...x, gramsPerUnit: Math.max(1, Math.round(n)) } : x
                    ),
                });
                rows.push({
                  label: "KALORI",
                  val: Math.round(e.kcal),
                  step: 10,
                  onStep: (d) => editSetField("kcal", e.kcal + d * 10),
                  onSet: (n) => editSetField("kcal", n),
                });
              }
              (["protein", "carbs", "fat"] as const).forEach((key) => {
                rows.push({
                  label:
                    key === "protein"
                      ? "PROTEIN (g)"
                      : key === "carbs"
                        ? "KARBO (g)"
                        : "LEMAK (g)",
                  val: round1(e[key]),
                  step: 1,
                  onStep: (d) => editSetField(key, e[key] + d),
                  onSet: (n) => editSetField(key, n),
                });
              });
              return rows.map((r, i, arr) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: i === arr.length - 1 ? 4 : 11,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: ".1em",
                      color: "#8a837d",
                    }}
                  >
                    {r.label}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <button
                      type="button"
                      onClick={() => r.onStep(-1)}
                      style={{
                        width: 40,
                        height: 42,
                        borderRadius: 13,
                        fontSize: 17,
                        color: "#f1ede9",
                        cursor: "pointer",
                        background: "rgba(255,255,255,.05)",
                        border: "1px solid rgba(255,255,255,.12)",
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={r.val}
                      onChange={(ev) => {
                        const n = parseFloat(ev.target.value);
                        r.onSet(Number.isFinite(n) ? n : 0);
                      }}
                      onFocus={(ev) => ev.currentTarget.select()}
                      style={{
                        width: 76,
                        height: 42,
                        boxSizing: "border-box",
                        textAlign: "center",
                        fontFamily: SANS,
                        fontWeight: 800,
                        fontSize: 19,
                        color: "#fff",
                        background: "rgba(255,255,255,.05)",
                        border: "1px solid rgba(255,255,255,.14)",
                        borderRadius: 11,
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => r.onStep(1)}
                      style={{
                        width: 40,
                        height: 42,
                        borderRadius: 13,
                        fontSize: 17,
                        color: "#fff",
                        cursor: "pointer",
                        background: FIRE,
                        border: "1px solid rgba(255,150,120,.6)",
                        boxShadow: "inset 0 1px 1px rgba(255,225,205,.6)",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ));
            })()}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{
                  flex: 1,
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#9a938d",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={editSave}
                style={{
                  flex: 2,
                  position: "relative",
                  overflow: "hidden",
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow:
                    "inset 0 1.5px 1px rgba(255,225,205,.7),0 10px 22px rgba(238,60,48,.42)",
                  textShadow: "0 1px 2px rgba(120,15,5,.5)",
                }}
              >
                SIMPAN ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* new group sheet */}
      {newGroup ? (
        <div
          onClick={() => setNewGroup(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 220,
            background: "rgba(5,4,6,.74)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              borderRadius: "26px 26px 42px 42px",
              padding: "22px 20px 30px 20px",
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              borderTop: "1px solid rgba(255,255,255,.1)",
              boxShadow: "0 -20px 50px rgba(0,0,0,.6)",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "#f5f2ef",
              }}
            >
              📚 GRUP BARU
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#7c736e",
                marginTop: 6,
                lineHeight: 1.55,
              }}
            >
              Bikin library sendiri — misal warung atau resto langgananmu. Simpan
              menu yang sering kamu makan, tinggal tap besok-besok.
            </div>
            <input
              type="text"
              value={newGroup.name}
              onChange={(ev) =>
                setNewGroup((g) => (g ? { ...g, name: ev.target.value } : g))
              }
              placeholder="Nama grup — misal: Warung Bu Tini"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginTop: 16,
                padding: "13px 15px",
                borderRadius: 13,
                fontFamily: SANS,
                fontSize: 15,
                color: "#f1ede9",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
                outline: "none",
              }}
            />
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".14em",
                color: "#6a6660",
                margin: "16px 0 9px",
              }}
            >
              IKON
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EMOJI_OPTS.map((em) => {
                const on = newGroup.emoji === em;
                return (
                  <button
                    key={em}
                    type="button"
                    onClick={() =>
                      setNewGroup((g) => (g ? { ...g, emoji: em } : g))
                    }
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      fontSize: 20,
                      cursor: "pointer",
                      background: on
                        ? "rgba(238,60,48,.15)"
                        : "rgba(255,255,255,.04)",
                      border: on
                        ? "1px solid rgba(238,60,48,.6)"
                        : "1px solid rgba(255,255,255,.1)",
                    }}
                  >
                    {em}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setNewGroup(null)}
                style={{
                  flex: 1,
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#9a938d",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={saveNewGroup}
                style={{
                  flex: 2,
                  padding: 15,
                  borderRadius: 14,
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow:
                    "inset 0 1.5px 1px rgba(255,225,205,.7),0 10px 22px rgba(238,60,48,.42)",
                  textShadow: "0 1px 2px rgba(120,15,5,.5)",
                }}
              >
                BUAT + ISI ✓
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
