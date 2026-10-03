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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useSheetBack } from "@/lib/backSheet";
import { haptic } from "@/lib/haptics";
import { INGREDIENTS, macrosFor } from "@/lib/ingredients";
import { drinkSugarFull, SUGAR_LEVELS } from "@/lib/drinkSugar";
import {
  saveMeal,
  getAllMeals,
  isCustomItem,
  type MealItem,
  type CustomMealItem,
} from "@/lib/store";
import { contributeFood } from "@/lib/foodContribute";
import { foodLabel } from "@/lib/foodLabel";
import { prettyFoodName } from "@/lib/foodDisplayName";
import { loadCatalogue, clearCatalogueCache } from "@/lib/foodCatalogue";
import { prepare as prepareSearch, searchPrepared } from "@/lib/foodSearch";
import RecipeComposer from "./RecipeComposer";
import NutritionLabelPanel from "./NutritionLabelPanel";
import ManualFoodSheet from "./ManualFoodSheet";
import { scaleNutritionExtras } from "@/lib/nutritionLabel";
import SearchField from "./SearchField";
import NutritionSummary from "./NutritionSummary";
import Icon from "../ui/Icon";
import type { RecipeFood } from "@/lib/recipes";
import PortionSheet from "./picker/PortionSheet";
import PickerHome, { type TileView, type UsualChip } from "./picker/PickerHome";
import FacetRows, { type VariantChip } from "./picker/FacetRows";
import { buildFamilies, type Family, type Picks } from "@/lib/foodFamilies";
import {
  applyPick,
  buildTiles,
  canonicalLeaf,
  facetRows,
  leavesFor,
} from "@/lib/foodTiles";
import { makePredictor } from "@/lib/foodPredict";
import { openingChoice } from "@/lib/foodPicker";
import {
  gramsToSave,
  itemMacros,
  portionModel,
  qtyFromGrams,
  servingPreview,
} from "@/lib/trayMath";
import { recordFoodPick, getFoodPicks, type FoodPick } from "@/lib/foodPicks";
import {
  affinityScorer,
  migrateFromPicks,
  recordAffinity,
  recordImpressions,
  suppressionScorer,
} from "@/lib/foodAffinity";
import {
  getFoodGroups,
  addFoodToGroup,
  createFoodGroup,
  type FoodGroup,
  type CustomFoodDef,
} from "@/lib/foodGroups";
import { CUISINE_BY_KEY, type CuisineKey } from "@/lib/cuisine";
import { getDaily } from "@/lib/store";
import { TARGETS, todayKey } from "@/lib/targets";
import { satuanFor, parseSatuan, baseGrams } from "@/lib/satuan";
import { modsFor, modDelta, modSummary, type FoodMod } from "@/lib/foodMods";
import { STAPLE_POPULARITY } from "@/lib/ingredients";
import { emptyHistory } from "@/lib/suggest";
import {
  getHistoryStats,
  invalidateHistoryStats,
  categoryForGroup,
} from "@/lib/suggest/adapter";
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
const MONO = "var(--font-dm-sans), sans-serif";
const FIRE = "var(--accent)";
const ZH = "'Noto Serif SC',serif";
const BLABEL: Record<string, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  snack: "Camilan",
  dinner: "Makan malam",
};

type MealT = "breakfast" | "lunch" | "snack" | "dinner";

/** Meal -> the affinity store's slot index (0 breakfast, 1 lunch, 2 dinner, 3 snack). */
const MEAL_TO_SLOT = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;
const MEAL_KEYS: MealT[] = ["breakfast", "lunch", "snack", "dinner"];

// Common shape shared by library ingredients, session custom foods and
// custom-group foods. All optional fields default to absent.
type BuilderFood = import("@/lib/nutritionLabel").NutritionExtras & {
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
  /** Static popularity prior (0–200). Never shown; ranks and orders. */
  popularity?: number;
  missingNutrition?: boolean;
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

/** Add-ons are explicit toggles; scrolling never selects or duplicates them. */
function AddonChoices({
  mods,
  active,
  onToggle,
}: {
  mods: FoodMod[];
  active: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0,1fr))",
        gap: 8,
        paddingBottom: 8,
      }}
    >
      {mods.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={active.includes(m.key)}
          onClick={() => onToggle(m.key)}
          style={{
            minHeight: 58,
            minWidth: 44,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(84,119,93,.16)",
            cursor: "pointer",
            textAlign: "left",
            color: active.includes(m.key) ? "var(--text)" : "var(--text)",
            background: active.includes(m.key)
              ? "rgba(238,60,48,.24)"
              : "rgba(84,119,93,.04)",
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {m.label}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: SANS,
              fontSize: 11,
              marginTop: 4,
              color: "#aaa29b",
            }}
          >
            {m.note}
          </span>
        </button>
      ))}
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
  protein: { label: "PROTEIN", color: "var(--text)" },
  carb: { label: "KARBO", color: "#5ac8f5" },
  vegetable: { label: "SAYUR", color: "#5fe39a" },
  extra: { label: "EKSTRA", color: "var(--text)" },
  drink: { label: "MINUM", color: "#b28bf0" },
};
/** The curated staples, with the popularity prior the eval harness has always
 *  given them and the app never did — so the 141 foods the app is built around
 *  were ranked as if nobody had ever eaten them. */
const STAPLES: BuilderFood[] = (INGREDIENTS as BuilderFood[]).map((i) => ({
  ...i,
  name: foodLabel(i),
  englishName: i.name,
  popularity: STAPLE_POPULARITY,
}));

/** The colour of the food mound on the portion plate, by category. */
const TINT: Record<string, string> = {
  protein: "#c98a4a",
  carb: "var(--text)",
  vegetable: "#6fbf73",
  extra: "var(--text)",
  drink: "#a48bd6",
};

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

/** The bucket key itself ("protein" / "drink" / …) — decides which add-ons a
 *  food is offered in the portion sheet, and feeds the suggestion rules. */
function catKeyFor(f: BuilderFood): string {
  return (
    (f.foodGroup && GROUP_TO_BUCKET[f.foodGroup]) ||
    GROUP_TO_BUCKET[f.group] ||
    "extra"
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────

export default function FoodBuilder({
  meal,
  dateKey,
  onClose,
  onSaved,
  startInRacik = false,
  startInLabel = false,
}: {
  meal: MealT;
  dateKey: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Open straight into the ingredient composer, with the search field focused
   *  and a worked example on screen. RACIK could already read a typed plate as
   *  its parts, but only if you guessed that typing several foods at once was
   *  a thing — nothing in the UI said so. */
  startInRacik?: boolean;
  startInLabel?: boolean;
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
  const [addedFlash, setAddedFlash] = useState<{
    name: string;
    tick: number;
  } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [recipeOpen, setRecipeOpen] = useState(startInRacik);
  const [labelOpen, setLabelOpen] = useState(startInLabel);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualGroup, setManualGroup] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, MacroPatch>>({});
  const [customFoods, setCustomFoods] = useState<BuilderFood[]>([]);
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    all: true,
  });
  // Browse-all lives behind the floating ⋯ button (search is the hero).
  const [browseOpen, setBrowseOpen] = useState(false);
  // Reveals delete controls on the saved-menu rows (behind EDIT MENU).
  const [menuManage, setMenuManage] = useState(false);
  // The portion sheet. Nothing reaches the tray until TAMBAH is pressed, so a
  // mis-tap on a row costs nothing.
  const [sheet, setSheet] = useState<{
    id: string;
    grams: number;
    mods: string[];
    /** Set when the sheet was opened from a family tile: which tile, and which
     *  chips are lit. Absent for a plain search hit, which has no siblings to show. */
    fam?: { tileId: string; picks: Picks; family: Family<BuilderFood> };
  } | null>(null);
  // Add-ons chosen per tray entry, so "ayam goreng · extra minyak" survives a
  // portion edit and shows on the tray row.
  const [entryMods, setEntryMods] = useState<Record<string, string[]>>({});
  // Suggestions waved away this session (not persisted — a new meal starts fresh).
  // Habit stats + persisted dismissal counts. Both are read once on mount:
  // suggest() has a 16ms budget and must never touch storage itself.
  const [historyStats, setHistoryStats] = useState(() => emptyHistory());
  // Everything already saved today, and the day's targets — the inputs the
  // engine needs to know whether the day is short on protein or has room left.
  const [consumedToday, setConsumedToday] = useState({
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  // `now` is captured once so the engine's output can't change mid-render.
  const [now] = useState(() => new Date());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newGroup, setNewGroup] = useState<{
    name: string;
    emoji: string;
  } | null>(null);
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
  // A session snapshot: confirmed additions teach the NEXT session, without
  // moving tiles under the user's finger during this one.
  const [pickerHistory, setPickerHistory] = useState<FoodPick[]>([]);
  // Saved meal templates ("Sarapan biasa") + the name-it sheet.
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [namingTemplate, setNamingTemplate] = useState<{
    name: string;
    emoji: string;
  } | null>(null);
  // Whole catalogue (lazy) — powers sort/group across the FULL library, not
  // just the relevant search hits.
  const [allFoods, setAllFoods] = useState<BuilderFood[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const builderRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    builderRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  // Persisted custom "libraries" + saved meal templates (localStorage).
  useEffect(() => {
    setGroups(getFoodGroups());
    setTemplates(getMealTemplates());
  }, []);

  // Everything the suggestion engine needs, read once. It's all storage work,
  // which is exactly what suggest() is forbidden from doing on the hot path.
  useEffect(() => {
    setHistoryStats(getHistoryStats());
    // What's already saved today, so the engine doesn't count the tray twice.
    const saved = getAllMeals().filter((m) => m.date === dateKey);
    let kcal = 0,
      protein = 0,
      carbs = 0,
      fat = 0;
    for (const m of saved) {
      for (const it of m.items) {
        if (isCustomItem(it)) {
          kcal += it.kcal;
          protein += it.protein;
          carbs += it.carbs;
          fat += it.fat;
        } else {
          const mm = macrosFor(it.id, it.qty);
          kcal += mm.kcal;
          protein += mm.protein;
          carbs += mm.carbs;
          fat += mm.fat;
        }
      }
    }
    setConsumedToday({ kcal, protein, carbs, fat });
  }, [dateKey]);

  // Live search against the shared food DB (TKPI + custom + libraries).
  // Debounced; per-100g values map to a "100 g" unit so the qty math and the
  // save path work unchanged.
  useEffect(() => {
    const term = query.trim();
    setSearchError(null);
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
        .then((r) => {
          if (!r.ok)
            throw new Error(
              "Pencarian online belum tersedia. Hasil yang tersimpan tetap bisa dipakai.",
            );
          return r.json();
        })
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
            missingNutrition: [
              f.energy_kcal,
              f.protein_g,
              f.fat_g,
              f.carb_g,
            ].some((v) => v == null),
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
              if (!prev) {
                next[m.id] = m;
                continue;
              }
              const merged = { ...prev };
              for (const [k, v] of Object.entries(m)) {
                if (v !== undefined && v !== null)
                  (merged as Record<string, unknown>)[k] = v;
              }
              next[m.id] = merged;
            }
            return next;
          });
        })
        .catch(() => {
          if (!cancelled) {
            setSearching(false);
            setSearchError(
              navigator.onLine
                ? "Pencarian online belum tersedia. Hasil tersimpan tetap bisa dipakai."
                : "Koneksi terputus. Cari makanan tersimpan atau tambah manual.",
            );
          }
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
        missingNutrition: [f.energy_kcal, f.protein_g, f.fat_g, f.carb_g].some(
          (v) => v == null,
        ),
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
        popularity: f.popularity ?? undefined,
        step: 0.1,
      }));
      setAllFoods(mapped);
      setDbCache((c) => {
        const next = { ...c };
        // Current catalogue rows supersede old pick snapshots (including their
        // real serving weight). History remembers ids, not obsolete nutrition.
        for (const m of mapped) next[m.id] = { ...next[m.id], ...m };
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
    gramsPerUnit: p.gramsPerUnit,
    step: p.step ?? 0.1,
  });

  // On mount: load the user's staples and seed the cache so they resolve for
  // add/display even before any search this session.
  useEffect(() => {
    const p = getFoodPicks();
    setPickerHistory(p);
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
    [],
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

  /** Open the portion sheet for a food. Seeds grams from what's already in the
   *  tray, or from the food's default household portion. */
  const openPortionSheet = (id: string) => {
    haptic("tap");
    const ing = bIng(id);
    if (!ing) return;
    const model = portionModel(ing, satuanFor(ing).portionG);
    const cur = selection[id] || 0;
    // Open at what THIS person usually eats, not the generic portion — after a
    // few logs the slider starts in the right place on its own. Only for foods
    // whose weight is real: a "usual 250 g" of a food with no gram basis would
    // be a made-up weight, and it is exactly how noodle soup opened at 950 kkal.
    const usual = historyStats.medianPortion.get(id);
    setSheet({
      id,
      grams: Math.round(
        cur > 0
          ? cur * model.unitG
          : model.mode === "grams" && usual && usual > 0
            ? usual
            : model.defaultG,
      ),
      mods: (entryMods[id] ?? []).slice(),
    });
  };

  /**
   * Teach the predictor. EVERY route that puts food on the tray — the portion
   * sheet, a saved menu, the RACIK composer — ends here, so "what's next" learns
   * from all of them and not only the one that happened to be built first.
   * File the pick under the meal the user CHOSE, not the wall clock: logging
   * yesterday's dinner at 9am is a dinner, and the hour-based slot disagreed
   * with the app's own meal logic for 11 of 24 hours.
   */
  const learnPick = (
    foods: Pick<
      BuilderFood,
      | "id"
      | "name"
      | "kcal"
      | "protein"
      | "fat"
      | "carbs"
      | "unit"
      | "gramsPerUnit"
      | "step"
    >[],
  ) => {
    const withThisMeal = [...platedIds];
    for (const f of foods) {
      recordFoodPick({
        id: f.id,
        name: f.name,
        kcal: f.kcal,
        protein: f.protein,
        fat: f.fat,
        carbs: f.carbs,
        unit: f.unit,
        gramsPerUnit: f.gramsPerUnit,
        step: f.step,
      });
      recordAffinity(f.id, withThisMeal, Date.now(), MEAL_TO_SLOT[activeMeal]);
      // Foods added together in one go are eaten together: each one is part of
      // the plate for the next.
      if (!withThisMeal.includes(f.id)) withThisMeal.push(f.id);
    }
    setPicks(getFoodPicks());
  };

  /**
   * Put a food on the tray at a chosen amount. The ONE path in: the portion
   * sheet's TAMBAH, the family picker, and anything that follows calls this, so
   * the arithmetic and the learning cannot drift between them.
   */
  const commitFood = (
    id: string,
    grams: number,
    mods: string[] = [],
    opts: { refocus?: boolean } = {},
  ): boolean => {
    const ing = bIng(id);
    if (!ing || ing.missingNutrition || !(grams > 0)) return false;
    const model = portionModel(ing, satuanFor(ing).portionG);
    setSelection((sel) => ({ ...sel, [id]: qtyFromGrams(model.unitG, grams) }));
    setEntryMods((m) => ({ ...m, [id]: mods }));
    setJustId(id);
    setAddTick((t) => t + 1);
    learnPick([ing]);
    setQuery("");
    setAddedFlash((f) => ({ name: ing.name, tick: (f?.tick ?? 0) + 1 }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setAddedFlash(null), 1400);
    haptic("success");
    if (opts.refocus !== false) setTimeout(() => searchRef.current?.focus(), 0);
    return true;
  };

  /** TAMBAH on the portion sheet. */
  const confirmPortionSheet = () => {
    const sh = sheet;
    if (!sh) return;
    commitFood(sh.id, sh.grams, sh.mods, { refocus: query.trim().length > 0 });
    setSheet(null);
  };

  const toggleReveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const bRemove = (id: string) =>
    setSelection((sel) => {
      const next = { ...sel };
      delete next[id];
      return next;
    });
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
        mods: [...(entryMods[id] ?? [])],
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
    learnPick(t.items);
    setEntryMods((prev) => {
      const next = { ...prev };
      for (const it of t.items)
        next[it.id] = Array.isArray(it.mods)
          ? it.mods.filter((m) => typeof m === "string")
          : [];
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
      if (!ing || ing.missingNutrition) continue;
      const libIng = INGREDIENTS.find((i) => i.id === id);
      const mods = entryMods[id] ?? [];
      if (libIng && !overrides[id] && mods.length === 0) {
        // plain library ingredient — reference by id + qty
        items.push({ id, qty });
      } else {
        // Overridden, custom, or ADD-ONS present: snapshot the macros. An id+qty
        // reference cannot carry an add-on — readers price it from the id alone —
        // so a plain reference would silently drop the extra sambal that the tray
        // had just shown.
        const m = itemMacros(ing, qty, mods);
        const why = modSummary(mods);
        const item: CustomMealItem = {
          custom: true,
          name: why ? `${ing.name} · ${why}` : ing.name,
          // 0 when the weight is unknown — MealHome shows "1 porsi". It used to
          // store `qty` here, which is how soto got logged as "4 g".
          grams: gramsToSave(ing, qty),
          portionLabel: `${round1(qty)} × ${ing.unit}`,
          kcal: m.kcal,
          protein: m.protein,
          fat: m.fat,
          carbs: m.carbs,
          ...scaleNutritionExtras(ing, qty),
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
  const openNewFood = (groupId: string | null = null) => {
    setManualGroup(groupId);
    setManualOpen(true);
  };
  function addComputedFood(food: RecipeFood, ingredients?: RecipeFood[]) {
    const added: BuilderFood = { ...food, group: "custom" };
    setCustomFoods((prev) => [...prev, added]);
    if (manualOpen && manualGroup) {
      addFoodToGroup(manualGroup, added);
      setGroups(getFoodGroups());
    }
    setSelection((prev) => ({ ...prev, [food.id]: 1 }));
    learnPick(
      ingredients?.length
        ? ingredients.map((f) => ({ ...f, group: "custom" }))
        : [added],
    );
    setRecipeOpen(false);
    setLabelOpen(false);
    setManualOpen(false);
    setManualGroup(null);
    setQuery("");
    haptic("success");
  }

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
    val: number,
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
        grams,
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
          gs.map((g) =>
            g.id === gid ? { ...g, foods: [...g.foods, food] } : g,
          ),
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
  const merged: BuilderFood[] = STAPLES.concat(customFoods)
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
    return affinityScorer({ plate: platedIds, slot: MEAL_TO_SLOT[activeMeal] });
  }, [platedIds, activeMeal]);
  const suppression = useMemo(() => suppressionScorer(), [platedIds]);

  const searchPool = useMemo(
    () =>
      prepareSearch(
        merged.concat(allFoods ?? []).filter((f) => !f.missingNutrition),
      ),
    // Re-prepared only when the underlying lists change, never per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customFoods, groups, allFoods, overrides],
  );
  // ── THE QUICK PICKER ───────────────────────────────────────────────────
  //
  // Built from the same pool search uses, with the same deps, so it re-derives
  // only when the lists change — never per keystroke.
  const familyIndex = useMemo(
    () =>
      buildFamilies(
        merged.concat(allFoods ?? []).filter((f) => !f.missingNutrition),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customFoods, groups, allFoods, overrides],
  );
  const tiles = useMemo(() => buildTiles(familyIndex), [familyIndex]);
  const predictor = useMemo(
    () =>
      makePredictor({
        affinity: affinityScorer({
          slot: MEAL_TO_SLOT[activeMeal],
          now: now.getTime(),
        }),
        history: pickerHistory,
        now: now.getTime(),
      }),
    [activeMeal, pickerHistory, now],
  );

  // Tiles in the order THIS person wants them: habit first, then the curated
  // cold-start order. A single stray pick must not reorder the screen, so a tile
  // only counts as personal once there is real evidence behind it.
  const tileViews: TileView[] = useMemo(() => {
    const scored = tiles.map((t) => {
      const ev = predictor.evidence(t.family as never);
      const personal = ev >= 0.5;
      const home = ["nasi", "ayam", "daging", "ikan", "telur", "sayur"];
      const homeRank = home.indexOf(t.id);
      const prior =
        homeRank >= 0
          ? 2 - homeRank * 0.07
          : t.curated === Infinity
            ? 0.2
            : 1 - t.curated * 0.02;
      return { t, personal, score: personal ? 3 + ev : prior };
    });
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.t.curated - b.t.curated ||
        a.t.id.localeCompare(b.t.id),
    );
    return scored
      .filter(({ t, personal }) => Number.isFinite(t.curated) || personal)
      .map(({ t, personal }) => {
        const best = personal
          ? predictor.orderLeaves(t.family.leaves)[0]
          : null;
        return {
          id: t.id,
          label: t.label,
          emoji: t.emoji,
          personal,
          hint: best
            ? `Biasa: ${best.food.name}`
            : `${t.family.leaves.length} pilihan`,
        };
      });
  }, [tiles, predictor]);

  // The "right now" chips. Read in an effect, not during render: it touches
  // localStorage, and the server cannot know it — computing it inline would
  // hydrate differently from the HTML it was sent.
  const [usual, setUsual] = useState<{ title: string; chips: UsualChip[] }>({
    title: "FAVORIT",
    chips: [],
  });
  useEffect(() => {
    const habit = predictor
      .orderLeaves([...familyIndex.families.values()].flatMap((f) => f.leaves))
      .filter((l) => predictor.foodEvidence(l.food.id) > 0)
      .slice(0, 6)
      .map((l) => l.food);
    const chosen =
      habit.length > 0 ? habit : STAPLES.filter((f) => f.favorite).slice(0, 4);
    setUsual({
      title: habit.length > 0 ? BLABEL[activeMeal] : "FAVORIT",
      chips: chosen.map((f) => ({
        id: f.id,
        name: f.name,
        kcal: itemMacros(
          f,
          portionModel(f, satuanFor(f).portionG).defaultG /
            portionModel(f, satuanFor(f).portionG).unitG,
        ).kcal,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeal, predictor, familyIndex]);

  /** Open the portion sheet from a tile, already sitting on a real food. */
  const openTile = (tileId: string) => {
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const choice = openingChoice(tile.family, predictor);
    if (!choice) return;
    const { leaf, picks: p } = choice;
    haptic("tap");
    const ing = bIng(leaf.food.id);
    if (!ing) return;
    const model = portionModel(ing, satuanFor(ing).portionG);
    const usualG = historyStats.medianPortion.get(ing.id);
    setSheet({
      id: ing.id,
      grams: Math.round(
        model.mode === "grams" && usualG && usualG > 0
          ? usualG
          : model.defaultG,
      ),
      mods: [],
      fam: { tileId, picks: p, family: tile.family },
    });
  };

  /** Move the open sheet to a different food, keeping the user's portion as a
   *  MULTIPLE of the default ("1½ potong" stays 1½ when the potong changes). */
  const moveSheetTo = (
    leafFood: BuilderFood,
    picksNext: Picks,
    tileId: string,
  ) => {
    setSheet((prev) => {
      if (!prev) return prev;
      const from = bIng(prev.id);
      const to = bIng(leafFood.id);
      if (!to) return prev;
      const mTo = portionModel(to, satuanFor(to).portionG);
      let grams = mTo.defaultG;
      if (from) {
        const mFrom = portionModel(from, satuanFor(from).portionG);
        if (mFrom.mode === mTo.mode && mFrom.defaultG > 0)
          grams = Math.round(mTo.defaultG * (prev.grams / mFrom.defaultG));
      }
      const availableMods = new Set(modsFor(catKeyFor(to)).map((m) => m.key));
      return {
        id: to.id,
        grams,
        mods: prev.mods.filter((m) => availableMods.has(m)),
        fam: { tileId, picks: picksNext, family: prev.fam!.family },
      };
    });
  };

  const pickFacet = (axis: Parameters<typeof applyPick>[2], value: string) => {
    const fam = sheet?.fam;
    if (!fam) return;
    const next = applyPick(fam.family, fam.picks, axis, value);
    const left = predictor.orderLeaves(leavesFor(fam.family, next));
    const leaf =
      left.find((l) => predictor.foodEvidence(l.food.id) > 0) ??
      canonicalLeaf(fam.family, next) ??
      left[0];
    if (leaf) moveSheetTo(leaf.food as BuilderFood, next, fam.tileId);
  };

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
    ? searchPrepared(searchPool, q, {
        limit: RANK_LIMIT,
        affinity,
        suppression,
      })
        .map((r) => r.food)
        .concat(
          searchPrepared(prepareSearch(dbResults), q, {
            limit: 30,
            affinity,
            suppression,
          }).map((r) => r.food),
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
  // Record what the user was actually SHOWN, once the query settles.
  //
  // Debounced hard on purpose: typing "telur" fires five renders, and counting
  // each as its own impression would make a food look ignored five times for
  // one glance. 900ms is roughly "stopped typing and looked".
  const shownRef = useRef<string>("");
  useEffect(() => {
    if (!q || searchFlat.length === 0) return;
    const t = window.setTimeout(() => {
      // Only the rows plausibly on screen. Counting rank 50 as "shown and
      // declined" would be a lie about what the user ever saw.
      const key = `${q}|${searchFlat.length}`;
      if (shownRef.current === key) return;
      shownRef.current = key;
      recordImpressions(searchFlat.slice(0, 8).map((f) => f.id));
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchFlat.length]);

  const searchResultCount = searchFlat.length;
  // Browse mode: sort/group with no query → the WHOLE library (capped for perf).
  // With SEMUA as the default, an empty query always means "browse the
  // library" — there is no separate staples screen to fall back to.
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
    defaultOpen = true,
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
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "id"),
  );

  const browseSections: Section[] = [];
  browseSections.push(mk("usual", "", "USUAL KAMU", favs, false, null));
  for (const g of groups) {
    browseSections.push(mk(g.id, g.emoji, g.name, g.foods, true, g.id));
  }
  if (customFoods.length > 0) {
    browseSections.push(
      mk("mine", "", "BUATAN KAMU", customFoods, false, null),
    );
  }
  for (const [name, list] of catalogueGroups) {
    browseSections.push(
      mk(`cat:${name}`, "", name.toUpperCase(), list, false, null, false),
    );
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
    // Through itemMacros so the add-ons are IN the number. They used to move
    // the figure on the sheet and then drop out of the tray total and the save.
    const m = itemMacros(ing, qty, entryMods[id] ?? []);
    tk += m.kcal;
    tp += m.protein;
    tc += m.carbs;
    tf += m.fat;
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

  // Search prices the same portion as confirmation.
  const renderResultRow = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const preview = servingPreview(ing, satuanFor(ing));
    const m = preview.macros;
    return (
      <button
        key={ing.id}
        className="food-result"
        onClick={() => {
          if (ing.missingNutrition) {
            setManualGroup(null);
            setManualOpen(true);
          } else openPortionSheet(ing.id);
        }}
      >
        <span>
          <strong>{ing.name}</strong>
          <small>
            {preview.description} ·{" "}
            {ing.missingNutrition
              ? "Nutrisi belum lengkap"
              : `${Math.round(m.kcal)} kkal`}
          </small>
          {!ing.missingNutrition && (
            <span className="macro-line">
              Protein {round1(m.protein)} g · Karbohidrat {round1(m.carbs)} g ·
              Lemak {round1(m.fat)} g
            </span>
          )}
        </span>
        <Icon name="plus" />
      </button>
    );
  };

  return (
    <>
      <div
        ref={builderRef}
        tabIndex={-1}
        className="food-builder"
        style={{
          visibility:
            recipeOpen || labelOpen || manualOpen ? "hidden" : "visible",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Catat makan"
        inert={
          !!sheet ||
          recipeOpen ||
          labelOpen ||
          manualOpen ||
          !!editing ||
          !!namingTemplate ||
          !!newGroup
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (query) setQuery("");
            else onClose();
          }
          if (e.key === "Tab") {
            const nodes = Array.from(
              builderRef.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]),input:not([disabled]),select,summary,a[href]",
              ) ?? [],
            ).filter((n) => n.getClientRects().length);
            const first = nodes[0],
              last = nodes.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === builderRef.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="builder-header">
          <div className="row-between">
            <button className="text-button" onClick={onClose}>
              Kembali
            </button>
            <label className="meal-select">
              <span className="sr-only">Waktu makan</span>
              <select
                value={activeMeal}
                onChange={(e) => setActiveMeal(e.target.value as MealT)}
              >
                {MEAL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {BLABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h1>Catat makan</h1>
          <SearchField
            value={query}
            onChange={setQuery}
            inputRef={searchRef}
            loading={searching}
          />
          <div className="builder-tools">
            <button className="soft-button" onClick={() => setRecipeOpen(true)}>
              <Icon name="pot" />
              Racik masakan
            </button>
            <button
              className="soft-button"
              onClick={() => setLabelOpen(true)}
            >
              <Icon name="scan" />
              Scan label nutrisi
            </button>
            <button className="text-button" onClick={() => openNewFood(null)}>
              Tambah manual
            </button>
          </div>
        </header>
        <div className="builder-scroll">
          {count > 0 && (
            <section className="builder-tray">
              <div className="row-between">
                <h2>Pilihan makan ({count})</h2>
                <button
                  className="text-button"
                  onClick={() =>
                    setNamingTemplate({ name: "Menu biasa", emoji: "" })
                  }
                >
                  Simpan menu
                </button>
              </div>
              <NutritionSummary
                values={{ kcal: tk, protein: tp, carbs: tc, fat: tf }}
              />
              {traySelected.map(({ id, ing, qty }) => {
                const model = portionModel(ing, satuanFor(ing).portionG);
                const n = itemMacros(ing, qty, entryMods[id] ?? []);
                return (
                  <div className="tray-food" key={id}>
                    <button onClick={() => openPortionSheet(id)}>
                      <strong>{ing.name}</strong>
                      <small>
                        {model.mode === "grams"
                          ? `${Math.round(model.unitG * qty)} g`
                          : `${round1(qty)} × ${ing.unit}`}{" "}
                        · {Math.round(n.kcal)} kkal
                        {modSummary(entryMods[id] ?? [])
                          ? ` · ${modSummary(entryMods[id] ?? [])}`
                          : ""}
                      </small>
                    </button>
                    {model.mode === "grams" && (
                      <button
                        className="text-button"
                        onClick={() => openEdit(id)}
                      >
                        Edit nutrisi
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Hapus ${ing.name} dari pilihan`}
                      onClick={() => bRemove(id)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                );
              })}
            </section>
          )}
          {addedFlash && (
            <p className="status-message" role="status">
              {addedFlash.name} ditambahkan ke pilihan makan.
            </p>
          )}
          {searchError && (
            <p className="status-message" role="status">
              {searchError}
            </p>
          )}
          {!q && !browseOpen && (
            <PickerHome
              mealLabel={BLABEL[activeMeal]}
              usual={usual.chips}
              tiles={tileViews}
              loading={loadingAll && !allFoods}
              error={catalogueError}
              onRetry={() => {
                clearCatalogueCache();
                runCatalogueLoad(true);
              }}
              onTile={openTile}
              onUsual={openPortionSheet}
              onMore={() => setBrowseOpen(true)}
              onImport={() => {
                if (
                  count &&
                  !window.confirm(
                    "Pilihan makan belum disimpan. Pindah ke impor?",
                  )
                )
                  return;
                window.location.href = "/meal/import";
              }}
              onGroup={() => setNewGroup({ name: "", emoji: "" })}
            />
          )}
          {q && (
            <section className="search-results" aria-live="polite">
              <div className="row-between">
                <h2>Hasil pencarian</h2>
                {searching && <span className="quiet">Mencari…</span>}
              </div>
              {searchFlat.map(renderResultRow)}
              {searchResultCount === 0 && !searching && (
                <div className="empty-note">
                  <p>Makanan “{query}” belum ditemukan.</p>
                  <button
                    className="secondary-button"
                    onClick={() => openNewFood(null)}
                  >
                    Tambah makanan manual
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRecipeOpen(true)}
                  >
                    Racik dari bahan
                  </button>
                </div>
              )}
            </section>
          )}
          {!q && templates.length > 0 && (
            <details className="saved-menus">
              <summary>Menu tersimpan ({templates.length})</summary>
              {templates.map((t) => (
                <div className="row-between" key={t.id}>
                  <button
                    className="food-result"
                    onClick={() => applyTemplate(t)}
                  >
                    <span>
                      <strong>{t.name}</strong>
                      <small>
                        {t.items.length} makanan · {templateKcal(t)} kkal
                      </small>
                    </span>
                    <Icon name="plus" />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Hapus menu ${t.name}`}
                    onClick={() => removeTemplate(t.id)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </details>
          )}
          {browseOpen && (
            <section>
              <div className="row-between">
                <h2>Semua makanan</h2>
                <button
                  className="text-button"
                  onClick={() => setBrowseOpen(false)}
                >
                  Tutup daftar
                </button>
              </div>
              {browseSections.map((sec) => (
                <section key={sec.key}>
                  <button
                    className="browse-heading"
                    onClick={sec.onToggle}
                    aria-expanded={sec.open}
                  >
                    {sec.name.toLocaleLowerCase()} · {sec.countLabel}
                  </button>
                  {sec.open && sec.items.map(renderResultRow)}
                  {sec.canAdd && (
                    <button className="text-button" onClick={sec.onAddFood}>
                      Tambah makanan ke grup
                    </button>
                  )}
                </section>
              ))}
            </section>
          )}
        </div>
        {count > 0 && (
          <footer className="builder-footer">
            <button className="primary-button" onClick={saveBuilderMeal}>
              Simpan {count} makanan · {Math.round(tk)} kkal
            </button>
          </footer>
        )}
      </div>
      {recipeOpen && (
        <RecipeComposer
          foods={Array.from(
            new Map(
              merged
                .concat(allFoods ?? [])
                .filter((f) => !f.missingNutrition)
                .map((f) => [f.id, f]),
            ).values(),
          )}
          loading={loadingAll}
          onClose={() => setRecipeOpen(false)}
          onAdd={addComputedFood}
        />
      )}
      {labelOpen && (
        <NutritionLabelPanel
          onClose={() => setLabelOpen(false)}
          onAdd={addComputedFood}
        />
      )}
      {manualOpen && (
        <ManualFoodSheet
          onClose={() => {
            setManualOpen(false);
            setManualGroup(null);
          }}
          onAdd={addComputedFood}
        />
      )}

      {/* ── PORTION SHEET — the only way into the tray ──
          Tapping a row opens this instead of adding straight away, so the
          portion and any add-ons are decided before anything is committed. */}
      {sheet
        ? (() => {
            const ing = bIng(sheet.id);
            if (!ing) return null;
            const { label, portionG } = satuanFor(ing);
            const model = portionModel(ing, portionG);
            // Macros are stored per ONE unit of `model.unitG` grams (100 when the
            // weight is unknown — "grams" is then really a unit count ×100).
            const s100 = 100 / model.unitG;
            const unitsOnly = model.mode === "units";
            const delta = modDelta(sheet.mods);
            const available = modsFor(catKeyFor(ing));

            // What is LEFT of today for each macro, not counting this item. If the
            // food is already on the tray the tray total includes it, so take its
            // current share back out — otherwise editing a portion would make the
            // plate think you had already eaten it.
            const tgt = getDaily(dateKey).gymDay
              ? TARGETS.gymDay
              : TARGETS.restDay;
            const cur = selection[sheet.id] || 0;
            const own = itemMacros(ing, cur, entryMods[sheet.id] ?? []);
            const otherP = tp - own.protein;
            const otherC = tc - own.carbs;
            const otherF = tf - own.fat;
            const remaining = {
              protein: Math.max(
                0,
                tgt.protein - consumedToday.protein - otherP,
              ),
              carbs: Math.max(0, tgt.carbs - consumedToday.carbs - otherC),
              fat: Math.max(0, tgt.fat - consumedToday.fat - otherF),
            };

            return (
              <PortionSheet
                name={ing.name}
                mealLabel={BLABEL[activeMeal].toLowerCase()}
                per100={{
                  kcal: ing.kcal * s100,
                  protein: ing.protein * s100,
                  carbs: ing.carbs * s100,
                  fat: ing.fat * s100,
                }}
                delta={delta}
                grams={sheet.grams}
                onGrams={(g) =>
                  setSheet((x) =>
                    x ? { ...x, grams: Math.max(0, Math.min(3000, g)) } : x,
                  )
                }
                portionG={unitsOnly ? model.unitG : portionG}
                unitsOnly={unitsOnly}
                unit={parseSatuan(unitsOnly ? ing.unit : label).noun}
                remaining={remaining}
                tint={TINT[catKeyFor(ing)] ?? "var(--text)"}
                estimated={/estimasi/i.test(ing.name)}
                top={(() => {
                  const fam = sheet.fam;
                  if (!fam) return null;
                  const rows = facetRows(fam.family, fam.picks).map((r) => {
                    const context = { ...fam.picks };
                    delete context[r.axis];
                    return {
                      ...r,
                      options: predictor.orderOptions(
                        fam.family,
                        r.axis,
                        r.options,
                        context,
                      ),
                    };
                  });
                  const left = predictor.orderLeaves(
                    leavesFor(fam.family, fam.picks),
                  );
                  const variants: VariantChip[] =
                    left.length > 1
                      ? left.slice(0, 12).map((l) => {
                          const f = bIng(l.food.id) ?? (l.food as BuilderFood);
                          const m = portionModel(f, satuanFor(f).portionG);
                          return {
                            id: l.food.id,
                            label: l.parsed.rest.length
                              ? l.parsed.rest
                                  .join(" ")
                                  .replace(/^./, (c) => c.toUpperCase())
                              : "Biasa",
                            kcal: itemMacros(f, m.defaultG / m.unitG).kcal,
                          };
                        })
                      : [];
                  return (
                    <FacetRows
                      rows={rows}
                      onPick={pickFacet}
                      variants={variants}
                      variantId={sheet.id}
                      onVariant={(id) => {
                        const leaf = left.find((l) => l.food.id === id);
                        if (leaf)
                          moveSheetTo(
                            leaf.food as BuilderFood,
                            fam.picks,
                            fam.tileId,
                          );
                      }}
                    />
                  );
                })()}
                addons={
                  available.length > 0 ? (
                    <AddonChoices
                      mods={available}
                      active={sheet.mods}
                      onToggle={(key) => {
                        haptic("tap");
                        setSheet((x) => {
                          if (!x) return x;
                          const next = x.mods.slice();
                          const at = next.indexOf(key);
                          if (at >= 0) next.splice(at, 1);
                          else next.push(key);
                          return { ...x, mods: next };
                        });
                      }}
                    />
                  ) : null
                }
                onCancel={() => setSheet(null)}
                onConfirm={confirmPortionSheet}
              />
            );
          })()
        : null}

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
              background: "var(--surface)",
              borderTop: "1px solid rgba(84,119,93,.1)",
              boxShadow: "none",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "var(--text)",
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
                color: "var(--text)",
                background: "rgba(84,119,93,.04)",
                border: "1px solid rgba(84,119,93,.1)",
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
                          color: active ? "var(--text)" : "#9a938d",
                          background: active ? FIRE : "rgba(84,119,93,.04)",
                          border: active
                            ? "1px solid rgba(255,150,120,.6)"
                            : "1px solid rgba(84,119,93,.1)",
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
                            color: active ? "var(--text)" : "var(--text)",
                            background: active ? FIRE : "rgba(84,119,93,.04)",
                            border: active
                              ? "1px solid rgba(255,150,120,.6)"
                              : "1px solid rgba(84,119,93,.12)",
                          }}
                        >
                          {s.label}{" "}
                          <span
                            style={{
                              color: active
                                ? "rgba(255,235,225,.8)"
                                : "#7c736e",
                            }}
                          >
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
                      e.grams + d * (e.gramsPerUnit === 100 ? 10 : 0.5),
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
                        ? {
                            ...x,
                            gramsPerUnit: Math.max(
                              1,
                              (x.gramsPerUnit || 100) + d * 10,
                            ),
                          }
                        : x,
                    ),
                  onSet: (n) =>
                    setEditing((x) =>
                      x
                        ? { ...x, gramsPerUnit: Math.max(1, Math.round(n)) }
                        : x,
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
                        height: 44,
                        borderRadius: 13,
                        fontSize: 17,
                        color: "var(--text)",
                        cursor: "pointer",
                        background: "rgba(84,119,93,.05)",
                        border: "1px solid rgba(84,119,93,.12)",
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
                        height: 44,
                        boxSizing: "border-box",
                        textAlign: "center",
                        fontFamily: SANS,
                        fontWeight: 800,
                        fontSize: 19,
                        color: "var(--text)",
                        background: "rgba(84,119,93,.05)",
                        border: "1px solid rgba(84,119,93,.14)",
                        borderRadius: 11,
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => r.onStep(1)}
                      style={{
                        width: 40,
                        height: 44,
                        borderRadius: 13,
                        fontSize: 17,
                        color: "var(--text)",
                        cursor: "pointer",
                        background: FIRE,
                        border: "1px solid rgba(255,150,120,.6)",
                        boxShadow: "none",
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
                  background: "rgba(84,119,93,.04)",
                  border: "1px solid rgba(84,119,93,.1)",
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
                  color: "var(--text)",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow: "none",
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
              background: "var(--surface)",
              borderTop: "1px solid rgba(84,119,93,.1)",
              boxShadow: "none",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "var(--text)",
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
              Bikin library sendiri — misal warung atau resto langgananmu.
              Simpan menu yang sering kamu makan, tinggal tap besok-besok.
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
                color: "var(--text)",
                background: "rgba(84,119,93,.04)",
                border: "1px solid rgba(84,119,93,.1)",
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
                  background: "rgba(84,119,93,.04)",
                  border: "1px solid rgba(84,119,93,.1)",
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
                  color: "var(--text)",
                  cursor: "pointer",
                  background: FIRE,
                  border: "1px solid rgba(255,150,120,.6)",
                  boxShadow: "none",
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
              background: "var(--surface)",
              border: "1px solid rgba(84,119,93,.12)",
              boxShadow: "none",
              animation: "riseIn .28s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 18,
                color: "var(--text)",
              }}
            >
              Simpan jadi menu
            </div>
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                color: "#8a837d",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              {count} item · {Math.round(tk)} kkal. Besok tinggal satu tap.
            </div>

            <input
              autoFocus
              type="text"
              value={namingTemplate.name}
              placeholder="Sarapan biasa"
              onChange={(e) =>
                setNamingTemplate((n) =>
                  n ? { ...n, name: e.target.value } : n,
                )
              }
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => e.key === "Enter" && confirmSaveTemplate()}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "13px 14px",
                borderRadius: 13,
                background: "var(--surface)",
                border: "1px solid rgba(84,119,93,.14)",
                color: "var(--text)",
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
                  background: "rgba(84,119,93,.04)",
                  border: "1px solid rgba(84,119,93,.1)",
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
                  color: "var(--text)",
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

      {/* The composer. Mounted last so it sits above every other sheet. */}
    </>
  );
}
