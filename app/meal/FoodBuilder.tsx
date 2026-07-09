"use client";

// Multi-step Food Builder — pixel-matched to the R2·FIT reference prototype
// (R2FIT_Fire.dc.html lines 211-370) and wired to the real data layer.
// Walks PROTEIN → KARBO → SAYUR → EKSTRA → MINUM, one group per step, and
// saves the assembled selection as a single meal.

import { useEffect, useState } from "react";
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
  step?: number;
  gramsPerUnit?: number;
  favorite?: boolean;
};

// One row from /api/foods/search (per-100g values, numbers or null).
type DbFoodRow = {
  sourceCode: string;
  name: string;
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
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  groupId?: string | null;
};

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
  const [grams, setGrams] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, MacroPatch>>({});
  const [customFoods, setCustomFoods] = useState<CustomFoodDef[]>([]);
  const [groups, setGroups] = useState<FoodGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ all: true });
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
            unit: "100 g",
            group: STEPS[step].key,
            kcal: f.energy_kcal ?? 0,
            protein: f.protein_g ?? 0,
            fat: f.fat_g ?? 0,
            carbs: f.carb_g ?? 0,
            gramsPerUnit: 100,
            step: 0.5,
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
          unit: "100 g",
          group: STEPS[step].key,
          kcal: f.energy_kcal ?? 0,
          protein: f.protein_g ?? 0,
          fat: f.fat_g ?? 0,
          carbs: f.carb_g ?? 0,
          gramsPerUnit: 100,
          step: 0.5,
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
      [id]: Math.round(((sel[id] || 0) + st) * 100) / 100,
    }));
  };
  const bSub = (id: string) => {
    const ing = bIng(id);
    const st = (ing && ing.step) || 1;
    setSelection((sel) => {
      const after = Math.round(((sel[id] || 0) - st) * 100) / 100;
      const next = { ...sel };
      if (after <= 0) delete next[id];
      else next[id] = after;
      return next;
    });
  };
  const toggleReveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const toggleGrams = (id: string) => setGrams((g) => ({ ...g, [id]: !g[id] }));
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
    setEditing({
      mode: "edit",
      id,
      name: ing.name,
      kcal: ing.kcal,
      protein: ing.protein,
      carbs: ing.carbs,
      fat: ing.fat,
    });
  };
  const openNewFood = (groupId: string | null = null) =>
    setEditing({ mode: "new", id: null, name: "", kcal: 0, protein: 0, carbs: 0, fat: 0, groupId });
  const editAdj = (key: "kcal" | "protein" | "carbs" | "fat", d: number) =>
    setEditing((e) => {
      if (!e) return e;
      const st = key === "kcal" ? 10 : 1;
      return { ...e, [key]: Math.max(0, Math.round((e[key] + d * st) * 10) / 10) };
    });
  const editSave = () => {
    setEditing((e) => {
      if (!e) return null;
      if (e.mode === "edit" && e.id) {
        setOverrides((ov) => ({
          ...ov,
          [e.id as string]: {
            name: e.name,
            kcal: e.kcal,
            protein: e.protein,
            carbs: e.carbs,
            fat: e.fat,
          },
        }));
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

  let sections: Section[];
  if (q) {
    // Local library matches + live DB (TKPI/custom/USDA) results.
    const items = merged.filter(match).concat(dbResults);
    sections = [
      {
        key: "search",
        chev: "▾",
        emoji: "🔎",
        name: "HASIL PENCARIAN",
        countLabel: String(items.length),
        open: true,
        canAdd: false,
        onToggle: () => {},
        onAddFood: () => {},
        items,
      },
    ];
  } else {
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
    sections = [];
    // Keep picked DB foods visible/adjustable after the search box is cleared
    // (they don't live in any static step list).
    const selectedDb = Object.keys(selection)
      .filter((id) => dbCache[id])
      .map((id) => bIng(id))
      .filter((x): x is BuilderFood => !!x);
    if (selectedDb.length) {
      sections.push(mk("dipilih", "✅", "DIPILIH", selectedDb, false, null));
    }
    sections.push(mk("usual", "⭐", "USUAL KAMU", favs, false, null));
    if (dbBrowse.length) {
      sections.push(mk("tkpidb", "🇮🇩", "DATABASE TKPI", dbBrowse, false, null));
    }
    for (const g of groups) {
      const gFoods = g.foods.filter((f) => f.group === group).map(applyOv);
      sections.push(mk(g.id, g.emoji, g.name, gFoods, true, g.id));
    }
    sections.push(mk("all", "🍽️", "SEMUA " + stepDef.title, others, false, null));
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

  // ---------- card renderer (prototype bCard) ----------
  const renderCard = (raw: BuilderFood) => {
    const ing = applyOv(raw);
    const id = ing.id;
    const qty = selection[id] || 0;
    const selected = qty > 0;
    const gp = ing.gramsPerUnit ? Math.round(ing.gramsPerUnit * qty) : null;
    const gm = !!grams[id];
    const isRevealed = !!revealed[id] && !!ing.zh;
    const showZi = !!ing.zh;
    const qtyLabel = gm && gp != null ? gp + "g" : "×" + qty;

    if (selected) {
      return (
        <div
          key={id}
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 16,
            padding: "14px",
            cursor: "pointer",
            background: "linear-gradient(155deg,#ff7a45,#f4402c 55%,#e22a17)",
            border: "1px solid rgba(255,185,155,.7)",
            boxShadow:
              "inset 0 1.5px 1px rgba(255,225,205,.5), 0 12px 30px rgba(238,60,48,.45), 0 0 22px rgba(238,60,48,.3)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                float: "right",
                display: "flex",
                gap: 4,
                alignItems: "center",
                marginLeft: 8,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "#1a0806",
                  color: "#ff6a4c",
                }}
              >
                {qtyLabel}
              </span>
              {ing.gramsPerUnit ? (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleGrams(id);
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    flex: "none",
                    borderRadius: 999,
                    fontFamily: MONO,
                    fontSize: 11,
                    cursor: "pointer",
                    background: "rgba(24,6,3,.5)",
                    border: "none",
                    color: "#f0d9d0",
                  }}
                >
                  g
                </button>
              ) : null}
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  openEdit(id);
                }}
                style={{
                  width: 26,
                  height: 26,
                  flex: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid rgba(30,8,4,.45)",
                  color: "#2a0d08",
                }}
              >
                ✎
              </button>
              {showZi ? (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleReveal(id);
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    flex: "none",
                    borderRadius: 8,
                    fontFamily: ZH,
                    fontSize: 12,
                    cursor: "pointer",
                    background: "#d42a17",
                    border: "none",
                    color: "#ffe9e2",
                  }}
                >
                  字
                </button>
              ) : null}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 19,
                color: "#2a0d08",
                lineHeight: 1.12,
              }}
            >
              {ing.name}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: "rgba(42,13,8,.62)",
                marginTop: 4,
              }}
            >
              {ing.unit}
              {gp != null ? ` · ${gp}g total` : ""}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 13,
            }}
          >
            <div
              style={{
                padding: "11px 13px",
                borderRadius: 12,
                background: "rgba(26,6,2,.14)",
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 23,
                  color: "#1c0704",
                  lineHeight: 1,
                }}
              >
                {Math.round(ing.protein * qty)}g
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: ".1em",
                  color: "rgba(42,13,8,.55)",
                  marginTop: 5,
                }}
              >
                PROTEIN
              </div>
            </div>
            <div
              style={{
                padding: "11px 13px",
                borderRadius: 12,
                background: "rgba(26,6,2,.14)",
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 23,
                  color: "#1c0704",
                  lineHeight: 1,
                }}
              >
                {Math.round(ing.kcal * qty)}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  letterSpacing: ".1em",
                  color: "rgba(42,13,8,.55)",
                  marginTop: 5,
                }}
              >
                KCAL
              </div>
            </div>
          </div>
          {isRevealed ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: MONO,
                fontSize: 10,
                color: "rgba(42,13,8,.7)",
              }}
            >
              <span style={{ fontFamily: ZH, fontSize: 13, color: "#2a0d08" }}>
                {ing.zh}
              </span>{" "}
              {ing.pinyin}
            </div>
          ) : null}
          <div
            style={{
              height: 1,
              background: "rgba(30,8,4,.18)",
              margin: "13px 0 10px",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                bSub(id);
              }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                fontSize: 20,
                cursor: "pointer",
                background: "#1a0806",
                border: "none",
                color: "#ffd9cf",
              }}
            >
              −
            </button>
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 19,
                color: "#2a0d08",
              }}
            >
              {qtyLabel}
            </span>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                bAdd(id);
              }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                fontSize: 20,
                cursor: "pointer",
                background: "#1a0806",
                border: "none",
                color: "#ffd9cf",
              }}
            >
              +
            </button>
          </div>
        </div>
      );
    }

    // unselected
    return (
      <div
        key={id}
        onClick={() => bAdd(id)}
        style={{
          position: "relative",
          borderRadius: 12,
          padding: "11px 13px",
          cursor: "pointer",
          background: "#0c0a0b",
          border: "1px solid rgba(255,255,255,.07)",
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
              <span style={{ color: "#ff8a72" }}>{ing.kcal} kkal</span>{" "}
              <span style={{ color: "#6a6660" }}>
                · {ing.protein}p · {ing.carbs}c · {ing.fat}f
              </span>
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
          {showZi ? (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                toggleReveal(id);
              }}
              style={
                isRevealed
                  ? {
                      width: 28,
                      height: 28,
                      flex: "none",
                      borderRadius: 8,
                      fontFamily: ZH,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "rgba(255,138,60,.12)",
                      border: "1px solid rgba(255,138,60,.6)",
                      color: "#ff8a3d",
                    }
                  : {
                      width: 28,
                      height: 28,
                      flex: "none",
                      borderRadius: 8,
                      fontFamily: ZH,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,.1)",
                      color: "rgba(255,255,255,.4)",
                    }
              }
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
          <div style={{ display: "flex", gap: 5, marginTop: 13 }}>
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  transition: "all .3s",
                  background:
                    i === step
                      ? "linear-gradient(90deg,#ff8a3d,#ee2f1f)"
                      : i < step
                      ? "rgba(238,60,48,.45)"
                      : "rgba(255,255,255,.1)",
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
            padding: "4px 18px 210px 18px",
          }}
        >
          {sections.map((sec) => (
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
                  {sec.items.map(renderCard)}
                </div>
              ) : null}
            </div>
          ))}
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
          <div
            style={{
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 12,
              marginBottom: 11,
            }}
          >
            {count > 0 ? (
              <>
                <span
                  style={{
                    color: "#f5f2ef",
                    fontWeight: 600,
                    letterSpacing: ".02em",
                  }}
                >
                  {Math.round(tk)} KKAL
                </span>
                <span style={{ color: "#7c736e" }}>
                  {" "}
                  · {Math.round(tp)}p · {Math.round(tc)}c · {Math.round(tf)}f
                </span>
              </>
            ) : (
              <span style={{ color: "#6a6660", letterSpacing: ".12em" }}>
                TAP MAKANAN UNTUK TAMBAH
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <input
              type="text"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Cari makanan…"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "13px 15px",
                borderRadius: 13,
                fontFamily: SANS,
                fontSize: 14,
                color: "#f1ede9",
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => openNewFood(null)}
              style={{
                flex: "none",
                padding: "0 16px",
                borderRadius: 13,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".06em",
                cursor: "pointer",
                color: "#ff8a72",
                background: "rgba(238,60,48,.06)",
                border: "1px dashed rgba(238,60,48,.5)",
              }}
            >
              + FOOD
            </button>
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 10 }}>
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
              PER PORSI
            </div>
            {(
              [
                ["KALORI", "kcal", Math.round(editing.kcal)],
                ["PROTEIN (g)", "protein", Math.round(editing.protein)],
                ["KARBO (g)", "carbs", Math.round(editing.carbs)],
                ["LEMAK (g)", "fat", Math.round(editing.fat)],
              ] as [string, "kcal" | "protein" | "carbs" | "fat", number][]
            ).map(([label, key, val], i, arr) => (
              <div
                key={key}
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
                  {label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => editAdj(key, -1)}
                    style={{
                      width: 42,
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
                  <span
                    style={{
                      fontFamily: SANS,
                      fontWeight: 800,
                      fontSize: 20,
                      color: "#fff",
                      minWidth: 60,
                      textAlign: "center",
                    }}
                  >
                    {val}
                  </span>
                  <button
                    type="button"
                    onClick={() => editAdj(key, 1)}
                    style={{
                      width: 42,
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
            ))}
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
