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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSheetBack } from "@/lib/backSheet";
import { haptic } from "@/lib/haptics";
import { INGREDIENTS, macrosFor } from "@/lib/ingredients";
import { drinkSugarFull, SUGAR_LEVELS } from "@/lib/drinkSugar";
import { saveMeal, getAllMeals, isCustomItem, type MealItem, type CustomMealItem } from "@/lib/store";
import { contributeFood } from "@/lib/foodContribute";
import { prettyFoodName } from "@/lib/foodDisplayName";
import { loadCatalogue, clearCatalogueCache } from "@/lib/foodCatalogue";
import { prepare as prepareSearch, searchPrepared } from "@/lib/foodSearch";
import { buildDictionary, parseDish } from "@/lib/dishParse";
import {
  recordFoodPick,
  getFoodPicks,
  type FoodPick,
} from "@/lib/foodPicks";
import { affinityScorer, migrateFromPicks, recordAffinity } from "@/lib/foodAffinity";
import {
  getFoodGroups,
  addFoodToGroup,
  createFoodGroup,
  type FoodGroup,
  type CustomFoodDef,
} from "@/lib/foodGroups";
import { CUISINES, CUISINE_BY_KEY, cuisineOf, type CuisineKey } from "@/lib/cuisine";
import { getDaily } from "@/lib/store";
import { TARGETS, todayKey } from "@/lib/targets";
import {
  satuanFor,
  satuanLine,
  baseGrams,
  resolveSatuan,
  nearestStep,
  PORTION_STEPS,
} from "@/lib/satuan";
import { modsFor, modDelta, modSummary, type FoodMod } from "@/lib/foodMods";
import { suggest, emptyHistory } from "@/lib/suggest";
import { reasonText } from "@/lib/suggest/copy";
import { getHistoryStats, invalidateHistoryStats, categoryForGroup } from "@/lib/suggest/adapter";
import { logSuggestionOutcome, dismissalCounts } from "@/lib/suggest/outcomes";
import {
  getMealTemplates,
  saveMealTemplate,
  deleteMealTemplate,
  markTemplateUsed,
  templateKcal,
  type MealTemplate,
  type TemplateItem,
} from "@/lib/mealTemplates";

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


// Sort modes. "semua" is the default and shows the whole library immediately —
// it replaced the old "relevan" ranked-only mode AND the separate staples list.
// "group" buckets by cuisine instead of re-ordering.
type SortMode = "semua" | "group" | "kcalAsc" | "name";
const SORT_OPTS: { key: SortMode; label: string }[] = [
  { key: "semua", label: "SEMUA" },
  { key: "group", label: "GROUP" },
  { key: "kcalAsc", label: "KALORI ↑" },
  { key: "name", label: "A–Z" },
];

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
  /** Alternative names, search-only — never rendered. */
  aliases?: string;
  foodGroup?: string;
  cuisine?: CuisineKey;
  step?: number;
  gramsPerUnit?: number;
  favorite?: boolean;
  /** Default household portion in grams (e.g. 300 for Nasi Goreng). */
  portionG?: number;
  /** Household measures to pick from ("1 porsi", "1 potong"). */
  servings?: { label: string; grams: number }[];
};

// One row from /api/foods/search (per-100g values, numbers or null).
type DbFoodRow = {
  sourceCode: string;
  name: string;
  nameEn?: string | null;
  foodGroup?: string | null;
  cuisine?: string | null;
  portionG?: number | null;
  servings?: { label: string; grams: number }[];
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  sugar_g?: number | null;
};

/** A DB row's cuisine tag if valid, else null (grouping falls back to name). */
function rowCuisine(c: string | null | undefined): CuisineKey | undefined {
  return c && c in CUISINE_BY_KEY ? (c as CuisineKey) : undefined;
}

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

/** The two neutral squares at the end of the docked search pill. */
const dockBtn: CSSProperties = {
  width: 34,
  height: 34,
  flex: "none",
  borderRadius: 12,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  color: "#e8e4e0",
  background: "rgba(255,255,255,.06)",
  border: "none",
};

// ─── TAMBAHAN wheel geometry ────────────────────────────────────────────────
/** Row height + gap. The wheel maths is all in multiples of this. */
const WHEEL_PITCH = 51;
/** Viewport height of the drum. */
const WHEEL_H = 172;

/**
 * The infinite add-on drum.
 *
 * The option list is rendered three times over and the scroll position wraps
 * at the seams — when you drift into the first copy it jumps forward one set,
 * and vice versa — so head meets tail forever without ever hitting an end.
 * Each row is then rotated and scaled by its distance from the centre line,
 * which is what makes it read as a physical wheel rather than a list.
 */
function ModWheel({
  mods,
  active,
  onToggle,
}: {
  mods: FoodMod[];
  active: string[];
  onToggle: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const raf = useRef(0);
  const seeded = useRef(false);

  // Start in the middle copy so there's a full set of rows in both directions.
  useEffect(() => {
    const el = ref.current;
    if (!el || seeded.current || mods.length === 0) return;
    seeded.current = true;
    const id = requestAnimationFrame(() => {
      const one = el.scrollHeight / 3;
      el.scrollTop = one;
      setScrollY(one);
    });
    return () => cancelAnimationFrame(id);
  }, [mods.length]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const one = el.scrollHeight / 3;
    // Snap back by one set at the seams. Done on the element directly (not via
    // state) so the correction lands in the same frame and never flickers.
    if (el.scrollTop < one * 0.5) el.scrollTop += one;
    else if (el.scrollTop > one * 1.5) el.scrollTop -= one;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setScrollY(el.scrollTop);
    });
  };

  const tripled = [...mods, ...mods, ...mods];

  return (
    <div style={{ position: "relative", perspective: 520 }}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          height: WHEEL_H,
          overflowY: "auto",
          scrollbarWidth: "none",
          // Fade the rows out as they approach the rim.
          maskImage:
            "linear-gradient(180deg,transparent,#000 26%,#000 74%,transparent)",
          WebkitMaskImage:
            "linear-gradient(180deg,transparent,#000 26%,#000 74%,transparent)",
          transformStyle: "preserve-3d",
        }}
        className="mk-rail"
      >
        {tripled.map((m, i) => {
          const on = active.includes(m.key);
          const rowCentre = i * WHEEL_PITCH + WHEEL_PITCH / 2;
          const d = Math.max(
            -3.2,
            Math.min(3.2, (rowCentre - (scrollY + WHEEL_H / 2)) / WHEEL_PITCH)
          );
          const ad = Math.abs(d);
          return (
            <button
              key={`${m.key}-${i}`}
              type="button"
              onClick={() => onToggle(m.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                height: WHEEL_PITCH - 7,
                marginBottom: 7,
                padding: "0 13px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                background: on ? "#f1ede9" : "rgba(255,255,255,.04)",
                color: on ? "#141110" : "#cfc8c2",
                transform: `rotateX(${(-d * 19).toFixed(1)}deg) scale(${(1 - ad * 0.055).toFixed(3)})`,
                opacity: Math.max(0.12, 1 - ad * 0.3),
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: 13,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: MONO,
                    fontSize: 8.5,
                    marginTop: 3,
                    color: on ? "#5a534f" : "#7c736e",
                  }}
                >
                  {m.note}
                </span>
              </span>
              <span style={{ flex: "none", fontSize: 13, opacity: on ? 1 : 0 }}>✓</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category chips ─────────────────────────────────────────────────────────
// Exact 5-bucket palette from the R2FIT-Search reference (bCard()): each
// bucket is a single hex color, with the chip/icon tints derived from it via
// alpha-suffix (color+'1f' / color+'3a' / color+'44') exactly like the source.
// Foods resolve via foodGroup (DB rows, extended to the fuller catalogue) or
// the legacy step-key group (local ingredients).

type Cat = { label: string; color: string };
const CAT_BUCKET: Record<string, Cat> = {
  protein: { label: "PROTEIN", color: "#ff6a4c" },
  carb: { label: "KARBO", color: "#5ac8f5" },
  vegetable: { label: "SAYUR", color: "#5fe39a" },
  extra: { label: "EKSTRA", color: "#eab308" },
  drink: { label: "MINUM", color: "#b28bf0" },
};
const CAT_FALLBACK: Cat = { label: "LAIN", color: "#8a837d" };

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

/** The bucket key itself ("protein" / "drink" / …) — decides which add-ons a
 *  food is offered in the portion sheet, and feeds the suggestion rules. */
function catKeyFor(f: BuilderFood): string {
  return (
    (f.foodGroup && GROUP_TO_BUCKET[f.foodGroup]) || GROUP_TO_BUCKET[f.group] || "extra"
  );
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
  // Search-result ordering + optional cuisine grouping (Padang / Chinese / …).
  const [sortMode, setSortMode] = useState<SortMode>("semua");
  const [overrides, setOverrides] = useState<Record<string, MacroPatch>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodDef[]>([]);
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    all: true,
  });
  // Browse-all lives behind the floating ⋯ button (search is the hero).
  const [browseOpen, setBrowseOpen] = useState(false);
  // Which empty-state cell is lit. Purely visual state — the cell's action
  // fires on the way in; tapping the lit cell again just turns it back off.
  const [entryCell, setEntryCell] = useState<string | null>(null);
  // Reveals delete controls on the saved-menu rows (behind EDIT MENU).
  const [menuManage, setMenuManage] = useState(false);
  // The portion sheet. Nothing reaches the tray until TAMBAH is pressed, so a
  // mis-tap on a row costs nothing.
  const [sheet, setSheet] = useState<{ id: string; grams: number; mods: string[] } | null>(null);
  // Add-ons chosen per tray entry, so "ayam goreng · extra minyak" survives a
  // portion edit and shows on the tray row.
  const [entryMods, setEntryMods] = useState<Record<string, string[]>>({});
  // Suggestions waved away this session (not persisted — a new meal starts fresh).
  const [dismissed, setDismissed] = useState<string[]>([]);
  // Habit stats + persisted dismissal counts. Both are read once on mount:
  // suggest() has a 16ms budget and must never touch storage itself.
  const [historyStats, setHistoryStats] = useState(() => emptyHistory());
  const [dismissals, setDismissals] = useState<Map<string, number>>(() => new Map());
  // Everything already saved today, and the day's targets — the inputs the
  // engine needs to know whether the day is short on protein or has room left.
  const [consumedToday, setConsumedToday] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const [suggestTargets, setSuggestTargets] = useState({ kcal: 2200, protein: 175 });
  // `now` is captured once so the engine's output can't change mid-render.
  const [now] = useState(() => new Date());
  // Meal photo attached to this entry, as a blob/object URL for preview.
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
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
  // Saved meal templates ("Sarapan biasa") + the name-it sheet.
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [namingTemplate, setNamingTemplate] = useState<{ name: string; emoji: string } | null>(null);
  // Whole catalogue (lazy) — powers sort/group across the FULL library, not
  // just the relevant search hits.
  const [allFoods, setAllFoods] = useState<BuilderFood[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Persisted custom "libraries" + saved meal templates (localStorage).
  useEffect(() => {
    setGroups(getFoodGroups());
    setTemplates(getMealTemplates());
  }, []);

  // Everything the suggestion engine needs, read once. It's all storage work,
  // which is exactly what suggest() is forbidden from doing on the hot path.
  useEffect(() => {
    setHistoryStats(getHistoryStats());
    setDismissals(dismissalCounts());
    const today = todayKey();
    const t = getDaily(today).gymDay ? TARGETS.gymDay : TARGETS.restDay;
    setSuggestTargets({ kcal: t.kcal, protein: t.protein });
    // What's already saved today, so the engine doesn't count the tray twice.
    const saved = getAllMeals().filter((m) => m.date === dateKey);
    let kcal = 0, protein = 0, carbs = 0, fat = 0;
    for (const m of saved) {
      for (const it of m.items) {
        if (isCustomItem(it)) {
          kcal += it.kcal; protein += it.protein; carbs += it.carbs; fat += it.fat;
        } else {
          const mm = macrosFor(it.id, it.qty);
          kcal += mm.kcal; protein += mm.protein; carbs += mm.carbs; fat += mm.fat;
        }
      }
    }
    setConsumedToday({ kcal, protein, carbs, fat });
  }, [dateKey]);

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
            sugar: f.sugar_g ?? undefined,
            foodGroup: f.foodGroup ?? undefined,
            cuisine: rowCuisine(f.cuisine),
            unit: "100 g",
            group: "custom",
            kcal: f.energy_kcal ?? 0,
            protein: f.protein_g ?? 0,
            fat: f.fat_g ?? 0,
            carbs: f.carb_g ?? 0,
            gramsPerUnit: 100,
            step: 0.1, // ±10 g nudges (gramsPerUnit 100)
            portionG: f.portionG ?? undefined,
            servings: f.servings ?? [],
          }));
          setDbResults(mapped);
          setSearching(false);
          setDbCache((c) => {
            const next = { ...c };
            // MERGE, don't replace. The catalogue load caches the full row;
            // this search result is a thinner projection of the same food, and
            // assigning it wholesale dropped every field the search endpoint
            // doesn't return. That is how sugar reached the tray as 0 even
            // after the catalogue started shipping it: typing the query
            // overwrote the good entry with a poorer one. Undefined values
            // must never win over a value we already have.
            for (const m of mapped) {
              const prev = next[m.id];
              if (!prev) { next[m.id] = m; continue; }
              const merged = { ...prev };
              for (const [k, v] of Object.entries(m)) {
                if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
              }
              next[m.id] = merged;
            }
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

  // Load the shared catalogue once, via lib/foodCatalogue (cached on device).
  //
  // The previous version listed `loadingAll` in its own dependency array AND
  // set it, so React ran the cleanup — cancelling the in-flight request —
  // before it could resolve. loadingAll stayed true, allFoods stayed null, and
  // the spinner ran forever. A ref guard can't be re-entered that way.
  const catalogueTried = useRef(false);
  const runCatalogueLoad = useCallback((force: boolean) => {
    catalogueTried.current = true;
    setLoadingAll(true);
    setCatalogueError(null);
    loadCatalogue(force).then((res) => {
      setLoadingAll(false);
      if (!res.ok) {
        setCatalogueError(res.message);
        return;
      }
      const mapped: BuilderFood[] = res.foods.map((f) => ({
        id: f.sourceCode,
        name: prettyFoodName(f.name),
        englishName: f.nameEn ?? undefined,
        aliases: f.aliases ?? undefined,
        foodGroup: f.foodGroup ?? undefined,
        cuisine: rowCuisine(f.cuisine),
        unit: "100 g",
        group: "custom",
        kcal: f.energy_kcal ?? 0,
        protein: f.protein_g ?? 0,
        fat: f.fat_g ?? 0,
        carbs: f.carb_g ?? 0,
        // Saved inline on every item, so it reaches Skor Sehat's sugar term.
        sugar: f.sugar_g ?? undefined,
        gramsPerUnit: 100,
        // A real serving beats a flat 100 g: "1 bungkus · 185 g · 380 kkal"
        // is the number someone eats, and it is what the source measured.
        portionG: f.portionG ?? undefined,
        step: 0.1,
      }));
      setAllFoods(mapped);
      setDbCache((c) => {
        const next = { ...c };
        for (const m of mapped) if (!next[m.id]) next[m.id] = m;
        return next;
      });
    });
  }, []);

  useEffect(() => {
    if (catalogueTried.current) return;
    runCatalogueLoad(false);
  }, [runCatalogueLoad]);


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
  /** Quantity for the FIRST tap on a food. Prefer its real household portion
   *  (e.g. Nasi Goreng → 300 g = qty 3.0) so one tap logs a believable plate;
   *  the old behaviour added `step`, which for DB foods meant 10 g and took
   *  ~30 taps to reach a portion. Nudges after that still use `step`. */
  const firstQty = (ing: BuilderFood | null): number => {
    const st = (ing && ing.step) || 1;
    if (!ing) return st;
    const gpu = ing.gramsPerUnit;
    const portion = ing.portionG;
    if (gpu && portion && portion > 0) {
      return Math.round((portion / gpu) * 1000) / 1000;
    }
    return st;
  };

  const bAdd = (id: string) => {
    haptic("tap");
    const ing = bIng(id);
    setSelection((sel) => {
      const cur = sel[id] || 0;
      const inc = cur > 0 ? (ing && ing.step) || 1 : firstQty(ing);
      return { ...sel, [id]: Math.round((cur + inc) * 1000) / 1000 };
    });
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
      // Same event, richer store: decayed counters + meal slot + what else is
      // on the tray. recordFoodPick stays for the "usual" shortlist UI.
      recordAffinity(ing.id, platedIds);
      recordAffinity(ing.id, platedIds);
    setPicks(getFoodPicks());
    }
    setQuery("");
    setAddedFlash((f) => ({ name: ing?.name ?? "Makanan", tick: (f?.tick ?? 0) + 1 }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setAddedFlash(null), 1400);
    // Keep the keyboard up so typing the next item is instant.
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  /** Open the portion sheet for a food. Seeds grams from what's already in the
   *  tray, or from the food's default household portion. */
  const openPortionSheet = (id: string) => {
    haptic("tap");
    const ing = bIng(id);
    if (!ing) return;
    const { portionG } = satuanFor(ing);
    const cur = selection[id] || 0;
    const perUnit = baseGrams(ing);
    // Open at what THIS person usually eats, not the generic portion — after a
    // few logs the slider starts in the right place on its own.
    const usual = historyStats.medianPortion.get(id);
    setSheet({
      id,
      grams: Math.round(cur > 0 ? cur * perUnit : usual && usual > 0 ? usual : portionG),
      mods: (entryMods[id] ?? []).slice(),
    });
  };

  /** TAMBAH — the only path into the tray. */
  const confirmPortionSheet = () => {
    const sh = sheet;
    if (!sh) return;
    const ing = bIng(sh.id);
    if (!ing || sh.grams <= 0) {
      setSheet(null);
      return;
    }
    const perUnit = baseGrams(ing);
    setSelection((sel) => ({
      ...sel,
      [sh.id]: Math.round((sh.grams / perUnit) * 1000) / 1000,
    }));
    setEntryMods((m) => ({ ...m, [sh.id]: sh.mods }));
    setJustId(sh.id);
    setAddTick((t) => t + 1);
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
    recordAffinity(ing.id, platedIds);
    setPicks(getFoodPicks());
    setSheet(null);
    setQuery("");
    setAddedFlash((f) => ({ name: ing.name, tick: (f?.tick ?? 0) + 1 }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setAddedFlash(null), 1400);
    haptic("success");
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

  // ---------- meal templates ----------

  /** Snapshot the current tray so the template replays without a search. */
  function currentTrayAsItems(): TemplateItem[] {
    const out: TemplateItem[] = [];
    for (const [id, qty] of Object.entries(selection)) {
      if (qty <= 0) continue;
      const ing = bIng(id);
      if (!ing) continue;
      out.push({
        id,
        name: ing.name,
        qty,
        unit: ing.unit,
        gramsPerUnit: ing.gramsPerUnit,
        step: ing.step,
        kcal: ing.kcal,
        protein: ing.protein,
        fat: ing.fat,
        carbs: ing.carbs,
      });
    }
    return out;
  }

  function confirmSaveTemplate() {
    if (!namingTemplate) return;
    const items = currentTrayAsItems();
    if (items.length === 0) {
      setNamingTemplate(null);
      return;
    }
    saveMealTemplate(namingTemplate.name, namingTemplate.emoji, items);
    setTemplates(getMealTemplates());
    setNamingTemplate(null);
    haptic("success");
  }

  /** One tap = the whole meal back in the tray. Items are seeded into the
   *  session cache first so they resolve for display/edit without a search. */
  function applyTemplate(t: MealTemplate) {
    haptic("tap");
    setDbCache((c) => {
      const next = { ...c };
      for (const it of t.items) {
        if (!next[it.id]) {
          next[it.id] = {
            id: it.id,
            name: it.name,
            unit: it.unit,
            group: "custom",
            kcal: it.kcal,
            protein: it.protein,
            fat: it.fat,
            carbs: it.carbs,
            gramsPerUnit: it.gramsPerUnit,
            step: it.step,
          };
        }
      }
      return next;
    });
    setSelection((sel) => {
      const next = { ...sel };
      for (const it of t.items) {
        next[it.id] = Math.round(((next[it.id] || 0) + it.qty) * 1000) / 1000;
      }
      return next;
    });
    markTemplateUsed(t.id);
    setTemplates(getMealTemplates());
    setJustId(t.items[t.items.length - 1]?.id ?? null);
    setAddTick((x) => x + 1);
    setAddedFlash((f) => ({ name: t.name, tick: (f?.tick ?? 0) + 1 }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setAddedFlash(null), 1400);
  }

  function removeTemplate(id: string) {
    deleteMealTemplate(id);
    setTemplates(getMealTemplates());
  }

  // Hardware/browser back mirrors the UI: close an inner sheet first, then
  // the browse layer, and only then leave the builder.
  useSheetBack(true, () => {
    if (photoViewer) {
      setPhotoViewer(false);
      return true;
    }
    if (sheet) {
      setSheet(null);
      return true;
    }
    if (namingTemplate) {
      setNamingTemplate(null);
      return true;
    }
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
    invalidateHistoryStats();
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
  const openNewGroup = () => setNewGroup({ name: "", emoji: "" });
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
  // Search results — one flat, ranked list: local library matches lead, DB
  // hits (already score-ranked by the API) follow. Then the user's own staples
  // that match the query are floated to the very top (most-used first), so what
  // you actually eat is one tap away.
  // Rank the loaded catalogue on-device. This is what makes typing feel
  // instant: the network round-trip per keystroke is now a bonus that fills in
  // late, not the thing the list waits on. It also means search still works
  // with no signal, and the ranking rules live in lib/foodSearch where they're
  // readable and tested rather than inside a SQL score expression.
  // How much this user eats each food, 0..1. Rebuilt when the query settles
  // rather than per keystroke — it reads localStorage, and the answer does not
  // change between two letters.
  // What is already on the tray, which is what makes "nasi goreng usually
  // comes with telur" learnable and usable.
  const platedIds = useMemo(() => Object.keys(selection), [selection]);
  const affinity = useMemo(() => {
    // One-time upgrade of the legacy {count,last} picks store, so an existing
    // user's six months of history is not thrown away.
    migrateFromPicks(getFoodPicks());
    return affinityScorer({ plate: platedIds });
  }, [platedIds]);

  const searchPool = useMemo(
    () => prepareSearch(merged.concat(allFoods ?? [])),
    // Re-prepared only when the underlying lists change, never per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customFoods, groups, allFoods, overrides]
  );
  // Server hits cover rows the device hasn't cached yet, but they come back
  // with the API's own OR-ish matching. Concatenating them raw made "ayam
  // bakar" return MORE results than "ayam" — typing more must never widen the
  // list — so they go through the same ranker before joining.
  // Two different limits, on purpose.
  //
  // RANK_LIMIT is how deep the partition below can reach; SHOW_LIMIT is how
  // much is rendered. They used to be the same 60, which meant a favourite
  // could not be floated unless it already ranked in the top 60 — and "Whole
  // egg" sits at 82 of 132 for the query "telur", behind every row literally
  // named Telur. Truncating before choosing what to promote makes the promotion
  // unreachable exactly when it is most needed.
  //
  // Scoring already visits every document regardless of the limit, so ranking
  // deeper costs a larger sort, not a larger scan.
  const RANK_LIMIT = 400;
  const SHOW_LIMIT = 60;
  const searchFlatRaw: BuilderFood[] = q
    ? searchPrepared(searchPool, q, { limit: RANK_LIMIT, affinity: affinity })
        .map((r) => r.food)
        .concat(
          searchPrepared(prepareSearch(dbResults), q, { limit: 30, affinity }).map((r) => r.food)
        )
    : [];
  const searchFlat: BuilderFood[] = (() => {
    if (!q) return searchFlatRaw;
    // De-dupe only. What used to live here was a HARD PARTITION — every food
    // the user had ever picked, concatenated above every food they hadn't,
    // regardless of relevance. It was the only way to make a signal worth 0.3
    // points visible against a BM25 total near 3.9, and it bought that
    // visibility by making relevance irrelevant: a food tapped once months ago
    // outranked an exact name match, and "Telur balado is still showing even
    // though the user never picked it" was the direct consequence.
    //
    // Behaviour is a scored FEATURE now (lib/foodAffinity), applied inside the
    // ranker and capped at +40%, with an exact-name lock above it. Ordering
    // here would fight that.
    const seen = new Set<string>();
    const out: BuilderFood[] = [];
    for (const f of searchFlatRaw) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    return out.slice(0, SHOW_LIMIT);
  })();
  // ── RACIK: read a typed plate as its parts ────────────────────────────
  //
  // "nasi ayam goreng sambal" is not one food and never will be one row, but
  // it is three foods the catalogue already has. Dictionary segmentation
  // (lib/dishParse) turns the query into those parts so the whole plate goes
  // in with one tap instead of three searches.
  //
  // It only offers itself when the query is NOT already a known dish: if
  // "Nasi Goreng" exists as a measured composition, that row is the better
  // nutrition answer than rice + oil reconstructed from parts.
  const dishDict = useMemo(
    () => buildDictionary(merged.concat(allFoods ?? []).map((f) => ({ id: f.id, name: f.name }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customFoods, groups, allFoods]
  );
  const racik = useMemo(() => {
    if (!q || q.trim().length < 4) return null;
    const r = parseDish(q, dishDict);
    // Two or more parts, confidently read, and not just the top search hit
    // wearing a different hat.
    if (r.whole || r.parts.length < 2 || r.confidence < 0.6) return null;
    const foods = r.parts
      .map((p) => bIng(p.id))
      .filter((f): f is BuilderFood => !!f);
    if (foods.length < 2) return null;
    return { foods, unmatched: r.unmatched, confidence: r.confidence };
  }, [q, dishDict, bIng]);

  /** Add every detected part at its default household portion. */
  const addRacik = () => {
    if (!racik) return;
    haptic("success");
    setSelection((sel) => {
      const next = { ...sel };
      for (const f of racik.foods) {
        const perUnit = baseGrams(f);
        const grams = f.portionG && f.portionG > 0 ? f.portionG : perUnit;
        next[f.id] = Math.round((grams / perUnit) * 1000) / 1000;
      }
      return next;
    });
    setAddTick((t) => t + 1);
    setQuery("");
  };

  // Apply the chosen sort. "relevan" keeps the incoming (ranked / most-used)
  // order as-is.
  const applySort = (list: BuilderFood[]): BuilderFood[] => {
    if (sortMode === "semua" || sortMode === "group") return list;
    const arr = [...list];
    if (sortMode === "kcalAsc") arr.sort((a, b) => a.kcal - b.kcal);
    else if (sortMode === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "id"));
    return arr;
  };

  // Cuisine buckets (Padang / Chinese / Jepang / …) in display order, non-empty
  // only, preserving the incoming order within each bucket.
  const bucketByCuisine = (list: BuilderFood[]) => {
    const by = new Map<CuisineKey, BuilderFood[]>();
    for (const f of list) {
      const k = f.cuisine ?? cuisineOf(f.name);
      (by.get(k) ?? by.set(k, []).get(k)!).push(f);
    }
    return CUISINES.map((c) => ({
      key: c.key,
      label: c.label,
      emoji: c.emoji,
      items: by.get(c.key) ?? [],
    })).filter((g) => g.items.length > 0);
  };

  const groupCuisine = sortMode === "group";
  const sortedSearch = applySort(searchFlat);
  const searchResultCount = sortedSearch.length;
  const cuisineGroups = groupCuisine ? bucketByCuisine(sortedSearch) : [];

  // Shared sort + group-by-cuisine toolbar (used above search results AND the
  // "SERING DIPAKAI" staples list so it's always discoverable).
  // One segmented control: SEMUA · GROUP · KALORI ↑ · A–Z. GROUP is a mode
  // here rather than a separate ◱ MASAKAN toggle, so there is exactly one
  // thing selected at a time and no two-dimensional state to reason about.
  const sortGroupToolbar = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 3,
        padding: 3,
        borderRadius: 12,
        background: "rgba(255,255,255,.03)",
        marginBottom: 12,
      }}
    >
      {SORT_OPTS.map((o) => {
        const on = sortMode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              haptic("tap");
              setSortMode(o.key);
            }}
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: ".08em",
              fontWeight: on ? 700 : 400,
              padding: "9px 4px",
              borderRadius: 9,
              cursor: "pointer",
              border: "none",
              color: on ? "#fff" : "#8a837d",
              background: on ? FIRE : "transparent",
              textShadow: on ? "0 1px 2px rgba(120,15,5,.5)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  // Staples for "SERING DIPAKAI", with the same sort/grouping applied.
  const pickFoods = picks.map(pickToFood);
  const sortedPicks = applySort(pickFoods);
  const pickCuisineGroups = groupCuisine ? bucketByCuisine(sortedPicks) : [];

  // Browse mode: sort/group with no query → the WHOLE library (capped for perf).
  // With SEMUA as the default, an empty query always means "browse the
  // library" — there is no separate staples screen to fall back to.
  const browsing = !q;
  const BROWSE_CAP = 500;
  const browseSorted = browsing ? applySort(allFoods ?? []) : [];
  const browseTruncated = browseSorted.length > BROWSE_CAP;
  const browseList = browseSorted.slice(0, BROWSE_CAP);
  const browseCuisineGroups = groupCuisine ? bucketByCuisine(browseList) : [];

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
    gid: string | null,
    // Catalogue sections start CLOSED. `collapsed` only records an explicit
    // toggle, so without this every one of them would default open and the
    // panel would mount the whole catalogue on first render.
    defaultOpen = true
  ): Section => {
    const open = collapsed[key] === undefined ? defaultOpen : !collapsed[key];
    const sc = list.filter((x) => (selection[x.id] || 0) > 0).length;
    // A closed section renders nothing, which is what makes it safe to list the
    // whole catalogue. An OPEN one is capped: 600 rows of DOM to scroll past is
    // not browsing, and search is the right tool past that point. The count
    // label always states the true total, so the cap never hides the size.
    const SECTION_CAP = 120;
    const shown = open ? list.slice(0, SECTION_CAP) : [];
    return {
      key,
      chev: open ? "▾" : "▸",
      emoji,
      name,
      countLabel:
        sc > 0
          ? `${sc} dipilih`
          : open && list.length > SECTION_CAP
          ? `${SECTION_CAP} / ${list.length}`
          : String(list.length),
      open,
      canAdd,
      // Store the CURRENT open state as the new `collapsed` value rather than
      // flipping `!c[key]`. For a section that defaults closed, `c[key]` is
      // undefined and `!undefined` is true — which means "collapsed", so the
      // first tap on a catalogue group would have done nothing at all.
      onToggle: () => setCollapsed((c) => ({ ...c, [key]: open })),
      onAddFood: gid ? () => openNewFood(gid) : () => {},
      items: shown.map(applyOv),
    };
  };
  // LIBRARY KAMU used to list `INGREDIENTS` — the 141-row list hardcoded in
  // lib/ingredients.ts — while search ran against `allFoods`, the ~1700-row
  // server catalogue. Same screen, two different libraries: browsing showed
  // "SEMUA MAKANAN 121" to someone whose search could reach 1700 foods.
  //
  // The catalogue is the library now. INGREDIENTS survives only as the
  // hand-picked USUAL KAMU shortlist, which is what it's actually good for.
  const favs = (INGREDIENTS as BuilderFood[]).filter((i) => i.favorite);

  // Catalogue split by food group so the list is navigable. One section of
  // 1700 is not a library, it's a wall — and every section is collapsed by
  // default, so a closed one renders nothing at all (see `mk`).
  const catalogue = allFoods ?? [];
  const byGroup = new Map<string, BuilderFood[]>();
  for (const f of catalogue) {
    const key = (f.foodGroup ?? "").trim() || "Lainnya";
    const list = byGroup.get(key);
    if (list) list.push(f);
    else byGroup.set(key, [f]);
  }
  // Biggest groups first — the ones you're most likely to be looking for.
  const catalogueGroups = [...byGroup.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "id")
  );

  const browseSections: Section[] = [];
  browseSections.push(mk("usual", "", "USUAL KAMU", favs, false, null));
  for (const g of groups) {
    browseSections.push(mk(g.id, g.emoji, g.name, g.foods, true, g.id));
  }
  if (customFoods.length > 0) {
    browseSections.push(mk("mine", "", "BUATAN KAMU", customFoods, false, null));
  }
  for (const [name, list] of catalogueGroups) {
    browseSections.push(mk(`cat:${name}`, "", name.toUpperCase(), list, false, null, false));
  }

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

  // MUNGKIN KELUPAAN. Everything about WHICH foods and HOW confident lives in
  // lib/suggest; this only turns ids back into foods and reason codes into
  // Bahasa. Swapping the engine for a learned model touches nothing here.
  const trayHints = suggest({
    tray: traySelected.map(({ id, ing, qty }) => ({
      foodId: id,
      category: categoryForGroup(ing.foodGroup ?? ing.group),
      macros: {
        kcal: ing.kcal * qty,
        protein: ing.protein * qty,
        carbs: ing.carbs * qty,
        fat: ing.fat * qty,
      },
    })),
    mealType: activeMeal,
    at: now,
    targets: suggestTargets,
    consumedToday: consumedToday,
    history: historyStats,
    declined: dismissed,
    dismissals,
  })
    .map((s) => {
      const f = bIng(s.foodId);
      if (!f) return null;
      const { portionG } = satuanFor(f);
      return {
        key: s.foodId,
        id: s.foodId,
        name: f.name,
        why: reasonText(s.reason, s.reasonParams, (fid) => bIng(fid)?.name ?? fid),
        conf: s.confidence,
        reason: s.reason,
        signals: s.signals,
        kcal: Math.round((f.kcal * portionG) / baseGrams(f)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const shownLibCount = useCountUp(libCount ?? 0);
  const emptyState = !q && count === 0 && !browseOpen;

  // The four ways into the app from an empty screen. Each one goes somewhere
  // real — this replaces the library count, which was a number you couldn't
  // act on.
  const entryCells: { key: string; label: string; go: () => void }[] = [
    { key: "library", label: "LIBRARY", go: () => setBrowseOpen(true) },
    { key: "menu", label: "EDIT MENU", go: () => setMenuManage(true) },
    { key: "warung", label: "WARUNG", go: () => setNewGroup({ name: "", emoji: "" }) },
    {
      key: "impor",
      label: "IMPOR",
      go: () => {
        if (typeof window !== "undefined") window.location.href = "/meal/import";
      },
    },
  ];

  // ---------- search-result row (reference bCard(): icon tile + category ----
  // chip + serving/kcal + add — no hanzi/edit clutter, that's for browse only.
  const renderResultRow = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const inCart = (selection[id] || 0) > 0;
    // Calories for ONE household portion, not per 100 g — "195 kkal" has to
    // mean the plate in front of you or the number is worse than useless.
    const { label, portionG } = satuanFor(ing);
    const perUnit = baseGrams(ing);
    const portionKcal = Math.round((ing.kcal * portionG) / perUnit);
    return (
      <div
        key={id}
        onClick={() => openPortionSheet(id)}
        style={{
          borderRadius: 12,
          padding: "11px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          // Selected = a lighter fill, never an outline.
          background: inCart ? "rgba(255,255,255,.06)" : "transparent",
          border: "none",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 14.5,
              color: "#ffffff",
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
              fontSize: 9.5,
              color: "#8a837d",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {satuanLine(label, portionG)} · {portionKcal} kkal
          </div>
        </div>
        <button
          type="button"
          aria-label={`Tambah ${ing.name}`}
          onClick={(ev) => {
            ev.stopPropagation();
            openPortionSheet(id);
          }}
          style={{
            width: 34,
            height: 34,
            flex: "none",
            borderRadius: 10,
            fontSize: 19,
            lineHeight: 1,
            cursor: "pointer",
            color: "#e8e4e0",
            background: "rgba(255,255,255,.06)",
            border: "none",
          }}
        >
          +
        </button>
      </div>
    );
  };

  // Render cuisine-bucketed result rows (shared by search / staples / browse).
  // GROUP mode. Each heading is a button — tap to collapse the bucket. No flag
  // emoji: the cuisine name already says it, and five flags in a column read
  // as decoration.
  const renderCuisineGroups = (
    groups: { key: CuisineKey; label: string; emoji: string; items: BuilderFood[] }[]
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map((g) => {
        const open = !collapsed[`cuisine:${g.key}`];
        return (
          <div key={g.key}>
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                toggleSection(`cuisine:${g.key}`);
              }}
              aria-expanded={open}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 2px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: ".14em",
                color: "#e8e4e0",
                textAlign: "left",
              }}
            >
              <span style={{ color: "#6a6660", width: 10 }}>{open ? "▾" : "▸"}</span>
              <span>{g.label}</span>
              <span style={{ color: "#6a6660" }}>{g.items.length}</span>
            </button>
            {open ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {g.items.map(renderResultRow)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

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
          // Flat black. The page gradient, both aurora blobs and both fireBase
          // glows are gone — colour here competed with the food, and orange is
          // now reserved for the SIMPAN CTA and the active segment alone.
          background: "#000000",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* the 8 rising embers survive — the only ambient left */}
        {emptyState ? (
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
          >
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
                  color: "#e8e4e0",
                  background: "rgba(255,255,255,.06)",
                  border: "none",
                  borderRadius: 8,
                  padding: "5px 10px",
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
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, color: "#ffffff" }}>
              MAKAN
            </span>
            {/* The import entry point, now a 4px dim dot rather than a chip
                competing for attention. 18px tap target so it's still hittable. */}
            <a
              href="/meal/import"
              aria-label="Impor JSON"
              onClick={() => haptic("tap")}
              style={{
                width: 18,
                height: 18,
                flex: "none",
                alignSelf: "center",
                display: "grid",
                placeItems: "center",
                textDecoration: "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 4, height: 4, borderRadius: "50%", background: "#4a4340" }}
              />
            </a>
          </div>
        </div>

        {/* scroll area — centers the hero+search vertically while idle,
            matching the reference's bScrollStyle toggle. */}
        <div
          style={
            // Flex-column centering ONLY for the truly-empty screen (hero+search
            // with nothing else). The moment there's a list — "SERING DIPAKAI"
            // or search results — use a plain block scroll instead, because a
            // flex column lets the search wrapper (overflow:hidden → min-height 0)
            // get squashed to a line. Block layout can never shrink it.
            emptyState && picks.length === 0 && !browsing
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
          {/* ── RUNNING TRAY ──
              Neutral card. Big white kcal with p/c/f directly below it, and a
              camera button where the macro block used to sit. Rows carry no
              steppers and no ✕ — you change a portion by typing grams, and
              clearing the field removes the item. */}
          {count > 0 ? (
            <div
              style={{
                borderRadius: 18,
                padding: 15,
                marginBottom: 16,
                background: "#0d0c0d",
                border: "none",
                animation: "trayPop .34s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    key={Math.round(tk)}
                    style={{
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 38,
                      color: "#ffffff",
                      lineHeight: 1,
                      animation: "totalKick .4s ease-out",
                    }}
                  >
                    {Math.round(tk)}
                    <span
                      style={{
                        fontFamily: SANS,
                        fontWeight: 600,
                        fontSize: 14,
                        color: "#6a6660",
                        marginLeft: 7,
                      }}
                    >
                      kkal
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: "#8a837d",
                      marginTop: 7,
                    }}
                  >
                    {Math.round(tp)}p / {Math.round(tc)}c / {Math.round(tf)}f
                  </div>
                </div>

                {/* Proof of the plate. No photo → straight to the camera;
                    a photo → the button IS the thumbnail, tapping opens it. */}
                <button
                  type="button"
                  aria-label={photo ? "Lihat foto" : "Foto makanan"}
                  onClick={() => {
                    haptic("tap");
                    if (photo) setPhotoViewer(true);
                    else photoInputRef.current?.click();
                  }}
                  style={{
                    flex: "none",
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 16,
                    cursor: "pointer",
                    border: "none",
                    padding: 0,
                    color: "#6a6660",
                    // A background-image div, never an <img src> bound to a
                    // template hole — a stale/empty src renders a broken-image
                    // icon, this just renders nothing.
                    background: photo
                      ? `center / cover no-repeat url(${JSON.stringify(photo)})`
                      : "rgba(255,255,255,.06)",
                  }}
                >
                  {photo ? "" : "FOTO"}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 12,
                  maxHeight: 218,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                {traySelected.map(({ id, ing, qty }) => {
                  const perUnit = baseGrams(ing);
                  const grams = Math.round(perUnit * qty);
                  const delta = modDelta(entryMods[id] ?? []);
                  const kcal = Math.max(0, Math.round(ing.kcal * qty + delta.kcal));
                  const extras = modSummary(entryMods[id] ?? []);
                  const isJust = id === justId;
                  const popAnim = addTick % 2 ? "trayPop" : "trayPop2";
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 2px",
                        background: "transparent",
                        border: "none",
                        animation: isJust
                          ? `${popAnim} .42s cubic-bezier(.16,1,.3,1)`
                          : "none",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openPortionSheet(id)}
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
                            color: "#ffffff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ing.name}
                          {extras ? (
                            <span style={{ color: "#8a837d", fontWeight: 500 }}>
                              {" · "}
                              {extras}
                            </span>
                          ) : null}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontFamily: MONO,
                            fontSize: 9,
                            color: "#6a6660",
                            marginTop: 3,
                          }}
                        >
                          {kcal} kkal
                        </span>
                      </button>
                      {/* Typing only. Empty or 0 removes the item — that's the
                          delete, so there is no ✕ to mis-tap. */}
                      <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: 2 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Gram ${ing.name}`}
                          value={String(grams)}
                          onChange={(ev) => {
                            const raw = ev.target.value.replace(/[^\d.]/g, "");
                            const g = parseFloat(raw);
                            if (!raw || !Number.isFinite(g) || g <= 0) {
                              bRemove(id);
                              return;
                            }
                            setSelection((sel) => ({
                              ...sel,
                              [id]: Math.round((Math.min(3000, g) / perUnit) * 1000) / 1000,
                            }));
                          }}
                          style={{
                            width: 46,
                            textAlign: "right",
                            fontFamily: MONO,
                            fontSize: 16, // ≥16 avoids iOS focus zoom
                            color: "#e8e4e0",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            padding: 0,
                          }}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 10, color: "#6a6660" }}>g</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Saving a tray as a menu left the tray HEADER, but the ability
                  had to live somewhere — this is the only screen where the
                  meal exists to be saved. Plain text, no chip. */}
              <button
                type="button"
                onClick={() =>
                  setNamingTemplate({ name: BLABEL[activeMeal].toLowerCase(), emoji: "" })
                }
                style={{
                  marginTop: 10,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: ".14em",
                  color: "#6a6660",
                }}
              >
                SIMPAN JADI MENU
              </button>
            </div>
          ) : null}

          {/* ── MUNGKIN KELUPAAN — what's probably missing from this plate ── */}
          {trayHints.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: ".16em",
                  color: "#6a6660",
                  margin: "0 0 8px 2px",
                }}
              >
                MUNGKIN KELUPAAN
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {trayHints.map((h) => (
                  <div
                    key={h.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 2px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 13.5,
                          color: "#ffffff",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.name}
                        <span style={{ color: "#6a6660", fontWeight: 500 }}>
                          {" · "}
                          {h.kcal} kkal
                        </span>
                      </div>
                      {h.why ? (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 8.5,
                            color: "#6a6660",
                            marginTop: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.why}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <span
                          style={{
                            flex: 1,
                            height: 3,
                            borderRadius: 2,
                            background: "rgba(255,255,255,.08)",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${Math.round(h.conf * 100)}%`,
                              borderRadius: 2,
                              background: "#8a837d",
                            }}
                          />
                        </span>
                        <span
                          style={{
                            flex: "none",
                            fontFamily: MONO,
                            fontSize: 8.5,
                            color: "#6a6660",
                          }}
                        >
                          {Math.round(h.conf * 100)}% yakin
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Lewati ${h.name}`}
                      onClick={() => {
                        haptic("tap");
                        setDismissed((d) => d.concat(h.key));
                        // Every ✕ is a label. It also feeds the dismissal
                        // penalty, so a food waved away three times for this
                        // meal stops asking.
                        logSuggestionOutcome({
                          foodId: h.id,
                          mealType: activeMeal,
                          confidence: h.conf,
                          reason: h.reason,
                          signals: h.signals,
                          action: "decline",
                          at: Date.now(),
                        });
                        setDismissals(dismissalCounts());
                      }}
                      style={{ ...dockBtn, width: 30, height: 30, fontSize: 12, color: "#6a6660" }}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      aria-label={`Tambah ${h.name}`}
                      onClick={() => {
                        logSuggestionOutcome({
                          foodId: h.id,
                          mealType: activeMeal,
                          confidence: h.conf,
                          reason: h.reason,
                          signals: h.signals,
                          action: "accept",
                          at: Date.now(),
                        });
                        openPortionSheet(h.id);
                      }}
                      style={{ ...dockBtn, width: 30, height: 30, fontSize: 12 }}
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── EMPTY STATE — four ways in, styled exactly like the sort bar ──
              The big library count and "TINGGAL KETIK" are gone: a number you
              can't act on is decoration. These four are all destinations. */}
          {emptyState ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 3,
                padding: 3,
                borderRadius: 12,
                background: "rgba(255,255,255,.03)",
              }}
            >
              {entryCells.map((cell) => {
                const on = entryCell === cell.key;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      // Second tap toggles back off, so a mis-tap is one tap to undo.
                      if (on) {
                        setEntryCell(null);
                        return;
                      }
                      setEntryCell(cell.key);
                      cell.go();
                    }}
                    style={{
                      padding: "9px 4px",
                      borderRadius: 9,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: MONO,
                      fontSize: 8.5,
                      letterSpacing: ".08em",
                      fontWeight: on ? 700 : 400,
                      color: on ? "#fff" : "#8a837d",
                      background: on ? FIRE : "transparent",
                      textShadow: on ? "0 1px 2px rgba(120,15,5,.5)" : "none",
                    }}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* The search field lives in the bottom dock now, in every state —
              the big centred hero search is gone. */}

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

          {/* ── Saved menus — one tap replays a whole meal ──
              No heading, no emoji tile, no ✕ on the row: the whole block
              disappears the moment the tray has anything in it, so it can't
              compete with what you're actually building. Delete lives behind
              EDIT MENU on the empty screen. */}
          {!q && !browseOpen && count === 0 && templates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 14 }}>
              {templates.map((t) => {
                const contents = t.items
                  .map((it) => `${it.name} ${Math.round(baseGrams(it) * it.qty)}g`)
                  .join(" · ");
                const macros = t.items.reduce(
                  (a, it) => ({
                    p: a.p + it.protein * it.qty,
                    c: a.c + it.carbs * it.qty,
                    f: a.f + it.fat * it.qty,
                  }),
                  { p: 0, c: 0, f: 0 }
                );
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 2px",
                      background: "transparent",
                      border: "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#ffffff",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.name}
                      </span>
                      {/* What's actually in it, wrapping — so you can tell two
                          saved menus apart without opening either. */}
                      <span
                        style={{
                          display: "block",
                          fontFamily: MONO,
                          fontSize: 9,
                          lineHeight: 1.55,
                          color: "#8a837d",
                          marginTop: 4,
                        }}
                      >
                        {contents}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontFamily: MONO,
                          fontSize: 9,
                          color: "#6a6660",
                          marginTop: 3,
                        }}
                      >
                        {t.items.length} item · {templateKcal(t)} kkal · {Math.round(macros.p)}p ·{" "}
                        {Math.round(macros.c)}c · {Math.round(macros.f)}f
                      </span>
                    </button>
                    {menuManage ? (
                      <button
                        type="button"
                        onClick={() => {
                          haptic("warn");
                          removeTemplate(t.id);
                        }}
                        aria-label={`Hapus ${t.name}`}
                        style={{ ...dockBtn, fontSize: 13, color: "#6a6660" }}
                      >
                        HAPUS
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => applyTemplate(t)}
                        aria-label={`Catat ${t.name}`}
                        style={dockBtn}
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* ── THE LIBRARY — SEMUA shows it all straight away ──
              No "⭐ SERING DIPAKAI" / "☆ MENU SIMPANAN" headings and no
              "// N HASIL" count: the segmented control already says what
              you're looking at. */}
          {!q && !browseOpen ? (
            <>
              <div style={{ height: 16 }} />
              {sortGroupToolbar}
              {browsing ? (
                loadingAll && !allFoods ? (
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
                      MEMUAT LIBRARY…
                    </span>
                  </div>
                ) : catalogueError ? (
                  // Never leave the user staring at a spinner that will never
                  // stop. Say what went wrong and give them a way out.
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      padding: "30px 16px",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: "#e8e4e0" }}>
                      {catalogueError}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: "#6a6660", lineHeight: 1.6 }}>
                      Kamu masih bisa cari lewat kolom di bawah.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        haptic("tap");
                        clearCatalogueCache();
                        runCatalogueLoad(true);
                      }}
                      style={{
                        marginTop: 2,
                        padding: "11px 20px",
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: MONO,
                        fontSize: 10.5,
                        letterSpacing: ".12em",
                        color: "#e8e4e0",
                        background: "rgba(255,255,255,.06)",
                      }}
                    >
                      COBA LAGI
                    </button>
                  </div>
                ) : (
                  <>
                    {groupCuisine ? (
                      renderCuisineGroups(browseCuisineGroups)
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {browseList.map(renderResultRow)}
                      </div>
                    )}
                    {browseTruncated ? (
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: ".08em",
                          color: "#6a6660",
                          textAlign: "center",
                          marginTop: 14,
                        }}
                      >
                        menampilkan {BROWSE_CAP} teratas dari {fmtCount(browseSorted.length)} · ketik buat cari sisanya
                      </div>
                    ) : null}
                  </>
                )
              ) : null}
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
                    <span style={{ color: "#8a837d" }}>MENCARI…</span>
                  </>
                ) : null}
              </div>

              {/* RACIK — the typed plate read as its parts, offered above the
                  ordinary results because it answers the whole query rather
                  than one word of it. */}
              {racik ? (
                <button
                  type="button"
                  onClick={addRacik}
                  style={{
                    width: "100%",
                    marginBottom: 10,
                    padding: "13px 14px",
                    borderRadius: 14,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "#f1ede9",
                    background: "rgba(238,60,48,.08)",
                    border: "1.5px dashed rgba(238,60,48,.45)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: ".16em",
                      color: "#ffb99e",
                    }}
                  >
                    RACIK · {racik.foods.length} BAHAN
                  </span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, marginTop: 5 }}>
                    {racik.foods.map((f) => f.name).join("  +  ")}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: MONO,
                      fontSize: 9.5,
                      color: "#8a837d",
                      marginTop: 5,
                    }}
                  >
                    {Math.round(
                      racik.foods.reduce((n, f) => {
                        const per = baseGrams(f);
                        const g = f.portionG && f.portionG > 0 ? f.portionG : per;
                        return n + (f.kcal * g) / per;
                      }, 0)
                    )}{" "}
                    kkal · tap untuk tambah semua
                    {racik.unmatched.length > 0 ? ` · nggak kenal: ${racik.unmatched.join(", ")}` : ""}
                  </span>
                </button>
              ) : null}

              {searchResultCount > 0 && sortGroupToolbar}

              {groupCuisine ? (
                renderCuisineGroups(cuisineGroups)
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sortedSearch.map(renderResultRow)}
                </div>
              )}
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
              ) : searchResultCount === 0 && !racik ? (
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

        {/* ── THE DOCK — one search field, present in every state ──
            The floating ⋯ / ＋ FABs are gone; both live in the pill as neutral
            34px squares. SIMPAN stacks directly above once the tray has
            something in it, so the two live actions are always in the same
            place under your thumb. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            padding: "14px 16px calc(16px + env(safe-area-inset-bottom)) 16px",
            background: "linear-gradient(180deg,rgba(0,0,0,0),#000 32%)",
          }}
        >
          {count > 0 ? (
            <button
              type="button"
              onClick={saveBuilderMeal}
              style={{
                width: "100%",
                marginBottom: 9,
                padding: 15,
                borderRadius: 16,
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 15,
                color: "#fff",
                cursor: "pointer",
                border: "none",
                background: FIRE,
                textShadow: "0 1px 2px rgba(120,15,5,.5)",
              }}
            >
              SIMPAN {Math.round(tk)} KKAL
            </button>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: 6,
              borderRadius: 18,
              background: "rgba(255,255,255,.06)",
            }}
          >
            <input
              ref={searchRef}
              type="text"
              className="fb-search-input"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Cari makanan"
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: "border-box",
                padding: "9px 2px",
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: 16, // ≥16 avoids iOS focus zoom
                color: "#ffffff",
                background: "transparent",
                border: "none",
                outline: "none",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
            <button
              type="button"
              aria-label="Library"
              onClick={() => {
                haptic("tap");
                setBrowseOpen((v) => !v);
              }}
              style={dockBtn}
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
              style={dockBtn}
            >
              ＋
            </button>
          </div>
        </div>
      </div>

      {/* the camera behind the tray's 44px button */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (!file) return;
          setPhoto((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
          haptic("success");
        }}
        style={{ display: "none" }}
      />

      {/* full-screen photo viewer */}
      {photoViewer && photo ? (
        <div
          onClick={() => setPhotoViewer(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 280,
            background: "rgba(0,0,0,.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              aspectRatio: "3 / 4",
              borderRadius: 18,
              background: `center / cover no-repeat url(${JSON.stringify(photo)})`,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "calc(30px + env(safe-area-inset-bottom))",
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              gap: 9,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPhotoViewer(false);
                photoInputRef.current?.click();
              }}
              style={{
                padding: "12px 18px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: ".1em",
                color: "#e8e4e0",
                background: "rgba(255,255,255,.1)",
              }}
            >
              FOTO ULANG
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoto((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
                setPhotoViewer(false);
                haptic("warn");
              }}
              style={{
                padding: "12px 18px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: ".1em",
                color: "#e8e4e0",
                background: "rgba(255,255,255,.1)",
              }}
            >
              HAPUS
            </button>
          </div>
        </div>
      ) : null}

      {/* ── PORTION SHEET — the only way into the tray ──
          Tapping a row opens this instead of adding straight away, so the
          portion and any add-ons are decided before anything is committed. */}
      {sheet ? (() => {
        const ing = bIng(sheet.id);
        if (!ing) return null;
        const { label, portionG } = satuanFor(ing);
        const perUnit = baseGrams(ing);
        const qty = sheet.grams / perUnit;
        const delta = modDelta(sheet.mods);
        const kc = Math.max(0, Math.round(ing.kcal * qty + delta.kcal));
        const pr = Math.max(0, Math.round(ing.protein * qty + delta.p));
        const cb = Math.max(0, Math.round(ing.carbs * qty + delta.c));
        const ft = Math.max(0, Math.round(ing.fat * qty + delta.f));
        const stepIdx = nearestStep(sheet.grams, portionG);
        const available = modsFor(catKeyFor(ing));
        return (
          <div
            onClick={() => setSheet(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 260,
              background: "rgba(0,0,0,.72)",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              // The backdrop closes on click; without this every tap inside
              // the panel would dismiss the sheet.
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 480,
                margin: "0 auto",
                borderRadius: "26px 26px 0 0",
                padding: "20px 18px calc(20px + env(safe-area-inset-bottom))",
                background: "#0d0c0d",
                border: "none",
                animation: "sheetCardIn .44s var(--ease-ios) both",
                maxHeight: "88dvh",
                overflowY: "auto",
              }}
            >
              {/* header — name, live macros, live kcal */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 17,
                      color: "#ffffff",
                      lineHeight: 1.2,
                    }}
                  >
                    {ing.name}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#8a837d",
                      marginTop: 5,
                    }}
                  >
                    {pr}p · {cb}c · {ft}f
                  </div>
                </div>
                <div style={{ flex: "none", textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 26,
                      color: "#ffffff",
                      lineHeight: 1,
                    }}
                  >
                    {kc}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 8.5,
                      letterSpacing: ".16em",
                      color: "#6a6660",
                      marginTop: 4,
                    }}
                  >
                    kkal
                  </div>
                </div>
              </div>

              {/* portion slider */}
              <div
                style={{
                  marginTop: 18,
                  padding: "14px 14px 10px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,.03)",
                  border: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: ".14em",
                      color: "#8a837d",
                    }}
                  >
                    PORSI ·{" "}
                    <span style={{ color: "#ffffff" }}>
                      {resolveSatuan(label, PORTION_STEPS[stepIdx].mult)}
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(Math.round(sheet.grams))}
                      onChange={(e) => {
                        const g = parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0;
                        setSheet((x) => (x ? { ...x, grams: Math.min(3000, g) } : x));
                      }}
                      aria-label="Gram"
                      style={{
                        width: 56,
                        textAlign: "right",
                        fontFamily: MONO,
                        fontSize: 16, // ≥16 avoids iOS focus zoom
                        color: "#ffffff",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        padding: 0,
                      }}
                    />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#6a6660" }}>g</span>
                  </span>
                </div>

                <div style={{ position: "relative", height: 26, marginTop: 12 }}>
                  {/* track */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 10.5,
                      height: 5,
                      borderRadius: 3,
                      background: "rgba(255,255,255,.1)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 10.5,
                      height: 5,
                      borderRadius: 3,
                      width: `${(stepIdx / (PORTION_STEPS.length - 1)) * 100}%`,
                      background: "#f1ede9",
                      transition: "width .3s cubic-bezier(.16,1,.3,1)",
                    }}
                  />
                  {/* tick dots — they invert as the fill passes them */}
                  {PORTION_STEPS.map((_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: `${(i / (PORTION_STEPS.length - 1)) * 100}%`,
                        top: 11.5,
                        width: 3,
                        height: 3,
                        marginLeft: -1.5,
                        borderRadius: "50%",
                        background:
                          i <= stepIdx ? "rgba(20,17,16,.45)" : "rgba(255,255,255,.28)",
                      }}
                    />
                  ))}
                  <input
                    type="range"
                    min={0}
                    max={PORTION_STEPS.length - 1}
                    step={1}
                    value={stepIdx}
                    aria-label="Porsi"
                    onChange={(e) => {
                      const i = parseInt(e.target.value, 10) || 0;
                      const g = Math.round(portionG * PORTION_STEPS[i].mult);
                      setSheet((x) => (x ? { ...x, grams: g } : x));
                    }}
                    className="mk-portion"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      margin: 0,
                      opacity: 0,
                      cursor: "pointer",
                    }}
                  />
                  {/* thumb */}
                  <span
                    aria-hidden="true"
                    className="mk-thumb"
                    style={{
                      position: "absolute",
                      left: `${(stepIdx / (PORTION_STEPS.length - 1)) * 100}%`,
                      top: 6,
                      width: 12,
                      height: 14,
                      marginLeft: -6,
                      borderRadius: 4,
                      background: "#ffffff",
                      transition: "left .3s cubic-bezier(.16,1,.3,1)",
                      pointerEvents: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 6,
                  }}
                >
                  {PORTION_STEPS.map((st, i) => {
                    const on = i === stepIdx;
                    return (
                      <button
                        key={st.label}
                        type="button"
                        onClick={() => {
                          haptic("tap");
                          setSheet((x) =>
                            x ? { ...x, grams: Math.round(portionG * st.mult) } : x
                          );
                        }}
                        style={{
                          flex: 1,
                          padding: "4px 0",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: MONO,
                          fontSize: 10,
                          fontWeight: on ? 700 : 500,
                          color: on ? "#ffffff" : "#5a544f",
                          transform: on ? "scale(1.18)" : "scale(1)",
                          transition: "transform .2s, color .2s",
                        }}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TAMBAHAN */}
              {available.length > 0 ? (
                <>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: ".16em",
                      color: "#6a6660",
                      margin: "18px 0 8px 2px",
                    }}
                  >
                    TAMBAHAN
                  </div>
                  <ModWheel
                    mods={available}
                    active={sheet.mods}
                    onToggle={(key) => {
                      haptic("tap");
                      setSheet((x) => {
                        if (!x) return x;
                        const cur = x.mods.slice();
                        const at = cur.indexOf(key);
                        if (at >= 0) cur.splice(at, 1);
                        else cur.push(key);
                        return { ...x, mods: cur };
                      });
                    }}
                  />
                </>
              ) : null}

              <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  style={{
                    flex: "none",
                    width: 96,
                    padding: "14px 0",
                    borderRadius: 14,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".1em",
                    color: "#8a837d",
                    background: "rgba(255,255,255,.03)",
                  }}
                >
                  BATAL
                </button>
                <button
                  type="button"
                  onClick={confirmPortionSheet}
                  style={{
                    flex: 1,
                    padding: "14px 0",
                    borderRadius: 14,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: ".1em",
                    color: "#fff",
                    background: FIRE,
                    textShadow: "0 1px 2px rgba(120,15,5,.5)",
                  }}
                >
                  TAMBAH · {kc} KKAL
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}

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
                database bersama — biar semua orang bisa cari juga.
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
            {/* Household measures — tap "1 porsi" instead of doing gram math. */}
            {(() => {
              if (editing.mode !== "edit" || !editing.id) return null;
              const f = bIng(editing.id);
              const sv = f?.servings ?? [];
              if (sv.length === 0) return null;
              return (
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: ".14em",
                      color: "#7c736e",
                      marginBottom: 8,
                    }}
                  >
                    UKURAN RUMAHAN
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {sv.map((s) => {
                      const active = Math.abs(editing.grams - s.grams) < 0.5;
                      return (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => editSetGrams(s.grams)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            fontFamily: MONO,
                            fontSize: 10.5,
                            fontWeight: active ? 700 : 400,
                            cursor: "pointer",
                            color: active ? "#fff" : "#cfc8c2",
                            background: active ? FIRE : "rgba(255,255,255,.04)",
                            border: active
                              ? "1px solid rgba(255,150,120,.6)"
                              : "1px solid rgba(255,255,255,.12)",
                          }}
                        >
                          {s.label}{" "}
                          <span style={{ color: active ? "rgba(255,235,225,.8)" : "#7c736e" }}>
                            {Math.round(s.grams)}g
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
              GRUP BARU
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

      {/* ── Name this menu (save tray as a template) ── */}
      {namingTemplate ? (
        <div
          onClick={() => setNamingTemplate(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 320,
            background: "rgba(4,3,5,.74)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              borderRadius: 22,
              padding: 20,
              background: "linear-gradient(180deg,#161011,#0c0a0b 60%)",
              border: "1px solid rgba(255,255,255,.12)",
              boxShadow: "0 24px 60px rgba(0,0,0,.6)",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 18, color: "#f5f2ef" }}>
              Simpan jadi menu
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "#8a837d", marginTop: 6, lineHeight: 1.5 }}
            >
              {count} item · {Math.round(tk)} kkal. Besok tinggal satu tap.
            </div>


            <input
              autoFocus
              type="text"
              value={namingTemplate.name}
              placeholder="Sarapan biasa"
              onChange={(e) =>
                setNamingTemplate((n) => (n ? { ...n, name: e.target.value } : n))
              }
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => e.key === "Enter" && confirmSaveTemplate()}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "13px 14px",
                borderRadius: 13,
                background: "#0c0a0b",
                border: "1px solid rgba(255,255,255,.14)",
                color: "#f1ede9",
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 600,
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setNamingTemplate(null)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 13,
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#9a938d",
                  cursor: "pointer",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid rgba(255,255,255,.1)",
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmSaveTemplate}
                style={{
                  flex: 2,
                  padding: 14,
                  borderRadius: 13,
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#fff",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  textShadow: "0 1px 2px rgba(120,15,5,.5)",
                }}
              >
                SIMPAN ☆
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
