"use client";

// Multi-step Food Builder — pixel-matched to the R2·FIT reference prototype
// (R2FIT_Fire.dc.html lines 211-370) and wired to the real data layer.
// Walks PROTEIN → KARBO → SAYUR → EKSTRA → MINUM, one group per step, and
// saves the assembled selection as a single meal.

import { useEffect, useState, type CSSProperties } from "react";
import { useSheetBack } from "@/lib/backSheet";
import { INGREDIENTS, type Ingredient } from "@/lib/ingredients";
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
const ZH = "'Noto Serif SC',serif";

const STEPS = [
  { key: "protein", title: "PROTEIN" },
  { key: "carb", title: "KARBO" },
  { key: "vegetable", title: "SAYUR" },
  { key: "extra", title: "EKSTRA" },
  { key: "drink", title: "MINUM" },
] as const;

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

// −/+ pill buttons inside the running tray.
const trayBtn = (plus: boolean): CSSProperties => ({
  width: 28,
  height: 28,
  flex: "none",
  borderRadius: 999,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  color: plus ? "#fff" : "#f1ede9",
  background: plus
    ? "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)"
    : "rgba(255,255,255,.06)",
  border: plus ? "1px solid rgba(255,150,120,.5)" : "1px solid rgba(255,255,255,.12)",
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
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, MacroPatch>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodDef[]>([]);
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ all: true });
  // Fire layout: browse library is collapsed by default (search is the hero).
  const [browseOpen, setBrowseOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newGroup, setNewGroup] = useState<{ name: string; emoji: string } | null>(null);
  // TKPI/DB food-composition search results for the current query, plus a
  // session cache so a picked DB food still resolves after the query clears.
  const [dbResults, setDbResults] = useState<BuilderFood[]>([]);
  const [dbBrowse, setDbBrowse] = useState<BuilderFood[]>([]);
  const [dbCache, setDbCache] = useState<Record<string, BuilderFood>>({});

  // Persisted custom "libraries" load client-side (localStorage).
  useEffect(() => {
    setGroups(getFoodGroups());
  }, []);

  // Live search against the shared food-composition DB (1,148 TKPI foods +
  // custom + USDA). Debounced; per-100g values map to a "100 g" unit so the
  // existing qty stepper (step 0.5 = 50 g) and save path work unchanged.
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
            group: STEPS[step].key,
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
  }, [query, step]);

  // Browse the DB library for the current step (no query needed) so the full
  // TKPI catalogue is visible while scrolling, not only when searching.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/foods/search?group=${encodeURIComponent(STEPS[step].key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows: DbFoodRow[] = data?.data?.foods ?? [];
        const mapped: BuilderFood[] = rows.map((f) => ({
          id: f.sourceCode,
          name: f.name,
          englishName: f.nameEn ?? undefined,
          unit: "100 g",
          group: STEPS[step].key,
          kcal: f.energy_kcal ?? 0,
          protein: f.protein_g ?? 0,
          fat: f.fat_g ?? 0,
          carbs: f.carb_g ?? 0,
          gramsPerUnit: 100,
          step: 0.1, // ±10 g nudges (gramsPerUnit 100)
        }));
        setDbBrowse(mapped);
        setDbCache((c) => {
          const next = { ...c };
          for (const m of mapped) next[m.id] = m;
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step]);

  const stepDef = STEPS[step];
  const group = stepDef.key;
  const isLast = step >= STEPS.length - 1;

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
  const toggleReveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const toggleSection = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // ---------- step nav ----------
  const goStep = (n: number) => {
    setStep(n);
    setQuery("");
  };
  const onNext = () => {
    if (isLast) saveBuilderMeal();
    else goStep(step + 1);
  };
  const onBack = () => {
    if (step <= 0) {
      onClose();
      return;
    }
    goStep(step - 1);
  };

  // Hardware/browser back mirrors the UI: close an inner sheet first, then
  // step back through the wizard, and only then leave the builder.
  useSheetBack(true, () => {
    if (editing) {
      setEditing(null);
      return true;
    }
    if (newGroup) {
      setNewGroup(null);
      return true;
    }
    if (step > 0) {
      goStep(step - 1);
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
        // Store per-unit macros (serving ÷ qty) so the card's `macro × qty`
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
        group: STEPS[step].key,
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

  // ---------- derived: sections ----------
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

  const favs: BuilderFood[] = (INGREDIENTS as BuilderFood[])
    .filter((i) => i.group === group && i.favorite)
    .map(applyOv);
  const others: BuilderFood[] = (INGREDIENTS as BuilderFood[])
    .filter((i) => i.group === group && !i.favorite)
    .map(applyOv)
    .concat(customFoods.filter((f) => f.group === group).map(applyOv));

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

  // ── Search results — one flat, ranked list (matches the reference): local
  // library matches lead, DB hits (already score-ranked) follow. ──
  const searchFlat: BuilderFood[] = q
    ? merged.filter(match).concat(dbResults)
    : [];
  const searchResultCount = searchFlat.length;

  // ── Browse library — collapsed by default in the Fire layout ──
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
      key, chev: open ? "▾" : "▸", emoji, name,
      countLabel: sc > 0 ? `${sc} dipilih` : String(list.length),
      open, canAdd,
      onToggle: () => toggleSection(key),
      onAddFood: gid ? () => openNewFood(gid) : () => {},
      items: open ? list.map(applyOv) : [],
    };
  };
  const browseSections: Section[] = [];
  browseSections.push(mk("usual", "⭐", "USUAL KAMU", favs, false, null));
  if (dbBrowse.length) {
    browseSections.push(mk("tkpidb", "🇮🇩", "DATABASE TKPI", dbBrowse, false, null));
  }
  for (const g of groups) {
    const gFoods = g.foods.filter((f) => f.group === group).map(applyOv);
    browseSections.push(mk(g.id, g.emoji, g.name, gFoods, true, g.id));
  }
  browseSections.push(mk("all", "🍽️", "SEMUA " + stepDef.title, others, false, null));

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

  // ── Running "what you've eaten" tray — every selected item across all steps,
  // resolved with overrides, so the tray is a live cart, not per-step. ──
  const traySelected = Object.keys(selection)
    .filter((id) => (selection[id] || 0) > 0)
    .map((id) => {
      const ing = bIng(id);
      return ing ? { id, ing, qty: selection[id] } : null;
    })
    .filter((x): x is { id: string; ing: BuilderFood; qty: number } => !!x);

  const bRemove = (id: string) =>
    setSelection((sel) => {
      const next = { ...sel };
      delete next[id];
      return next;
    });

  // ---------- card renderer (prototype bCard) ----------
  const renderCard = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const qty = selection[id] || 0;
    const selected = qty > 0;
    const gp = ing.gramsPerUnit ? Math.round(ing.gramsPerUnit * qty) : null;
    const qtyLabel = gp != null ? `${gp}g` : `×${qty}`;
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
          border: selected
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
          {selected ? (
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
              {qtyLabel}
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
                fontSize: 13,
                cursor: "pointer",
                background: isRevealed ? "#d42a17" : "transparent",
                border: isRevealed
                  ? "none"
                  : "1px solid rgba(255,255,255,.1)",
                color: isRevealed ? "#ffe9e2" : "#cfc8c2",
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

  // Collapsible section (header + cards), reused by search results and browse.
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
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a837d", width: 11, flex: "none" }}>
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
        <span style={{ fontFamily: MONO, fontSize: 9, color: "#6a6660", flex: "none" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "1px 0 14px" }}>
          {sec.items.map(renderCard)}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {/* ============ FOOD BUILDER ============ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background:
            "radial-gradient(720px 520px at 50% -10%, #17100f, #0a0809 55%, #070608)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "42px 18px 14px 18px", flex: "none" }}>
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
                fontSize: 10,
                letterSpacing: ".1em",
                color: "#6a6660",
              }}
            >
              STEP {step + 1} / {STEPS.length}
            </span>
          </div>
          {/* Tappable step segments — jump straight to any step (selections
              persist across steps, so hopping around is safe). */}
          <div style={{ display: "flex", gap: 5, marginTop: 13 }}>
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`Ke step ${s.title}`}
                onClick={() => goStep(i)}
                style={{
                  flex: 1,
                  height: 4,
                  padding: 0,
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 999,
                  transition: "all .3s",
                  // Enlarge the touch target without changing the visual bar.
                  boxSizing: "content-box",
                  borderTop: "8px solid transparent",
                  borderBottom: "8px solid transparent",
                  backgroundClip: "padding-box",
                  background:
                    i === step
                      ? "linear-gradient(90deg,#ff8a3d,#ee2f1f) padding-box"
                      : i < step
                      ? "rgba(238,60,48,.45) padding-box"
                      : "rgba(255,255,255,.1) padding-box",
                  boxShadow: i === step ? "0 0 8px rgba(238,60,48,.6)" : "none",
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 15,
            }}
          >
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 24,
                color: "#f1ede9",
                letterSpacing: "-.01em",
              }}
            >
              {BLABEL[meal]}
            </span>
            <span style={{ color: "#5a5551", fontSize: 20 }}>·</span>
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 24,
                background: "linear-gradient(100deg,#ff8a3d,#ee2f1f)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {stepDef.title}
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "6px 18px 128px 18px",
          }}
        >
          {/* ── RUNNING TRAY — what you've eaten, live totals ── */}
          {count > 0 ? (
            <div
              style={{
                borderRadius: 18,
                padding: 15,
                background:
                  "linear-gradient(180deg,rgba(255,138,60,.07),transparent 42%),#0c0a0b",
                border: "1px solid rgba(255,138,60,.24)",
                boxShadow:
                  "0 14px 34px rgba(0,0,0,.45),0 0 22px rgba(238,60,48,.08)",
                animation: "trayPop .34s cubic-bezier(.16,1,.3,1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".12em", color: "#ff8a72", whiteSpace: "nowrap" }}>
                  🔥 YANG KAMU MAKAN
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: "#6a6660", flex: "none", whiteSpace: "nowrap", marginLeft: 8 }}>
                  {count} ITEM
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 9 }}>
                <span
                  key={Math.round(tk)}
                  style={{
                    fontFamily: SANS,
                    fontWeight: 800,
                    fontSize: 30,
                    color: "#fff",
                    lineHeight: 1,
                    animation: "totalKick .4s ease-out",
                  }}
                >
                  {Math.round(tk)}
                </span>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#7c736e" }}>kkal</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#9a938d", marginTop: 4 }}>
                <span style={{ color: "#5fe39a" }}>{Math.round(tp)}g protein</span> · {Math.round(tc)}c · {Math.round(tf)}f
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  marginTop: 13,
                  maxHeight: 210,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                {traySelected.map(({ id, ing, qty }) => {
                  const gp = ing.gramsPerUnit ? Math.round(ing.gramsPerUnit * qty) : null;
                  const qtyLabel = gp != null ? `${gp}g` : `×${qty}`;
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 10px",
                        borderRadius: 12,
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,138,60,.16)",
                        animation: "trayPop2 .3s cubic-bezier(.16,1,.3,1)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: "#f8ede8", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ing.name}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 9, marginTop: 3, color: "#ff9a80", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {Math.round(ing.kcal * qty)} kkal
                          <span style={{ color: "#7c736e" }}> · {Math.round(ing.protein * qty)}p {Math.round(ing.carbs * qty)}c {Math.round(ing.fat * qty)}f</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => bSub(id)} style={trayBtn(false)}>−</button>
                      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, color: "#ffb39e", minWidth: 30, textAlign: "center" }}>
                        {qtyLabel}
                      </span>
                      <button type="button" onClick={() => bAdd(id)} style={trayBtn(true)}>+</button>
                      <button
                        type="button"
                        onClick={() => bRemove(id)}
                        aria-label="Hapus"
                        style={{ width: 26, height: 26, flex: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "transparent", border: "none", color: "#6a6660" }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── HERO SEARCH — the primary action ── */}
          <div style={{ position: "relative", marginTop: count > 0 ? 16 : 2 }}>
            <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none", opacity: 0.9 }}>
              🔎
            </span>
            <input
              type="text"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Cari makanan — ayam, nasi, kopi…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "16px 16px 16px 44px",
                borderRadius: 16,
                fontFamily: SANS,
                fontSize: 15,
                color: "#f1ede9",
                background: "rgba(255,255,255,.05)",
                border: "1px solid rgba(255,255,255,.13)",
                outline: "none",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.05),0 8px 20px rgba(0,0,0,.3)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11 }}>
            <button
              type="button"
              onClick={() => openNewFood(null)}
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".06em",
                padding: "7px 11px",
                borderRadius: 9,
                cursor: "pointer",
                color: "#ff8a72",
                background: "rgba(238,60,48,.06)",
                border: "1px dashed rgba(238,60,48,.4)",
              }}
            >
              + TAMBAH MANUAL
            </button>
            <button
              type="button"
              onClick={() => setBrowseOpen((v) => !v)}
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".06em",
                padding: "7px 4px",
                cursor: "pointer",
                color: "#8a837d",
                background: "none",
                border: "none",
              }}
            >
              {browseOpen ? "TUTUP ▴" : "LIHAT SEMUA ▾"}
            </button>
          </div>

          {/* ── SEARCH RESULTS — flat ranked list (matches reference) ── */}
          {q ? (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".16em", color: "#6a6660", margin: "17px 0 10px" }}>
                // {searchResultCount} HASIL
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {searchFlat.map(renderCard)}
              </div>
              {searchResultCount === 0 ? (
                <div style={{ textAlign: "center", padding: "26px 10px" }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "#7c736e" }}>
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

          {/* ── OPTIONAL BROWSE (collapsed by default) ── */}
          {browseOpen ? (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "16px 0 2px" }} />
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

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "16px 16px 22px 16px",
            background:
              "linear-gradient(180deg,rgba(7,6,8,0),#070608 26%)",
          }}
        >
          <div style={{ display: "flex", gap: 9 }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                flex: "none",
                padding: "15px 18px",
                borderRadius: 14,
                fontFamily: MONO,
                fontSize: 12,
                cursor: "pointer",
                color: "#9a938d",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              {step === 0 ? "← MAKAN" : "← BALIK"}
            </button>
            <button
              type="button"
              onClick={onNext}
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
                {isLast ? "SIMPAN ✓" : "LANJUT →"}
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
                    editSetGrams(e.grams + d * (e.gramsPerUnit === 100 ? 10 : 0.5)),
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
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
