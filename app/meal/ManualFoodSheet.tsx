"use client";
import { useState } from "react";
import FriendlySheet from "./FriendlySheet";
import NutritionSummary from "./NutritionSummary";
import NutritionScanEvidence from "./NutritionScanEvidence";
import type { NutritionScanEvidence as ScanEvidence } from "@/lib/nutritionReadPipeline";
import type { RecipeFood } from "@/lib/recipes";
import {
  LABEL_KEYS,
  scaleNutritionExtras,
  sodiumToSalt,
  type LabelKey,
  type NutritionLabel,
} from "@/lib/nutritionLabel";
export type ManualFoodInitial = Partial<Record<LabelKey, number | null>> & {
  name?: string;
  unit?: string;
};
const labels: Record<LabelKey, string> = {
  kcal: "Kalori (kkal)",
  protein: "Protein (g)",
  carbs: "Karbohidrat (g)",
  fat: "Lemak (g)",
  sugar: "Gula (g)",
  sodium: "Natrium / 钠 (mg)",
  salt: "Garam (g)",
  saturatedFat: "Lemak jenuh (g)",
  transFat: "Lemak trans (g)",
  fiber: "Serat (g)",
};
const core = ["kcal", "protein", "carbs", "fat"] as const;
export default function ManualFoodSheet({
  onClose,
  onAdd,
  initial,
  label,
  preview,
  scanEvidence,
  onRescan,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  initial?: ManualFoodInitial;
  label?: NutritionLabel;
  preview?: string;
  scanEvidence?: ScanEvidence;
  onRescan?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "1 porsi");
  const [weight, setWeight] = useState("");
  const [basisAmount, setBasisAmount] = useState(
    (label?.basis?.amount ?? label?.basisAmountHint)?.toString() ?? "100",
  );
  const [basisUnit, setBasisUnit] = useState<"g" | "ml" | "serving">(
    label?.basis?.unit ?? "g",
  );
  const [basisConfirmed, setBasisConfirmed] = useState(!label || !!label.basis);
  const [consumed, setConsumed] = useState(
    (label?.basis?.amount ?? label?.basisAmountHint)?.toString() ?? "100",
  );
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        LABEL_KEYS.map((k) => [
          k,
          (label?.values[k] ?? initial?.[k])?.toString() ?? "",
        ]),
      ) as Record<LabelKey, string>,
  );
  const numberValid = (s: string) =>
    s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;
  const multiplier = label ? Number(consumed) / Number(basisAmount) : 1;
  const valid =
    name.trim() &&
    core.every((k) => numberValid(values[k])) &&
    LABEL_KEYS.every((k) => values[k] === "" || numberValid(values[k])) &&
    (label
      ? basisConfirmed &&
        Number(basisAmount) > 0 &&
        Number(consumed) > 0 &&
        Number.isFinite(multiplier)
      : unit.trim() &&
        (weight === "" ||
          (Number(weight) > 0 && Number.isFinite(Number(weight)))));
  const extras = Object.fromEntries(
    LABEL_KEYS.filter(
      (k) => !core.includes(k as (typeof core)[number]) && values[k] !== "",
    ).map((k) => [k, Number(values[k])]),
  );
  return (
    <FriendlySheet
      title={label ? "Periksa label nutrisi" : "Tambah makanan manual"}
      onClose={onClose}
    >
      <form
        className="friendly-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onAdd({
            id: `manual_${crypto.randomUUID()}`,
            name: name.trim(),
            unit: label
              ? `${Number(consumed)} ${basisUnit === "serving" ? "sajian" : basisUnit}`
              : unit.trim(),
            ...(Object.fromEntries(
              core.map((k) => [k, Number(values[k]) * multiplier]),
            ) as Pick<RecipeFood, "kcal" | "protein" | "carbs" | "fat">),
            ...scaleNutritionExtras(extras, multiplier),
            ...(label
              ? basisUnit === "g"
                ? { gramsPerUnit: Number(consumed) }
                : {}
              : weight
                ? { gramsPerUnit: Number(weight) }
                : {}),
          });
        }}
      >
        <p className="quiet">
          {label
            ? "Angka diisi dari label. Periksa porsi acuan dan koreksi angka sebelum menambahkan. Kolom kosong berarti belum terbaca."
            : "Masukkan nutrisi dari label atau sumber yang kamu pakai. Angka berikut untuk satu porsi acuan."}
        </p>
        {label && scanEvidence && (
          <NutritionScanEvidence evidence={scanEvidence} text={label.text} />
        )}
        {label && !scanEvidence && (
          <details className="label-evidence">
            <summary>Lihat foto dan teks yang terbaca</summary>
            {preview && <img src={preview} alt="Label nutrisi yang dipindai" />}
            <pre>{label.text}</pre>
          </details>
        )}
        {!!label?.warnings.length && (
          <div className="status-message">
            {label.warnings
              .filter(
                (w) =>
                  !basisConfirmed || !w.startsWith("Porsi acuan belum terbaca"),
              )
              .map((w) => (
                <p key={w}>{w}</p>
              ))}
          </div>
        )}
        <label>
          Nama makanan
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Beri nama produk"
          />
        </label>
        {label ? (
          <>
            <div className="form-columns">
              <label>
                Angka pada label per
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={basisAmount}
                  onChange={(e) => {
                    setBasisAmount(e.target.value);
                  }}
                />
              </label>
              <label>
                Satuan acuan
                <select
                  value={basisConfirmed ? basisUnit : ""}
                  required
                  onChange={(e) => {
                    setBasisUnit(e.target.value as typeof basisUnit);
                    setBasisConfirmed(true);
                  }}
                >
                  <option value="" disabled>
                    Pilih sesuai label
                  </option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="serving">sajian</option>
                </select>
              </label>
            </div>
            {label.energyKj !== null && (
              <p className="quiet">
                Energi terbaca {label.energyKj.toLocaleString("id-ID")} kJ,
                dikonversi ke kkal (kJ ÷ 4,184). Persentase NRV tidak digunakan.
              </p>
            )}
          </>
        ) : (
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
        )}
        <div className="form-columns">
          {core.map((k) => (
            <label key={k}>
              {labels[k]}
              <input
                required
                type="number"
                min="0"
                step="any"
                value={values[k]}
                placeholder="Belum terbaca"
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <details className="label-extra" open={!!label}>
          <summary>Gula, natrium, dan nutrisi lain</summary>
          <div className="form-columns">
            {LABEL_KEYS.filter(
              (k) => !core.includes(k as (typeof core)[number]),
            ).map((k) => (
              <label key={k}>
                {labels[k]}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={values[k]}
                  placeholder="Belum tersedia"
                  onChange={(e) =>
                    setValues({ ...values, [k]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          {numberValid(values.sodium) && (
            <p className="quiet">
              {Number(values.sodium).toLocaleString("id-ID")} mg natrium setara
              sekitar{" "}
              {sodiumToSalt(Number(values.sodium)).toLocaleString("id-ID", {
                maximumFractionDigits: 3,
              })}{" "}
              g garam. Ini konversi, bukan angka garam yang terbaca dari label.
            </p>
          )}
        </details>
        {label && (
          <label>
            Jumlah yang dimakan (
            {basisUnit === "serving" ? "sajian" : basisUnit})
            <input
              required
              type="number"
              min="0.1"
              step="any"
              value={consumed}
              onChange={(e) => setConsumed(e.target.value)}
            />
          </label>
        )}
        <NutritionSummary
          values={
            Object.fromEntries(
              core.map((k) => [
                k,
                values[k] === "" || !Number.isFinite(multiplier)
                  ? null
                  : Number(values[k]) * multiplier,
              ]),
            ) as {
              kcal: number | null;
              protein: number | null;
              carbs: number | null;
              fat: number | null;
            }
          }
          caption={
            label ? "Jumlah yang akan dicatat" : "Nutrisi satu porsi acuan"
          }
        />
        <button className="primary-button" disabled={!valid}>
          Tambahkan ke pilihan makan
        </button>
        {onRescan && (
          <button type="button" className="secondary-button" onClick={onRescan}>
            Scan label lagi
          </button>
        )}
      </form>
    </FriendlySheet>
  );
}
