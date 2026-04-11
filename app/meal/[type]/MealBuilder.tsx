"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  INGREDIENTS,
  addMacros,
  macrosFor,
  type Ingredient,
  type CustomMacros,
} from "@/lib/ingredients";
import { presetsFor, type MealType } from "@/lib/presets";
import {
  getCustomFoods,
  getLastMealOfType,
  isCustomItem,
  saveCustomFood,
  saveMeal,
  scaleByGrams,
  type CustomFood,
  type CustomMealItem,
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
  const [modalOpen, setModalOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const presets = useMemo(() => presetsFor(mealType), [mealType]);

  useEffect(() => {
    setLastMeal(getLastMealOfType(mealType));
    setCustomFoods(getCustomFoods());
  }, [mealType]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const favoriteItems = useMemo(
    () => INGREDIENTS.filter((i) => i.group === step.key && i.favorite),
    [step.key]
  );
  const otherItems = useMemo(
    () => INGREDIENTS.filter((i) => i.group === step.key && !i.favorite),
    [step.key]
  );

  const totals = useMemo<CustomMacros>(() => {
    let acc: CustomMacros = { ...ZERO };
    for (const [id, qty] of Object.entries(selection)) {
      if (qty <= 0) continue;
      const ing = INGREDIENTS.find((i) => i.id === id);
      if (!ing) continue;
      const m = macrosFor(id, qty);
      acc = addMacros(acc, {
        ...m,
        sugar: (ing.sugar ?? 0) * qty,
        sodium: (ing.sodium ?? 0) * qty,
      });
    }
    for (const c of customEntries) {
      acc = addMacros(acc, scaleByGrams(c.per100g, c.grams));
    }
    return acc;
  }, [selection, customEntries]);

  const itemCount =
    Object.values(selection).filter((q) => q > 0).length + customEntries.length;

  function stepFor(id: string): number {
    return INGREDIENTS.find((i) => i.id === id)?.step ?? 1;
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
  function applyPreset(items: { id: string; qty: number }[]) {
    const next: Selection = {};
    for (const it of items) next[it.id] = it.qty;
    setSelection(next);
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
          .map(([id, qty]) => ({ id, qty })),
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
  const isCarb = step.key === "carb";
  const isProtein = step.key === "protein";
  const warnColor = (sodium?: number, sugar?: number) => {
    const s = sodium ?? 0;
    const su = sugar ?? 0;
    if (s > 500) return "danger";
    if (su > 10) return "sugar";
    return null;
  };
  function toggleReveal(id: string) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  return (
    <main className="meal-builder">
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

      <button
        type="button"
        className="add-custom-btn full"
        onClick={() => setModalOpen(true)}
      >
        + ADD CUSTOM FOOD
      </button>

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
            <button key={p.id} className="preset-btn" onClick={() => applyPreset(p.items)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="mb-scroll">
        {isExtra && customFoods.length > 0 && (
          <>
            <div className="group-label">My foods</div>
            <div className="ing-grid">
              {customFoods.map((food) => (
                <div key={food.id} className="ing-card my-food">
                  <button
                    type="button"
                    className="info"
                    onClick={() => setModalOpen(true) /* open portion for this one — simplified: tap opens modal prefilled via state */}
                  >
                    <div className="name">
                      {food.name}
                      <span className="badge-my">MY FOOD</span>
                    </div>
                    <div className="macros">
                      per 100g · {food.per100g.kcal} kcal · {food.per100g.protein}p
                    </div>
                  </button>
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

        {favoriteItems.length > 0 && (
          <>
            <div className="group-label mb-group-label">// YOUR USUAL</div>
            <div className="fav-grid">
              {favoriteItems.map((ing) => {
                const qty = selection[ing.id] ?? 0;
                const selected = qty > 0;
                const isRevealed = !!revealed[ing.id];
                return (
                  <div
                    key={ing.id}
                    className={`fav-tile${selected ? " selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => add(ing.id)}
                  >
                    {selected ? (
                      <div className="fav-sel">
                        <div className="fav-sel-head">
                          <div className="fav-sel-name">{ing.name}</div>
                          <div className="fav-sel-qty-pill">×{qty}</div>
                        </div>
                        <div className="fav-sel-portion">{ing.unit}</div>
                        <div className="fav-sel-stats">
                          <div><strong>{Math.round(ing.protein * qty)}g</strong> protein</div>
                          <div><strong>{Math.round(ing.kcal * qty)}</strong> kcal</div>
                        </div>
                        <div className="sel-stepper small" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => sub(ing.id)} aria-label="Remove one">−</button>
                          <span className="sel-stepper-val">×{qty}</span>
                          <button type="button" onClick={() => add(ing.id)} aria-label="Add one">+</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="fav-top">
                          <div className="fav-name">{ing.name}</div>
                          {ing.zh && (
                            <button
                              type="button"
                              className={`zi-btn${isRevealed ? " on" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReveal(ing.id);
                              }}
                              aria-label="Show Chinese"
                            >
                              字
                            </button>
                          )}
                        </div>
                        <div className="fav-unit">{ing.unit}</div>
                        <div className="fav-macros m-muted">{ing.protein}p · {ing.carbs}c · {ing.fat}f · {ing.kcal} kcal</div>
                        {isRevealed && ing.zh && (
                          <div className="zh-row">
                            <span className="zh-chars">{ing.zh}</span>
                            <span className="zh-pinyin">{ing.pinyin}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {favoriteItems.length > 0 && otherItems.length > 0 && (
          <div className="mb-divider" />
        )}

        {otherItems.length > 0 && (
          <>
            <div className="group-label mb-group-label">// OTHER {step.title}</div>
            <div className="ing-grid">
            {otherItems.map((ing) => {
              const qty = selection[ing.id] ?? 0;
              const selected = qty > 0;
              const warn = isExtra ? warnColor(ing.sodium, ing.sugar) : null;
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
                          <div className="sel-name">
                            {ing.name}
                            {ing.tag === "best" && <span className="tag-best">✅ BEST</span>}
                          </div>
                          <div className="sel-portion">
                            {ing.unit}
                            {ing.gramsPerUnit && qty > 0 && (
                              <span className="portion-total"> · {Math.round(ing.gramsPerUnit * qty)}g total</span>
                            )}
                          </div>
                        </div>
                        <div className="sel-head-actions">
                          <div className="sel-qty-pill">×{qty}</div>
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
                          <div className="food-name">
                            {ing.name}
                            {ing.tag === "best" && <span className="tag-best">✅ BEST</span>}
                          </div>
                          <div className="food-portion">{ing.unit}</div>
                        </div>
                        <div className="head-right">
                          {ing.zh && (
                            <button
                              type="button"
                              className={`zi-btn${isRevealed ? " on" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReveal(ing.id);
                              }}
                              aria-label="Show Chinese"
                            >
                              字
                            </button>
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
                      {ing.note && (
                        <div className="ing-note">{ing.note}</div>
                      )}
                      {isExtra && (ing.sodium !== undefined || (ing.sugar ?? 0) > 0) && (
                        <div className="macro-line">
                          {ing.sodium !== undefined && (
                            <span className={warn === "danger" ? "warn-red" : "m-muted"}>{ing.sodium}mg Na</span>
                          )}
                          {ing.sugar !== undefined && ing.sugar > 0 && (
                            <>
                              <span className="m-dot">·</span>
                              <span className={warn === "sugar" ? "warn-orange" : "m-muted"}>{ing.sugar}g sugar</span>
                            </>
                          )}
                        </div>
                      )}
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
            })}
            </div>
          </>
        )}
      </div>

      <div className="mb-spacer" aria-hidden="true" />

      <div className="mb-sticky-bar">
        <div className="bottom-totals">
          {itemCount === 0 ? (
            <span className="bottom-empty">TAP FOOD TO ADD</span>
          ) : (
            <>
              <strong>{Math.round(totals.kcal)} KCAL</strong>
              <span className="m-muted">
                {Math.round(totals.protein)}p · {Math.round(totals.carbs)}c · {Math.round(totals.fat)}f
              </span>
            </>
          )}
        </div>
        <div className="bottom-actions">
          {stepIndex > 0 && (
            <button type="button" className="next-btn ghost" onClick={back}>←</button>
          )}
          <button
            type="button"
            className="next-btn"
            onClick={next}
            disabled={isLast && !itemCount}
          >
            {isLast ? "SAVE" : "NEXT →"}
          </button>
        </div>
      </div>

      {modalOpen && (
        <CustomFoodModal
          onClose={() => setModalOpen(false)}
          onAdd={(entry, saveToLib) => {
            addCustomEntry(entry);
            if (saveToLib && !entry.foodId) {
              const saved = saveCustomFood(entry.name, entry.per100g);
              setCustomFoods(getCustomFoods());
              entry.foodId = saved.id;
            }
            setModalOpen(false);
          }}
        />
      )}
    </main>
  );
}

// ---------- Custom food modal ----------

function CustomFoodModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (entry: CustomEntry, saveToLib: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [per100g, setPer100g] = useState<Per100g>({
    kcal: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, sodium: 0,
  });
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {step === 1 ? "NEW FOOD — BASICS" : "HOW MUCH?"}
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
              <button className="save ghost" onClick={onClose}>Cancel</button>
              <button className="save" disabled={!canGoStep2} onClick={() => setStep(2)}>
                Next →
              </button>
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
