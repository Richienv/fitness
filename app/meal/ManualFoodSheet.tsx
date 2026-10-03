"use client";
import { useState } from "react";
import FriendlySheet from "./FriendlySheet";
import NutritionSummary from "./NutritionSummary";
import type { RecipeFood } from "@/lib/recipes";
export default function ManualFoodSheet({
  onClose,
  onAdd,
  initial,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  initial?: {
    name?: string;
    kcal?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    unit?: string;
  };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "1 porsi");
  const [weight, setWeight] = useState("");
  const [values, setValues] = useState({
    kcal: initial?.kcal?.toString() ?? "",
    protein: initial?.protein?.toString() ?? "",
    carbs: initial?.carbs?.toString() ?? "",
    fat: initial?.fat?.toString() ?? "",
  });
  const keys = ["kcal", "protein", "carbs", "fat"] as const;
  const labels = {
    kcal: "Kalori (kkal)",
    protein: "Protein (g)",
    carbs: "Karbohidrat (g)",
    fat: "Lemak (g)",
  };
  const valid =
    name.trim() &&
    unit.trim() &&
    keys.every(
      (k) =>
        values[k].trim() !== "" &&
        Number.isFinite(Number(values[k])) &&
        Number(values[k]) >= 0,
    ) &&
    (weight === "" || (Number(weight) > 0 && Number.isFinite(Number(weight))));
  return (
    <FriendlySheet title="Tambah makanan manual" onClose={onClose}>
      <form
        className="friendly-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onAdd({
            id: `manual_${crypto.randomUUID()}`,
            name: name.trim(),
            unit: unit.trim(),
            ...(Object.fromEntries(
              keys.map((k) => [k, Number(values[k])]),
            ) as Pick<RecipeFood, "kcal" | "protein" | "carbs" | "fat">),
            ...(weight ? { gramsPerUnit: Number(weight) } : {}),
          });
        }}
      >
        <p className="quiet">
          Masukkan nutrisi dari label atau sumber yang kamu pakai. Semua angka
          berikut untuk satu porsi acuan.
        </p>
        <label>
          Nama makanan
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama makanan"
          />
        </label>
        <div className="form-columns">
          <label>
            Porsi acuan
            <input
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </label>
          <label>
            Berat porsi (g, opsional)
            <input
              type="number"
              min="0.1"
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Belum diketahui"
            />
          </label>
        </div>
        <div className="form-columns">
          {keys.map((k) => (
            <label key={k}>
              {labels[k]}
              <input
                required
                type="number"
                min="0"
                step="any"
                value={values[k]}
                placeholder="Belum tersedia"
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <NutritionSummary
          values={
            Object.fromEntries(
              keys.map((k) => [k, values[k] === "" ? null : Number(values[k])]),
            ) as {
              kcal: number | null;
              protein: number | null;
              carbs: number | null;
              fat: number | null;
            }
          }
          caption="Nutrisi satu porsi acuan"
        />
        <button className="primary-button" disabled={!valid}>
          Tambahkan ke pilihan makan
        </button>
      </form>
    </FriendlySheet>
  );
}
