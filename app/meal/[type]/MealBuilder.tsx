"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  INGREDIENTS,
  addMacros,
  type Ingredient,
  type CustomMacros,
} from "@/lib/ingredients";
import { presetsFor, type MealPreset, type MealType } from "@/lib/presets";
import {
  deleteCustomFood,
  getCustomFoods,
  getIngredientOverrides,
  getLastMealOfType,
  isCustomItem,
  resetIngredientOverride,
  saveCustomFood,
  saveIngredientOverride,
  saveMeal,
  scaleByGrams,
  updateCustomFood,
  type CustomFood,
  type CustomMealItem,
  type IngredientOverride,
  type MealItem,
  type MealLog,
  type Per100g,
} from "@/lib/store";
import { useActiveDate } from "@/lib/activeDate";

type Selection = Record<string, number>;

type CustomEntry = {
  instanceId: string;
  foodId: string | null;
  name: string;
  grams: number;
  per100g: Per100g;
};

const LABELS: Record<MealType, string> = {
  breakfast: "BREAKFAST",
  lunch: "LUNCH",
  snack: "SNACK",
  dinner: "DINNER",
};

const STEPS: { key: Ingredient["group"]; title: string; emoji: string }[] = [
  { key: "protein",   title: "PROTEIN",    emoji: "💪" },
  { key: "carb",      title: "CARBS",      emoji: "🌾" },
  { key: "vegetable", title: "VEGETABLES", emoji: "🥬" },
  { key: "extra",     title: "EXTRAS",     emoji: "✨" },
];

const ZERO: CustomMacros = { kcal: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, sodium: 0 };

export default function MealBuilder({
  mealType,
  dateParam,
}: {
  mealType: MealType;
  dateParam?: string;
}) {
  const router = useRouter();
  const { activeDate, setActiveDate, short } = useActiveDate();

  useEffect(() => {
    if (dateParam && dateParam !== activeDate) setActiveDate(dateParam);
  }, [dateParam, activeDate, setActiveDate]);
  const [selection, setSelection] = useState<Selection>({});
  const [customEntries, setCustomEntries] = useState<CustomEntry[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [lastMeal, setLastMeal] = useState<MealLog | null>(null);
  const [modalState, setModalState] = useState<
    | { mode: "closed" }
    | { mode: "new" }
    | { mode: "edit"; food: CustomFood }
    | { mode: "edit-ing"; ing: Ingredient }
  >({ mode: "closed" });
  const [overrides, setOverrides] = useState<Record<string, IngredientOverride>>({});
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showHint, setShowHint] = useState(true);
  const [activePreset, setActivePreset] = useState<MealPreset | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const presets = useMemo(() => presetsFor(mealType), [mealType]);

  useEffect(() => {
    setLastMeal(getLastMealOfType(mealType));
    setCustomFoods(getCustomFoods());
    setOverrides(getIngredientOverrides());
  }, [mealType]);

  const mergedIngredients = useMemo<Ingredient[]>(
    () => INGREDIENTS.map((i) => (overrides[i.id] ? { ...i, ...overrides[i.id] } : i)),
    [overrides]
  );
  const mergedById = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of mergedIngredients) m.set(i.id, i);
    return m;
  }, [mergedIngredients]);

  // Magnetic bottom snap: on mount + step change, scroll so YOUR USUAL is in view
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    setShowHint(true);
    const t = window.setTimeout(() => setShowHint(false), 2000);
    return () => window.clearTimeout(t);
  }, [stepIndex]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const q = query.trim().toLowerCase();
  const matches = (i: Ingredient) =>
    !q ||
    i.name.toLowerCase().includes(q) ||
    (i.zh?.toLowerCase().includes(q) ?? false) ||
    (i.pinyin?.toLowerCase().includes(q) ?? false);
  const favoriteItems = useMemo(
    () => mergedIngredients.filter((i) => i.group === step.key && i.favorite && matches(i)),
    [mergedIngredients, step.key, q] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const otherItems = useMemo(
    () => mergedIngredients.filter((i) => i.group === step.key && !i.favorite && matches(i)),
    [mergedIngredients, step.key, q] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibleCustomFoods = useMemo(
    () => customFoods.filter((f) => !q || f.name.toLowerCase().includes(q)),
    [customFoods, q]
  );
  const globalMatches = useMemo(
    () => (q ? mergedIngredients.filter(matches) : []),
    [mergedIngredients, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totals = useMemo<CustomMacros>(() => {
    let acc: CustomMacros = { ...ZERO };
    for (const [id, qty] of Object.entries(selection)) {
      if (qty <= 0) continue;
      const ing = mergedById.get(id);
      if (!ing) continue;
      acc = addMacros(acc, {
        kcal: ing.kcal * qty,
        protein: ing.protein * qty,
        fat: ing.fat * qty,
        carbs: ing.carbs * qty,
        sugar: (ing.sugar ?? 0) * qty,
        sodium: (ing.sodium ?? 0) * qty,
      });
    }
    for (const c of customEntries) {
      acc = addMacros(acc, scaleByGrams(c.per100g, c.grams));
    }
    return acc;
  }, [selection, customEntries, mergedById]);

  const itemCount =
    Object.values(selection).filter((q) => q > 0).length + customEntries.length;

  function stepFor(id: string): number {
    return mergedById.get(id)?.step ?? 1;
  }
  function add(id: string) {
    const step = stepFor(id);
    setSelection((s) => ({
      ...s,
      [id]: Math.round(((s[id] ?? 0) + step) * 100) / 100,
    }));
  }
  function sub(id: string) {
    const step = stepFor(id);
    setSelection((s) => {
      const next = { ...s };
      const current = next[id] ?? 0;
      const after = Math.round((current - step) * 100) / 100;
      if (after <= 0) delete next[id];
      else next[id] = after;
      return next;
    });
  }
  function toggle(id: string) {
    const step = stepFor(id);
    setSelection((s) => {
      if (s[id]) {
        const next = { ...s };
        delete next[id];
        return next;
      }
      return { ...s, [id]: step };
    });
  }
  function applyPreset(items: { id: string; qty: number }[], preset?: MealPreset) {
    const next: Selection = {};
    for (const it of items) next[it.id] = it.qty;
    setSelection(next);
    setActivePreset(preset ?? null);
  }
  function toggleOption(optId: string, optQty: number) {
    setSelection((s) => {
      if (s[optId]) {
        const n = { ...s };
        delete n[optId];
        return n;
      }
      return { ...s, [optId]: optQty };
    });
  }
  function addCustomEntry(entry: CustomEntry) {
    setCustomEntries((list) => [...list, entry]);
  }
  function removeCustomEntry(instanceId: string) {
    setCustomEntries((list) => list.filter((c) => c.instanceId !== instanceId));
  }

  function next() {
    if (isLast) {
      if (!itemCount) return;
      const items: MealItem[] = [
        ...Object.entries(selection)
          .filter(([, q]) => q > 0)
          .map<MealItem>(([id, qty]) => {
            if (!overrides[id]) return { id, qty };
            const ing = mergedById.get(id);
            if (!ing) return { id, qty };
            return {
              custom: true,
              name: ing.name,
              grams: (ing.gramsPerUnit ?? 0) * qty,
              kcal: ing.kcal * qty,
              protein: ing.protein * qty,
              fat: ing.fat * qty,
              carbs: ing.carbs * qty,
              sugar: (ing.sugar ?? 0) * qty,
              sodium: (ing.sodium ?? 0) * qty,
            };
          }),
        ...customEntries.map<CustomMealItem>((c) => {
          const s = scaleByGrams(c.per100g, c.grams);
          return {
            custom: true,
            name: c.name,
            grams: c.grams,
            kcal: s.kcal,
            protein: s.protein,
            fat: s.fat,
            carbs: s.carbs,
            sugar: s.sugar,
            sodium: s.sodium,
          };
        }),
      ];
      saveMeal({ date: dateParam ?? activeDate, mealType, items });
      router.push("/dashboard");
      return;
    }
    setStepIndex((i) => i + 1);
  }
  function back() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  const isExtra = step.key === "extra";
  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  const renderFoodCard = (ing: Ingredient) => {
    const qty = selection[ing.id] ?? 0;
    const selected = qty > 0;
    const isRevealed = !!revealed[ing.id];
    return (
      <div
        key={ing.id}
        className={`food-card${selected ? " selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => add(ing.id)}
      >
        {selected ? (
          <div className="card-selected">
            <div className="sel-head">
              <div className="sel-head-text">
                <div className="sel-name">{ing.name}</div>
                <div className="sel-portion">
                  {ing.unit}
                  {ing.gramsPerUnit && qty > 0 && (
                    <span className="portion-total"> · {Math.round(ing.gramsPerUnit * qty)}g total</span>
                  )}
                </div>
              </div>
              <div className="sel-head-actions">
                <div className="sel-qty-pill">×{qty}</div>
                <button
                  type="button"
                  className="edit-btn on-accent"
                  onClick={(e) => { e.stopPropagation(); setModalState({ mode: "edit-ing", ing }); }}
                  aria-label="Edit"
                >✎</button>
                {ing.zh && (
                  <button
                    type="button"
                    className={`zi-btn${isRevealed ? " on" : ""} on-accent`}
                    onClick={(e) => { e.stopPropagation(); toggleReveal(ing.id); }}
                    aria-label="Show Chinese"
                  >字</button>
                )}
              </div>
            </div>
            <div className="sel-stats-grid">
              <div className="sel-stat-block">
                <div className="sel-stat-num">{Math.round(ing.protein * qty)}g</div>
                <div className="sel-stat-label">protein</div>
              </div>
              <div className="sel-stat-block">
                <div className="sel-stat-num">{Math.round(ing.kcal * qty)}</div>
                <div className="sel-stat-label">kcal</div>
              </div>
            </div>
            {isRevealed && ing.zh && (
              <div className="zh-row on-accent">
                <span className="zh-chars">{ing.zh}</span>
                <span className="zh-pinyin">{ing.pinyin}</span>
              </div>
            )}
            <div className="sel-stepper" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => sub(ing.id)} aria-label="Remove one">−</button>
              <span className="sel-stepper-val">×{qty}</span>
              <button type="button" onClick={() => add(ing.id)} aria-label="Add one">+</button>
            </div>
          </div>
        ) : (
          <div className="card-top">
            <div className="card-head-row">
              <div className="card-name-stack">
                <div className="food-name">{ing.name}</div>
                <div className="food-portion">{ing.unit}</div>
              </div>
              <div className="head-right">
                <button
                  type="button"
                  className="edit-btn"
                  onClick={(e) => { e.stopPropagation(); setModalState({ mode: "edit-ing", ing }); }}
                  aria-label="Edit"
                >✎</button>
                {ing.zh && (
                  <button
                    type="button"
                    className={`zi-btn${isRevealed ? " on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleReveal(ing.id); }}
                    aria-label="Show Chinese"
                  >字</button>
                )}
              </div>
            </div>
            <div className="macro-line">
              <span className="m-muted">{ing.protein}g protein</span>
              <span className="m-dot">·</span>
              <span className="m-muted">{ing.carbs}c</span>
              <span className="m-dot">·</span>
              <span className="m-muted">{ing.fat}f</span>
              <span className="m-dot">·</span>
              <span className="m-kcal">{ing.kcal} kcal</span>
            </div>
            {isRevealed && ing.zh && (
              <div className="zh-row">
                <span className="zh-chars">{ing.zh}</span>
                <span className="zh-pinyin">{ing.pinyin}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="meal-builder" ref={scrollRef}>
      {showHint && (
        <div className="mb-scroll-hint mono" aria-hidden="true">↑ SCROLL FOR MORE</div>
      )}
      <div className="mb-header">
        <Link href="/meal" className="back-link">← Back</Link>

        <div className="step-head">
          <div className="step-pills">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`pill${i === stepIndex ? " active" : ""}${i < stepIndex ? " done" : ""}`}
              />
            ))}
          </div>
          <div className="step-count mono">STEP {stepIndex + 1} / {STEPS.length}</div>
        </div>

        <h1 className="section-title">
          {LABELS[mealType]} <span>·</span> {step.title}
        </h1>
        <div className="mh-date mono" style={{ marginTop: 2 }}>{short}</div>
      </div>

      {stepIndex === 0 && (
        <div className="presets presets-inline">
          {lastMeal && (
            <button
              className="preset-btn last"
              onClick={() => applyPreset(lastMeal.items.filter((it) => !isCustomItem(it)) as { id: string; qty: number }[])}
            >
              🔁 Usual ({lastMeal.items.length})
            </button>
          )}
          {presets.map((p) => (
            <button key={p.id} className="preset-btn" onClick={() => applyPreset(p.items, p)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {stepIndex === 0 && activePreset?.optional && activePreset.optional.length > 0 && (
        <div className="preset-optional">
          {activePreset.optional.map((opt) => {
            const on = (selection[opt.id] ?? 0) > 0;
            return (
              <button
                key={opt.id}
                type="button"
                className={`preset-opt-btn${on ? " on" : ""}`}
                onClick={() => toggleOption(opt.id, opt.qty)}
              >
                <span className="preset-opt-check" aria-hidden="true">{on ? "✓" : "+"}</span>
                <span className="preset-opt-label">{opt.label}</span>
                {opt.hint && <span className="preset-opt-hint mono">{opt.hint}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-scroll">
        {(isExtra || q) && visibleCustomFoods.length > 0 && (
          <>
            <div className="group-label">My foods</div>
            <div className="ing-grid">
              {visibleCustomFoods.map((food) => (
                <div key={food.id} className="ing-card my-food">
                  <button
                    type="button"
                    className="info"
                    onClick={() => setModalState({ mode: "edit", food })}
                  >
                    <div className="name">
                      {food.name}
                      <span className="badge-my">MY FOOD</span>
                    </div>
                    <div className="macros">
                      per 100g · {food.per100g.kcal} kcal · {food.per100g.protein}p
                    </div>
                  </button>
                  <div className="my-food-actions">
                    <button
                      type="button"
                      className="add"
                      onClick={() => {
                        addCustomEntry({
                          instanceId: crypto.randomUUID(),
                          foodId: food.id,
                          name: food.name,
                          grams: 100,
                          per100g: food.per100g,
                        });
                      }}
                    >
                      +100g
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {customEntries.length > 0 && (
          <>
            <div className="group-label">Custom added</div>
            <div className="ing-grid">
              {customEntries.map((c) => {
                const s = scaleByGrams(c.per100g, c.grams);
                return (
                  <div key={c.instanceId} className="ing-card selected">
                    <div className="info">
                      <div className="name">
                        {c.name}{" "}
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                          · {c.grams}g
                        </span>
                      </div>
                      <div className="macros">
                        {Math.round(s.kcal)} kcal · {Math.round(s.protein)}p · {Math.round(s.carbs)}c · {Math.round(s.fat)}f
                      </div>
                    </div>
                    <button
                      type="button"
                      className="add"
                      style={{ background: "var(--danger)", color: "#fff" }}
                      onClick={() => removeCustomEntry(c.instanceId)}
                    >
                      REMOVE
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!q && favoriteItems.length > 0 && (
          <div className="mb-section mb-fav-section">
            <div className="mb-sticky-label mono">// YOUR USUAL</div>
            <div className="ing-grid">
              {favoriteItems.map((ing) => renderFoodCard(ing))}
            </div>
          </div>
        )}
        {!q && otherItems.length > 0 && (
          <div className="mb-section mb-other-section">
            <div className="mb-sticky-label mono">// MORE OPTIONS</div>
            <div className="ing-grid">
              {otherItems.map((ing) => renderFoodCard(ing))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-spacer" aria-hidden="true" />

      <div className="mb-sticky-bar">
        {q && (
          <div className="mb-search-pop" role="listbox">
            <div className="mb-search-pop-head mono">
              <span>
                {globalMatches.length + visibleCustomFoods.length} match
                {globalMatches.length + visibleCustomFoods.length === 1 ? "" : "es"} ·
                tap to add
              </span>
              <button
                type="button"
                className="mb-search-pop-close"
                onClick={() => setQuery("")}
                aria-label="Close search"
              >
                ×
              </button>
            </div>
            <div className="mb-search-pop-list">
              {globalMatches.length === 0 && visibleCustomFoods.length === 0 && (
                <div className="mb-search-pop-empty mono">
                  No matches — try shorter terms or tap + FOOD.
                </div>
              )}
              {visibleCustomFoods.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="mb-search-pop-row"
                  onClick={() =>
                    addCustomEntry({
                      instanceId: crypto.randomUUID(),
                      foodId: f.id,
                      name: f.name,
                      grams: 100,
                      per100g: f.per100g,
                    })
                  }
                >
                  <span className="mb-search-pop-name">
                    {f.name}
                    <span className="badge-my">MY FOOD</span>
                  </span>
                  <span className="mb-search-pop-meta mono">
                    100g · {Math.round(f.per100g.kcal)} kcal · {Math.round(f.per100g.protein)}p
                  </span>
                  <span className="mb-search-pop-plus">+</span>
                </button>
              ))}
              {globalMatches.map((ing) => {
                const qty = selection[ing.id] ?? 0;
                return (
                  <button
                    key={ing.id}
                    type="button"
                    className={`mb-search-pop-row${qty > 0 ? " on" : ""}`}
                    onClick={() => add(ing.id)}
                  >
                    <span className="mb-search-pop-name">{ing.name}</span>
                    <span className="mb-search-pop-meta mono">
                      {ing.unit} · {Math.round(ing.kcal)} kcal · {Math.round(ing.protein)}p
                    </span>
                    {qty > 0 && (
                      <span className="mb-search-pop-qty mono">×{qty}</span>
                    )}
                    <span className="mb-search-pop-plus">+</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-sticky-totals mono">
          {itemCount === 0 ? (
            <span className="bottom-empty">TAP FOOD TO ADD</span>
          ) : (
            <>
              <strong>{Math.round(totals.kcal)} KCAL</strong>
              <span className="m-muted">
                {" · "}{Math.round(totals.protein)}p · {Math.round(totals.carbs)}c · {Math.round(totals.fat)}f
              </span>
            </>
          )}
        </div>
        <div className="mb-search-row">
          <input
            type="search"
            className="mb-search"
            placeholder="Search food…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="mb-add-btn"
            onClick={() => setModalState({ mode: "new" })}
            aria-label="Add custom food"
          >
            + FOOD
          </button>
        </div>
        <div className="mb-sticky-row">
          {stepIndex > 0 && (
            <button type="button" className="next-btn ghost mb-back-btn" onClick={back} aria-label="Back">
              ←
            </button>
          )}
          <button
            type="button"
            className="next-btn mb-next-btn"
            onClick={next}
            disabled={isLast && !itemCount}
          >
            {isLast ? "SAVE" : "NEXT →"}
          </button>
        </div>
      </div>

      {(modalState.mode === "new" || modalState.mode === "edit") && (
        <CustomFoodModal
          initial={modalState.mode === "edit" ? modalState.food : null}
          onClose={() => setModalState({ mode: "closed" })}
          onDelete={(id) => {
            deleteCustomFood(id);
            setCustomFoods(getCustomFoods());
            setModalState({ mode: "closed" });
          }}
          onSaveEdit={(food) => {
            updateCustomFood(food.id, food.name, food.per100g);
            setCustomFoods(getCustomFoods());
            setModalState({ mode: "closed" });
          }}
          onAdd={(entry, saveToLib) => {
            addCustomEntry(entry);
            if (saveToLib && !entry.foodId) {
              const saved = saveCustomFood(entry.name, entry.per100g);
              setCustomFoods(getCustomFoods());
              entry.foodId = saved.id;
            }
            setModalState({ mode: "closed" });
          }}
        />
      )}

      {modalState.mode === "edit-ing" && (
        <IngredientEditModal
          ing={modalState.ing}
          hasOverride={!!overrides[modalState.ing.id]}
          onClose={() => setModalState({ mode: "closed" })}
          onSave={(patch) => {
            saveIngredientOverride(modalState.ing.id, patch);
            setOverrides(getIngredientOverrides());
            setModalState({ mode: "closed" });
          }}
          onReset={() => {
            resetIngredientOverride(modalState.ing.id);
            setOverrides(getIngredientOverrides());
            setModalState({ mode: "closed" });
          }}
        />
      )}
    </main>
  );
}

// ---------- Ingredient edit modal (override built-in) ----------

function IngredientEditModal({
  ing,
  hasOverride,
  onClose,
  onSave,
  onReset,
}: {
  ing: Ingredient;
  hasOverride: boolean;
  onClose: () => void;
  onSave: (patch: IngredientOverride) => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(ing.name);
  const [unit, setUnit] = useState(ing.unit);
  const [kcal, setKcal] = useState(ing.kcal);
  const [protein, setProtein] = useState(ing.protein);
  const [fat, setFat] = useState(ing.fat);
  const [carbs, setCarbs] = useState(ing.carbs);
  const [sugar, setSugar] = useState(ing.sugar ?? 0);
  const [sodium, setSodium] = useState(ing.sodium ?? 0);

  function handleSave() {
    onSave({
      name: name.trim(),
      unit: unit.trim(),
      kcal,
      protein,
      fat,
      carbs,
      sugar,
      sodium,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">EDIT — {ing.name.toUpperCase()}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Portion</span>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. 100g, 1 scoop"
          />
        </label>
        <div className="field-label">Per {unit || "serving"}</div>
        <div className="field-grid">
          <NumField label="Calories" value={kcal} onChange={setKcal} suffix="kcal" />
          <NumField label="Protein" value={protein} onChange={setProtein} suffix="g" />
          <NumField label="Fat" value={fat} onChange={setFat} suffix="g" />
          <NumField label="Carbs" value={carbs} onChange={setCarbs} suffix="g" />
          <NumField label="Sugar" value={sugar} onChange={setSugar} suffix="g" />
          <NumField label="Sodium" value={sodium} onChange={setSodium} suffix="mg" step={10} />
        </div>
        <div className="modal-actions">
          {hasOverride ? (
            <button className="save ghost" onClick={onReset}>Reset to default</button>
          ) : (
            <button className="save ghost" onClick={onClose}>Cancel</button>
          )}
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Custom food modal ----------

function CustomFoodModal({
  initial,
  onClose,
  onAdd,
  onSaveEdit,
  onDelete,
}: {
  initial: CustomFood | null;
  onClose: () => void;
  onAdd: (entry: CustomEntry, saveToLib: boolean) => void;
  onSaveEdit: (food: CustomFood) => void;
  onDelete: (id: string) => void;
}) {
  const isEdit = !!initial;
  const [step, setStep] = useState<1 | 2>(isEdit ? 1 : 1);
  const [name, setName] = useState(initial?.name ?? "");
  const [per100g, setPer100g] = useState<Per100g>(
    initial?.per100g ?? { kcal: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, sodium: 0 }
  );
  const [grams, setGrams] = useState(100);
  const [saveToLib, setSaveToLib] = useState(true);

  const scaled = scaleByGrams(per100g, grams);
  const canGoStep2 = name.trim().length > 0 && per100g.kcal > 0;

  function setField(key: keyof Per100g, value: number) {
    setPer100g((p) => ({ ...p, [key]: value }));
  }

  function handleAdd() {
    onAdd(
      {
        instanceId: crypto.randomUUID(),
        foodId: null,
        name: name.trim(),
        grams,
        per100g,
      },
      saveToLib
    );
  }

  function handleSaveEdit() {
    if (!initial) return;
    onSaveEdit({ ...initial, name: name.trim(), per100g });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {isEdit ? "EDIT FOOD" : step === 1 ? "NEW FOOD — BASICS" : "HOW MUCH?"}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {step === 1 ? (
          <>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                placeholder="e.g. Homemade sandwich"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="field-label">Per 100g</div>
            <div className="field-grid">
              <NumField label="Calories" value={per100g.kcal} onChange={(v) => setField("kcal", v)} suffix="kcal" />
              <NumField label="Protein" value={per100g.protein} onChange={(v) => setField("protein", v)} suffix="g" />
              <NumField label="Fat" value={per100g.fat} onChange={(v) => setField("fat", v)} suffix="g" />
              <NumField label="Carbs" value={per100g.carbs} onChange={(v) => setField("carbs", v)} suffix="g" />
              <NumField label="Sugar" value={per100g.sugar ?? 0} onChange={(v) => setField("sugar", v)} suffix="g" />
              <NumField label="Sodium" value={per100g.sodium ?? 0} onChange={(v) => setField("sodium", v)} suffix="mg" step={10} />
            </div>
            <div className="modal-actions">
              {isEdit ? (
                <>
                  <button
                    className="save ghost danger"
                    onClick={() => initial && onDelete(initial.id)}
                  >
                    Delete
                  </button>
                  <button className="save" disabled={!canGoStep2} onClick={handleSaveEdit}>
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button className="save ghost" onClick={onClose}>Cancel</button>
                  <button className="save" disabled={!canGoStep2} onClick={() => setStep(2)}>
                    Next →
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="field-label">How much did you eat?</div>
            <div className="gram-stepper">
              <button onClick={() => setGrams((g) => Math.max(10, g - 10))}>−10</button>
              <div className="gram-val">
                <span className="num">{grams}</span>
                <span className="unit">g</span>
              </div>
              <button onClick={() => setGrams((g) => g + 10)}>+10</button>
            </div>
            <div className="gram-preview">
              At <strong>{grams}g</strong> →{" "}
              <strong>{Math.round(scaled.kcal)} kcal</strong> · {Math.round(scaled.protein)}g protein · {Math.round(scaled.fat)}g fat · {Math.round(scaled.carbs)}g carbs
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={saveToLib}
                onChange={(e) => setSaveToLib(e.target.checked)}
              />
              <span>Save to My Foods</span>
            </label>
            <div className="modal-actions">
              <button className="save ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="save" onClick={handleAdd}>Add to meal</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <label className="field num-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value === 0 ? "" : value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        <em>{suffix}</em>
      </div>
    </label>
  );
}
