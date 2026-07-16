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
import { saveMeal, type MealItem, type CustomMealItem } from "@/lib/store";
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
};

const round1 = (x: number) => Math.round(x * 10) / 10;

// ─── Category chips ─────────────────────────────────────────────────────────
// Color families for the result-row chips + icon tiles (reference: PROTEIN is
// fire-orange, SAYUR green, …). Foods resolve via foodGroup (DB rows) or the
// legacy step-key group (local ingredients).

type Fam = { text: string; bg: string; bd: string };
const FAMS: Record<string, Fam> = {
  fire: { text: "#ff9a80", bg: "rgba(238,60,48,.09)", bd: "rgba(238,60,48,.32)" },
  green: { text: "#5fe39a", bg: "rgba(34,197,94,.09)", bd: "rgba(34,197,94,.35)" },
  blue: { text: "#58b7ff", bg: "rgba(56,142,255,.09)", bd: "rgba(56,142,255,.35)" },
  gold: { text: "#ffd25a", bg: "rgba(255,210,90,.08)", bd: "rgba(255,210,90,.3)" },
  pink: { text: "#ff8ac2", bg: "rgba(255,110,180,.08)", bd: "rgba(255,110,180,.3)" },
  cyan: { text: "#7ce7de", bg: "rgba(80,220,205,.08)", bd: "rgba(80,220,205,.3)" },
};

type Cat = { emoji: string; label: string; fam: Fam };
const CAT: Record<string, Cat> = {
  // DB food groups
  Daging: { emoji: "🥩", label: "PROTEIN", fam: FAMS.fire },
  "Ikan dsb": { emoji: "🐟", label: "PROTEIN", fam: FAMS.fire },
  Telur: { emoji: "🥚", label: "PROTEIN", fam: FAMS.fire },
  Kacang: { emoji: "🫘", label: "PROTEIN", fam: FAMS.fire },
  "Masakan Nusantara": { emoji: "🍛", label: "MASAKAN", fam: FAMS.fire },
  "Custom/Estimasi": { emoji: "✍️", label: "CUSTOM", fam: FAMS.fire },
  Serealia: { emoji: "🌾", label: "KARBO", fam: FAMS.blue },
  Umbi: { emoji: "🥔", label: "KARBO", fam: FAMS.blue },
  Buah: { emoji: "🍎", label: "BUAH", fam: FAMS.green },
  Gula: { emoji: "🍬", label: "GULA", fam: FAMS.pink },
  Sayur: { emoji: "🥬", label: "SAYUR", fam: FAMS.green },
  Lemak: { emoji: "🧈", label: "LEMAK", fam: FAMS.gold },
  Bumbu: { emoji: "🧂", label: "BUMBU", fam: FAMS.gold },
  Susu: { emoji: "🥛", label: "SUSU", fam: FAMS.cyan },
  Minuman: { emoji: "🧋", label: "MINUMAN", fam: FAMS.cyan },
  "Kue/Dessert": { emoji: "🍰", label: "DESSERT", fam: FAMS.pink },
  // legacy step-key groups (local ingredients + session customs)
  protein: { emoji: "🥩", label: "PROTEIN", fam: FAMS.fire },
  carb: { emoji: "🌾", label: "KARBO", fam: FAMS.blue },
  vegetable: { emoji: "🥬", label: "SAYUR", fam: FAMS.green },
  extra: { emoji: "✨", label: "EKSTRA", fam: FAMS.gold },
  drink: { emoji: "🥤", label: "MINUMAN", fam: FAMS.cyan },
  custom: { emoji: "✍️", label: "CUSTOM", fam: FAMS.fire },
};
const CAT_FALLBACK: Cat = { emoji: "🍽️", label: "MAKANAN", fam: FAMS.fire };

function catFor(f: BuilderFood): Cat {
  return (f.foodGroup && CAT[f.foodGroup]) || CAT[f.group] || CAT_FALLBACK;
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

// Deterministic ember positions (left %, size px, delay s, duration s).
const EMBERS: [number, number, number, number][] = [
  [12, 5, 0.0, 7.5],
  [26, 3, 1.8, 6.2],
  [38, 4, 3.1, 8.4],
  [55, 3, 0.9, 7.0],
  [67, 5, 2.4, 6.6],
  [79, 3, 4.2, 8.8],
  [88, 4, 1.2, 7.8],
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
  meal: "breakfast" | "lunch" | "snack" | "dinner";
  dateKey: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [selection, setSelection] = useState<Record<string, number>>({});
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
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          const rows: DbFoodRow[] = data?.data?.foods ?? [];
          const mapped: BuilderFood[] = rows.map((f) => ({
            id: f.sourceCode,
            name: f.name,
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
          setDbCache((c) => {
            const next = { ...c };
            for (const m of mapped) next[m.id] = m;
            return next;
          });
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

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
  };
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
    saveMeal({ date: dateKey, mealType: meal, items });
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
      return {
        ...e,
        grams: g,
        kcal: round1(e.densityKcal * f),
        protein: round1(e.densityProtein * f),
        carbs: round1(e.densityCarbs * f),
        fat: round1(e.densityFat * f),
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
    setEditing((e) => {
      if (!e) return null;
      if (e.mode === "edit" && e.id) {
        const gpu = e.gramsPerUnit || 100;
        const qty = e.grams > 0 ? Math.round((e.grams / gpu) * 1000) / 1000 : 0;
        if (qty <= 0) return null;
        const id = e.id;
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
  // hits (already score-ranked by the API) follow.
  const searchFlat: BuilderFood[] = q
    ? merged.filter(match).concat(dbResults)
    : [];
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

  // ---------- result row (reference: icon tile + chip + serving/kcal + add) --
  const renderRow = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const qty = selection[id] || 0;
    const selected = qty > 0;
    const cat = catFor(ing);
    const gp = ing.gramsPerUnit ? Math.round(ing.gramsPerUnit * qty) : null;
    const qtyBadge =
      ing.gramsPerUnit === 100 && gp != null ? `${gp}g` : `×${qty}`;
    return (
      <div
        key={id}
        onClick={() => bAdd(id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          borderRadius: 16,
          padding: "11px 12px",
          cursor: "pointer",
          background:
            "linear-gradient(180deg,rgba(255,255,255,.04),transparent 45%),#0d0b0c",
          border: selected
            ? "1px solid rgba(255,138,60,.42)"
            : "1px solid rgba(255,255,255,.09)",
          boxShadow: selected
            ? "inset 0 1px 0 rgba(255,255,255,.05),0 0 18px rgba(238,60,48,.12)"
            : "inset 0 1px 0 rgba(255,255,255,.05)",
        }}
      >
        {/* category icon tile */}
        <div
          style={{
            width: 46,
            height: 46,
            flex: "none",
            borderRadius: 13,
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            background: cat.fam.bg,
            border: `1px solid ${cat.fam.bd}`,
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
                fontSize: 15.5,
                color: "#f1ede9",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ing.name}
            </span>
            {selected ? (
              <span
                style={{
                  flex: "none",
                  fontFamily: MONO,
                  fontSize: 9,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "rgba(238,60,48,.15)",
                  color: "#ff8a72",
                }}
              >
                {qtyBadge}
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
                color: cat.fam.text,
                background: cat.fam.bg,
                border: `1px solid ${cat.fam.bd}`,
              }}
            >
              <span style={{ fontSize: 9 }}>{cat.emoji}</span>
              {cat.label}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#8a837d",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ing.unit} ·{" "}
              <span style={{ color: "#ff8a72" }}>
                {Math.round(ing.kcal)} kkal
              </span>
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Tambah ${ing.name}`}
          onClick={(ev) => {
            ev.stopPropagation();
            bAdd(id);
          }}
          style={{
            width: 44,
            height: 44,
            flex: "none",
            borderRadius: 13,
            fontSize: 20,
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
          {sec.items.map(renderRow)}
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
        {/* ambient fire glow + embers (empty state only, like the reference) */}
        {emptyState ? (
          <>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "34%",
                width: 420,
                height: 420,
                transform: "translate(-50%,-50%)",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(238,60,48,.16), rgba(238,60,48,.05) 46%, transparent 70%)",
                filter: "blur(26px)",
                pointerEvents: "none",
                animation: "glowPulse 5.5s ease-in-out infinite",
              }}
            />
            {EMBERS.map(([left, size, delay, dur], i) => (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  bottom: 90,
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  background:
                    i % 2 === 0 ? "rgba(255,170,90,.85)" : "rgba(255,120,70,.7)",
                  boxShadow: "0 0 8px rgba(255,140,70,.8)",
                  pointerEvents: "none",
                  animation: `emberFloat ${dur}s linear ${delay}s infinite`,
                  opacity: 0,
                }}
              />
            ))}
          </>
        ) : null}

        {/* header */}
        <div style={{ padding: "42px 18px 6px 18px", flex: "none" }}>
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
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".14em",
                color: "#ff8a72",
              }}
            >
              {BLABEL[meal]}
            </span>
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 28,
              letterSpacing: "-.01em",
              color: "#f1ede9",
              marginTop: 12,
            }}
          >
            CATAT <span style={FIRE_TEXT}>MAKAN</span>
          </div>
        </div>

        {/* scroll area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "10px 18px 170px 18px",
          }}
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
                    <span style={{ color: "#58b7ff" }}>{Math.round(tc)}</span>
                    <span style={{ color: "#6a6660" }}>c</span>
                  </span>
                  <span>
                    <span style={{ color: "#ffd25a" }}>{Math.round(tf)}</span>
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
                  const gp = ing.gramsPerUnit
                    ? Math.round(ing.gramsPerUnit * qty)
                    : null;
                  const qtyLabel =
                    ing.gramsPerUnit === 100 && gp != null
                      ? `${gp}g`
                      : `×${qty}`;
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 11px",
                        borderRadius: 13,
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,138,60,.16)",
                        animation: "trayPop2 .3s cubic-bezier(.16,1,.3,1)",
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
                            fontSize: 14,
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
                          {Math.round(ing.protein * qty)}g protein ·{" "}
                          {Math.round(ing.kcal * qty)} kkal
                          <span style={{ color: "#7c736e" }}>
                            {" "}
                            · {Math.round(ing.carbs * qty)}c ·{" "}
                            {Math.round(ing.fat * qty)}f
                          </span>
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
                      <span
                        style={{
                          fontFamily: SANS,
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: "#ffb39e",
                          minWidth: 34,
                          textAlign: "center",
                        }}
                      >
                        {qtyLabel}
                      </span>
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
            <div style={{ textAlign: "center", padding: "64px 10px 40px" }}>
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 58,
                  lineHeight: 1,
                  ...FIRE_TEXT,
                }}
              >
                {libCount == null ? "…" : fmtCount(shownLibCount)}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 500,
                  fontSize: 19,
                  color: "#cfc8c2",
                  marginTop: 10,
                }}
              >
                makanan di library
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".22em",
                  color: "#6a6660",
                  marginTop: 9,
                }}
              >
                TINGGAL KETIK
              </div>
            </div>
          ) : null}

          {/* ── HERO SEARCH — glowing, the primary action ── */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 17,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 16,
                pointerEvents: "none",
                opacity: 0.9,
              }}
            >
              🔎
            </span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Cari makanan — ayam, nasi, kopi…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "17px 16px 17px 46px",
                borderRadius: 18,
                fontFamily: SANS,
                fontSize: 15.5,
                color: "#f1ede9",
                background: "rgba(255,255,255,.045)",
                border: "1px solid rgba(255,138,60,.4)",
                outline: "none",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,.05),0 0 26px rgba(238,60,48,.16),0 10px 26px rgba(0,0,0,.35)",
              }}
            />
          </div>

          {/* ── SEARCH RESULTS — flat ranked rows ── */}
          {q ? (
            <>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  letterSpacing: ".16em",
                  color: "#6a6660",
                  margin: "16px 0 10px",
                }}
              >
                // {searchResultCount} HASIL
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {searchFlat.map(renderRow)}
              </div>
              {searchResultCount === 0 ? (
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

        {/* floating ⋯ (browse all) + ＋ (add manual) — reference bottom-right */}
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 104,
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
              width: 46,
              height: 46,
              borderRadius: "50%",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
              color: browseOpen ? "#ff8a72" : "#9a938d",
              background: "linear-gradient(180deg,#191314,#0d0b0c)",
              border: browseOpen
                ? "1px solid rgba(255,138,60,.45)"
                : "1px solid rgba(255,255,255,.12)",
              boxShadow: "0 10px 24px rgba(0,0,0,.5)",
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
              width: 58,
              height: 58,
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

        {/* bottom bar — BATAL + SIMPAN (reference) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "16px 16px 22px 16px",
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
