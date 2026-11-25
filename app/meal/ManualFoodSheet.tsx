"use client";
import { useState, useId, useMemo, useRef } from "react";
import FriendlySheet from "./FriendlySheet";
import NutritionSummary from "./NutritionSummary";
import NutritionScanEvidence from "./NutritionScanEvidence";
import type { NutritionScanEvidence as ScanEvidence } from "@/lib/nutritionReadPipeline";
import type { RecipeFood } from "@/lib/recipes";
import { estimateKcalFromMacros } from "@/lib/userFoods";
import {
  detectBarcodeLabelConflicts,
  type BarcodeProduct,
} from "@/lib/barcode";
import {
  persistConfirmedBarcode,
  recordScanAudit,
} from "@/lib/barcodeCache";
import {
  LABEL_KEYS,
  scaleNutritionExtras,
  sodiumToSalt,
  type LabelKey,
  type NutritionLabel,
} from "@/lib/nutritionLabel";

export type ManualFoodInitial = Partial<Record<LabelKey, number | null>> & {
  name?: string;
  brand?: string;
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

const SERVING_PRESETS = [
  { unit: "1 porsi", weight: "" },
  { unit: "100g", weight: "100" },
  { unit: "1 potong", weight: "120" },
  { unit: "1 mangkuk", weight: "250" },
] as const;

export default function ManualFoodSheet({
  onClose,
  onAdd,
  onQuickLog,
  initial,
  initialName,
  trayCount = 0,
  label,
  preview,
  scanEvidence,
  onRescan,
  barcode,
  barcodeProduct,
  scanSource,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  onQuickLog?: (food: RecipeFood) => void;
  initial?: ManualFoodInitial;
  initialName?: string;
  trayCount?: number;
  label?: NutritionLabel;
  preview?: string;
  scanEvidence?: ScanEvidence;
  onRescan?: () => void;
  barcode?: string;
  barcodeProduct?: BarcodeProduct | null;
  scanSource?: "ocr_rules" | "ocr_llm" | "manual";
}) {
  const formId = useId();
  const submitModeRef = useRef<"primary" | "tray">("primary");
  const quickMode = !label;

  const [name, setName] = useState(
    barcodeProduct?.name ?? initial?.name ?? initialName ?? "",
  );
  const [brand, setBrand] = useState(
    barcodeProduct?.brand ?? initial?.brand ?? "",
  );
  const [unit, setUnit] = useState(initial?.unit ?? "1 porsi");
  const [weight, setWeight] = useState(
    label?.servingSize?.amount?.toString() ?? "",
  );
  const [servingMass, setServingMass] = useState(
    (
      label?.servingSize?.amount ??
      barcodeProduct?.servingSizeG ??
      ""
    ).toString(),
  );
  const [basisAmount, setBasisAmount] = useState(
    (label?.basis?.amount ?? label?.basisAmountHint)?.toString() ?? "100",
  );
  const [basisUnit, setBasisUnit] = useState<"g" | "ml" | "serving">(
    label?.basis?.unit ?? "g",
  );
  const [basisConfirmed, setBasisConfirmed] = useState(!label || !!label.basis);
  const [consumed, setConsumed] = useState(
    label?.basis?.unit === "serving" ? "1" : "",
  );
  const initialValues = useMemo(
    () =>
      Object.fromEntries(
        LABEL_KEYS.map((k) => [
          k,
          (label?.values[k] ?? initial?.[k])?.toString() ?? "",
        ]),
      ) as Record<LabelKey, string>,
    [label, initial],
  );
  const [values, setValues] = useState<Record<LabelKey, string>>(
    () => initialValues,
  );
  const [trustSource, setTrustSource] = useState<"label" | "barcode">("label");

  const conflicts = useMemo(
    () =>
      barcodeProduct && label
        ? detectBarcodeLabelConflicts(barcodeProduct, label)
        : [],
    [barcodeProduct, label],
  );

  function applyConflictSource(choice: "label" | "barcode") {
    setTrustSource(choice);
    if (!conflicts.length) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const c of conflicts) {
        next[c.key] = (
          choice === "barcode" ? c.barcodeValue : c.scannedValue
        ).toString();
      }
      return next;
    });
  }

  const numberValid = (s: string) =>
    s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0;

  const hasAnyMacro = ["protein", "carbs", "fat"].some(
    (k) => values[k as LabelKey].trim() !== "",
  );
  const macrosValid = (["protein", "carbs", "fat"] as const).every(
    (k) => values[k].trim() === "" || numberValid(values[k]),
  );
  const macroNumbers = {
    protein: values.protein.trim() === "" ? 0 : Number(values.protein),
    carbs: values.carbs.trim() === "" ? 0 : Number(values.carbs),
    fat: values.fat.trim() === "" ? 0 : Number(values.fat),
  };
  const autoKcal = estimateKcalFromMacros(
    macroNumbers.protein,
    macroNumbers.fat,
    macroNumbers.carbs,
  );
  const usingAutoKcal =
    quickMode && values.kcal.trim() === "" && hasAnyMacro && macrosValid;
  const effectiveQuickKcal =
    values.kcal.trim() !== ""
      ? numberValid(values.kcal)
        ? Number(values.kcal)
        : null
      : usingAutoKcal
        ? autoKcal
        : null;

  const multiplier = label ? Number(consumed) / Number(basisAmount) : 1;
  const valid = label
    ? Boolean(
        name.trim() &&
          core.every((k) => numberValid(values[k])) &&
          LABEL_KEYS.every((k) => values[k] === "" || numberValid(values[k])) &&
          basisConfirmed &&
          Number(basisAmount) > 0 &&
          Number(consumed) > 0 &&
          Number.isFinite(multiplier),
      )
    : Boolean(
        name.trim() &&
          effectiveQuickKcal !== null &&
          macrosValid &&
          LABEL_KEYS.every((k) => values[k] === "" || numberValid(values[k])) &&
          unit.trim() &&
          (weight === "" ||
            (Number(weight) > 0 && Number.isFinite(Number(weight)))),
      );

  const extras = Object.fromEntries(
    LABEL_KEYS.filter(
      (k) => !core.includes(k as (typeof core)[number]) && values[k] !== "",
    ).map((k) => [k, Number(values[k])]),
  );

  const parsedServingMass =
    numberValid(servingMass) && Number(servingMass) > 0
      ? Number(servingMass)
      : null;

  const canOneTapLog = quickMode && Boolean(onQuickLog) && trayCount === 0;

  return (
    <FriendlySheet
      title={label ? "Periksa label nutrisi" : "Tambah makanan cepat"}
      onClose={onClose}
      footer={
        <div className="scan-review-actions">
          <button
            className="primary-button"
            form={formId}
            disabled={!valid}
            onClick={() => {
              submitModeRef.current = "primary";
            }}
          >
            {barcode
              ? "Simpan & tambahkan ke makan"
              : canOneTapLog
                ? "Simpan & langsung catat"
                : "Tambahkan ke pilihan makan"}
          </button>
          {canOneTapLog && (
            <button
              type="submit"
              form={formId}
              className="text-button"
              disabled={!valid}
              onClick={() => {
                submitModeRef.current = "tray";
              }}
            >
              Simpan & tambah ke makan saja
            </button>
          )}
          {onRescan && (
            <button type="button" className="text-button" onClick={onRescan}>
              Scan label lagi
            </button>
          )}
        </div>
      }
    >
      <form
        id={formId}
        className="friendly-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const edited = LABEL_KEYS.some(
            (k) => values[k] !== initialValues[k],
          );

          // Persist confirmed barcode product to Postgres & local cache so future scans are instant.
          if (barcode && label) {
            const perBasisFactor =
              basisUnit === "serving"
                ? 1 / Number(basisAmount)
                : 100 / Number(basisAmount);
            const numOrNull = (k: LabelKey) =>
              values[k] !== "" && numberValid(values[k])
                ? Math.round(Number(values[k]) * perBasisFactor * 100) / 100
                : null;
            void persistConfirmedBarcode({
              code: barcode,
              name: name.trim(),
              brand: brand.trim(),
              serving: parsedServingMass
                ? `${parsedServingMass} ${label.servingSize?.unit ?? (basisUnit === "ml" ? "ml" : "g")}`
                : barcodeProduct?.serving ?? "",
              servingSizeG: parsedServingMass,
              basis: basisUnit,
              kcal: numOrNull("kcal"),
              protein: numOrNull("protein"),
              carbs: numOrNull("carbs"),
              fat: numOrNull("fat"),
              sugar: numOrNull("sugar"),
              sodium: numOrNull("sodium"),
              salt: numOrNull("salt"),
              saturatedFat: numOrNull("saturatedFat"),
              fiber: numOrNull("fiber"),
              source: "user_confirmed",
            });
          }

          recordScanAudit({
            source: scanSource ?? (label ? "ocr_rules" : "manual"),
            barcode,
            ocrConfidence: scanEvidence?.confidence,
            coreFields: core.filter((k) => values[k] !== "").length,
            usedLlm: scanEvidence?.usedLlmFallback,
            editedByUser: edited,
            elapsedMs: scanEvidence?.elapsedMs,
            method: scanEvidence?.method,
          });

          const gramsPerUnit = label
            ? basisUnit === "g"
              ? Number(consumed)
              : basisUnit === "serving" && parsedServingMass
                ? Number(consumed) * parsedServingMass
                : undefined
            : weight
              ? Number(weight)
              : undefined;

          const payload: RecipeFood = {
            id: `${barcode ? `barcode_${barcode}` : "manual"}_${crypto.randomUUID()}`,
            name: `${name.trim()}${brand.trim() ? ` · ${brand.trim()}` : ""}`,
            unit: label
              ? `${Number(consumed)} ${basisUnit === "serving" ? "sajian" : basisUnit}`
              : unit.trim(),
            ...(label
              ? (Object.fromEntries(
                  core.map((k) => [k, Number(values[k]) * multiplier]),
                ) as Pick<RecipeFood, "kcal" | "protein" | "carbs" | "fat">)
              : {
                  kcal: effectiveQuickKcal ?? 0,
                  protein: macroNumbers.protein,
                  carbs: macroNumbers.carbs,
                  fat: macroNumbers.fat,
                }),
            ...scaleNutritionExtras(extras, multiplier),
            ...(gramsPerUnit ? { gramsPerUnit } : {}),
          };

          if (canOneTapLog && submitModeRef.current === "primary" && onQuickLog) {
            onQuickLog(payload);
            return;
          }
          onAdd(payload);
        }}
      >
        <p className="quiet">
          {label
            ? barcode
              ? `Barcode ${barcode} akan disimpan otomatis ke cache produk setelah kamu konfirmasi.`
              : "Isi porsi yang kamu makan, lalu cek angka dari label."
            : "Cukup isi nama & kalori (atau isi P/K/L untuk hitung kalori otomatis). Tersimpan ke daftar makananmu."}
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
        {conflicts.length > 0 && (
          <div className="scan-conflict" role="alert">
            <strong>Data Open Food Facts berbeda dari label kemasan</strong>
            <ul>
              {conflicts.map((c) => (
                <li key={c.key}>
                  {c.label}: kemasan <b>{c.scannedValue} {c.unit}</b> vs database{" "}
                  <b>{c.barcodeValue} {c.unit}</b>
                </li>
              ))}
            </ul>
            <div className="scan-conflict-actions">
              <button
                type="button"
                className={trustSource === "label" ? "primary-button" : "secondary-button"}
                onClick={() => applyConflictSource("label")}
              >
                Pakai label kemasan
              </button>
              <button
                type="button"
                className={trustSource === "barcode" ? "primary-button" : "secondary-button"}
                onClick={() => applyConflictSource("barcode")}
              >
                Pakai Open Food Facts
              </button>
            </div>
          </div>
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
        <div className="form-columns">
          <label>
            Nama makanan
            <input
              required
              autoFocus={quickMode && !initialName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Nasi campur kantin, Protein bar"
            />
          </label>
          {barcode && (
            <label>
              Merek (opsional)
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Mis. Indofood"
              />
            </label>
          )}
        </div>
        {label ? (
          <>
            <label>
              Jumlah yang dimakan (
              {basisUnit === "serving" ? "sajian" : basisUnit})
              <input
                required
                type="number"
                min="0.1"
                step="any"
                value={consumed}
                placeholder="Isi porsi yang kamu makan"
                inputMode="decimal"
                onChange={(e) => setConsumed(e.target.value)}
              />
            </label>
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
            {basisUnit === "serving" && (
              <label>
                Takaran saji (g / ml per sajian, opsional)
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  inputMode="decimal"
                  value={servingMass}
                  onChange={(e) => setServingMass(e.target.value)}
                  placeholder="Mis. 30 (dari Takaran Saji)"
                />
              </label>
            )}
            {label.energyKj !== null && (
              <p className="quiet">
                Energi terbaca {label.energyKj.toLocaleString("id-ID")} kJ,
                dikonversi ke kkal (kJ ÷ 4,184). Persentase NRV / AKG tidak digunakan.
              </p>
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
                    inputMode="decimal"
                    onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="quick-serving-field">
              <span className="quick-field-label">Porsi ({unit})</span>
              <div className="quick-unit-chips" role="group" aria-label="Pilih porsi">
                {SERVING_PRESETS.map((p) => {
                  const active = unit.trim().toLowerCase() === p.unit;
                  return (
                    <button
                      key={p.unit}
                      type="button"
                      className={`quick-unit-chip${active ? " active" : ""}`}
                      onClick={() => {
                        setUnit(p.unit);
                        setWeight(p.weight);
                      }}
                    >
                      {p.unit}
                    </button>
                  );
                })}
              </div>
            </div>
            <label>
              Kalori ({usingAutoKcal ? "otomatis dari P/K/L" : "kkal"})
              <input
                type="number"
                min="0"
                step="any"
                autoFocus={Boolean(initialName)}
                value={values.kcal}
                placeholder={
                  usingAutoKcal
                    ? `${autoKcal} (otomatis)`
                    : "Mis. 250 (kosongkan jika isi P/K/L)"
                }
                inputMode="decimal"
                onChange={(e) => setValues({ ...values, kcal: e.target.value })}
              />
            </label>
            <div className="quick-macros-grid">
              {(["protein", "carbs", "fat"] as const).map((k) => (
                <label key={k}>
                  {k === "protein" ? "Protein (g)" : k === "carbs" ? "Karbo (g)" : "Lemak (g)"}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={values[k]}
                    placeholder="0"
                    inputMode="decimal"
                    onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </>
        )}
        <details className="label-extra">
          <summary>
            {quickMode
              ? "Detail lengkap (satuan kustom, berat, gula, natrium, serat)"
              : "Gula, natrium, dan nutrisi lain"}
          </summary>
          {quickMode && (
            <div className="form-columns" style={{ marginBottom: 10 }}>
              <label>
                Satuan kustom
                <input
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Mis. 1 porsi"
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
        <NutritionSummary
          values={{
            kcal:
              label
                ? values.kcal === "" || !Number.isFinite(multiplier)
                  ? null
                  : Number(values.kcal) * multiplier
                : effectiveQuickKcal,
            protein: label
              ? values.protein === "" || !Number.isFinite(multiplier)
                ? null
                : Number(values.protein) * multiplier
              : macroNumbers.protein,
            carbs: label
              ? values.carbs === "" || !Number.isFinite(multiplier)
                ? null
                : Number(values.carbs) * multiplier
              : macroNumbers.carbs,
            fat: label
              ? values.fat === "" || !Number.isFinite(multiplier)
                ? null
                : Number(values.fat) * multiplier
              : macroNumbers.fat,
          }}
          caption={
            label
              ? "Jumlah yang akan dicatat"
              : `Ringkasan · ${unit.trim() || "1 porsi"}`
          }
        />
      </form>
    </FriendlySheet>
  );
}
