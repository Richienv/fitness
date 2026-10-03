"use client";
import { useEffect, useMemo, useState } from "react";
import {
  getRecipes,
  recipeNutrition,
  saveRecipe,
  type Recipe,
  type RecipeFood,
  type RecipePart,
} from "@/lib/recipes";
import { gramBasis } from "@/lib/trayMath";
import ManualFoodSheet from "./ManualFoodSheet";
import FriendlySheet from "./FriendlySheet";
import SearchField from "./SearchField";
import NutritionSummary from "./NutritionSummary";
import Icon from "../ui/Icon";
export default function RecipeComposer({
  foods,
  onClose,
  onAdd,
  loading = false,
}: {
  foods: RecipeFood[];
  onClose: () => void;
  onAdd: (food: RecipeFood, ingredients?: RecipeFood[]) => void;
  loading?: boolean;
}) {
  const [recipeId, setRecipeId] = useState(
    () => `recipe_${crypto.randomUUID()}`,
  );
  const [manual, setManual] = useState(false);
  const [parts, setParts] = useState<RecipePart[]>([]);
  const [servings, setServings] = useState("2");
  const [name, setName] = useState("Masakan sendiri");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saved, setSaved] = useState<Recipe[]>([]);
  const [message, setMessage] = useState("");
  const [drop, setDrop] = useState(0);
  const [perServing, setPerServing] = useState(false);
  useEffect(() => setSaved(getRecipes()), []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
    return () => clearTimeout(t);
  }, [query]);
  const results = useMemo(
    () =>
      debounced
        ? foods
            .filter(
              (f) =>
                !f.missingNutrition && f.name.toLowerCase().includes(debounced),
            )
            .sort((a, b) => {
              const rank = (f: RecipeFood) =>
                f.name.toLowerCase() === debounced
                  ? 0
                  : f.name.toLowerCase().startsWith(debounced)
                    ? 1
                    : 2;
              return rank(a) - rank(b);
            })
            .slice(0, 8)
        : [],
    [foods, debounced],
  );
  const count = Number(servings);
  const valid =
    parts.length > 0 &&
    name.trim() &&
    Number.isFinite(count) &&
    count > 0 &&
    parts.every((p) => Number.isFinite(p.quantity) && p.quantity > 0);
  const total = recipeNutrition(parts);
  const each = recipeNutrition(parts, count);
  const estimated = parts.some((p) => p.estimated);
  function add(food: RecipeFood) {
    const weight = gramBasis(food);
    setParts((p) => [
      ...p,
      {
        food,
        quantity: weight ? food.portionG || weight : 1,
        estimated: false,
      },
    ]);
    setQuery("");
    setDrop((d) => d + 1);
    setMessage("");
  }
  function recipe(): Recipe {
    return { id: recipeId, name: name.trim(), servings: count, parts };
  }
  function store() {
    if (!valid) return;
    const r = recipe();
    if (saveRecipe(r)) {
      setSaved(getRecipes());
      setMessage("Masakan tersimpan di perangkat ini.");
    } else
      setMessage(
        "Penyimpanan perangkat penuh. Kamu tetap bisa menambahkan masakan ke catatan makan.",
      );
  }
  function log() {
    if (!valid) return;
    onAdd(
      {
        id: `recipe_food_${crypto.randomUUID()}`,
        name: `${name.trim()}${estimated ? " (estimasi)" : ""}`,
        unit: `1 dari ${count} porsi`,
        kcal: each.kcal,
        protein: each.protein,
        carbs: each.carbs,
        fat: each.fat,
        ...(each.grams !== null ? { gramsPerUnit: each.grams } : {}),
        ...(each.sugar === null ? {} : { sugar: each.sugar }),
      },
      parts.map((p) => p.food),
    );
  }
  if (manual)
    return (
      <ManualFoodSheet
        onClose={() => setManual(false)}
        onAdd={(food) => {
          add(food);
          setManual(false);
        }}
      />
    );
  return (
    <FriendlySheet
      title="Racik masakan"
      onClose={onClose}
      footer={
        <div className="recipe-actions">
          <button
            className="secondary-button"
            disabled={!valid}
            onClick={store}
          >
            Simpan masakan
          </button>
          <button className="primary-button" disabled={!valid} onClick={log}>
            Tambahkan ke catatan makan
          </button>
        </div>
      }
    >
      <NutritionSummary
        values={
          perServing && !(count > 0)
            ? { kcal: null, protein: null, carbs: null, fat: null }
            : perServing
              ? each
              : total
        }
        caption={`${perServing ? "Per porsi" : "Seluruh masakan"}${estimated ? " · Estimasi" : ""}`}
      />
      <div className="recipe-pot" aria-hidden="true">
        <svg viewBox="0 0 160 95" width="150" height="90">
          <path
            d="M38 37h84v28a25 25 0 0 1-25 25H63a25 25 0 0 1-25-25z"
            fill="#dce7d3"
            stroke="#7c977d"
            strokeWidth="2"
          />
          <path
            d="M38 46H23v16h15M122 46h15v16h-15M34 36h92"
            fill="none"
            stroke="#7c977d"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M50 25q30-16 60 0"
            fill="#edf1e5"
            stroke="#7c977d"
            strokeWidth="2"
          />
          <path
            d="M72 19v-5h16v5"
            fill="none"
            stroke="#7c977d"
            strokeWidth="2"
          />
          {drop > 0 && (
            <circle
              key={drop}
              className="ingredient-drop"
              cx="80"
              cy="5"
              r="7"
              fill="#d5aa85"
            />
          )}
        </svg>
        <p className="quiet">Hitung dari bahan yang kamu masak.</p>
      </div>
      <label className="field-label">
        Nama masakan
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field-label">
        Jumlah porsi
        <input
          type="number"
          min="0.1"
          step="any"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
        />
      </label>
      <div className="segment" aria-label="Acuan nutrisi">
        <button aria-pressed={!perServing} onClick={() => setPerServing(false)}>
          Total masakan
        </button>
        <button aria-pressed={perServing} onClick={() => setPerServing(true)}>
          Per porsi
        </button>
      </div>
      <h3>Bahan masakan</h3>
      <SearchField
        value={query}
        onChange={setQuery}
        label="Cari bahan masakan"
        loading={loading}
      />
      <p className="quiet">
        Tambahkan juga minyak, saus, dan gula yang digunakan.
      </p>
      <div className="ingredient-shortcuts">
        {["Minyak", "Saus", "Gula"].map((q) => (
          <button className="soft-button" key={q} onClick={() => setQuery(q)}>
            {q}
          </button>
        ))}
      </div>
      {query && (
        <div aria-live="polite">
          {results.map((f) => (
            <button className="food-result" key={f.id} onClick={() => add(f)}>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {f.unit} · {Math.round(f.kcal)} kkal
                </small>
              </span>
              <Icon name="plus" />
            </button>
          ))}
          {!loading &&
            debounced === query.trim().toLowerCase() &&
            !results.length && (
              <p className="status-message">
                Bahan belum ditemukan. Coba nama lain dari katalog makanan.
              </p>
            )}
        </div>
      )}
      <button className="text-button" onClick={() => setManual(true)}>
        Tambah bahan manual
      </button>
      {!parts.length && (
        <p className="empty-note">Cari bahan pertama untuk mulai menghitung.</p>
      )}
      <div className="recipe-ingredients">
        {parts.map((p, i) => {
          const weight = gramBasis(p.food);
          const n = recipeNutrition([p]);
          return (
            <div className="recipe-ingredient" key={`${p.food.id}-${i}`}>
              <div className="row-between">
                <strong>{p.food.name}</strong>
                <button
                  className="icon-button"
                  aria-label={`Hapus ${p.food.name}`}
                  onClick={() => setParts(parts.filter((_, j) => j !== i))}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="ingredient-quantity">
                <label>
                  Jumlah ({weight ? "g" : p.food.unit})
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={p.quantity || ""}
                    onChange={(e) =>
                      setParts(
                        parts.map((v, j) =>
                          j === i
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={p.estimated}
                    onChange={(e) =>
                      setParts(
                        parts.map((v, j) =>
                          j === i ? { ...v, estimated: e.target.checked } : v,
                        ),
                      )
                    }
                  />
                  Estimasi
                </label>
              </div>
              <p className="macro-line">
                {Math.round(n.kcal)} kkal · Protein {n.protein.toFixed(1)} g ·
                Karbohidrat {n.carbs.toFixed(1)} g · Lemak {n.fat.toFixed(1)} g
              </p>
            </div>
          );
        })}
      </div>
      {message && (
        <p className="status-message" role="status">
          {message}
        </p>
      )}
      {saved.length > 0 && (
        <details>
          <summary>Masakan tersimpan ({saved.length})</summary>
          {saved.map((r) => (
            <button
              className="food-result"
              key={r.id}
              onClick={() => {
                setRecipeId(r.id);
                setParts(r.parts);
                setName(r.name);
                setServings(String(r.servings));
                setMessage(
                  "Masakan dimuat. Kamu bisa mengubah bahan sebelum mencatat.",
                );
              }}
            >
              <span>
                <strong>{r.name}</strong>
                <small>
                  {r.servings} porsi ·{" "}
                  {Math.round(recipeNutrition(r.parts, r.servings).kcal)} kkal
                  per porsi
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </details>
      )}
    </FriendlySheet>
  );
}
