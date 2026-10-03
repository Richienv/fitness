import {
  automaticImageMethods,
  imageStatistics,
  preprocessPixels,
  type ImageMethod,
  type ImagePreset,
} from "./nutritionPreprocess";
import {
  bestNutritionPrediction,
  labelNeedsRescue,
  nutritionCoreCount,
  nutritionReadScore,
  type VariantPrediction,
} from "./nutritionReadQuality";
import type { NutritionOcr } from "./nutritionOcr";
import type { NutritionLabel } from "./nutritionLabel";

export type NutritionScanEvidence = {
  classification: "Tabel nutrisi" | "Label belum lengkap";
  confidence: number;
  method: ImageMethod;
  original: string;
  processed: string;
  predictions: VariantPrediction[];
  elapsedMs: number;
};
export type OptimizedNutritionRead = {
  label: NutritionLabel;
  confidence: number;
  evidence: NutritionScanEvidence;
};
export type ReadPipelineOptions = {
  preset?: ImagePreset;
  mode?: "fast" | "quality";
  maxRescues?: number;
  budgetMs?: number;
  cancelled?: () => boolean;
  onProgress?: (method: ImageMethod) => void;
};
export async function readOptimizedNutritionLabel(
  reader: NutritionOcr,
  original: HTMLCanvasElement,
  options: ReadPipelineOptions = {},
): Promise<OptimizedNutritionRead> {
  // Initialization is shared; exclude the first asset download from rescue budget.
  await reader.initialize();
  const start = performance.now();
  const predictions: VariantPrediction[] = [];
  let selected = original;
  const check = () => {
    if (options.cancelled?.()) throw new Error("Pembacaan dibatalkan.");
  };
  check();
  options.onProgress?.("original");
  const first = await reader.read(original, options.mode);
  check();
  predictions.push({ ...first, method: "original", preprocessMs: 0 });
  const preset = options.preset ?? "auto";
  if (
    preset !== "original" &&
    (preset !== "auto" || labelNeedsRescue(predictions[0]))
  ) {
    const context = original.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Gambar belum siap diproses.");
    const pixels = context.getImageData(0, 0, original.width, original.height);
    const methods =
      preset === "auto"
        ? automaticImageMethods(imageStatistics(pixels)).slice(
            0,
            options.maxRescues ?? 2,
          )
        : [preset];
    for (const method of methods) {
      check();
      if (
        preset === "auto" &&
        performance.now() - start >= (options.budgetMs ?? 4500)
      )
        break;
      options.onProgress?.(method);
      // Yield between predictions so the camera and controls can render.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
      const preprocessStart = performance.now();
      const processed = preprocessPixels(pixels, method);
      const canvas = document.createElement("canvas");
      canvas.width = original.width;
      canvas.height = original.height;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(processed.width, processed.height);
      imageData.data.set(processed.data);
      ctx.putImageData(imageData, 0, 0);
      const preprocessMs = performance.now() - preprocessStart;
      const read = await reader.read(canvas, options.mode);
      check();
      const candidate = { ...read, method, preprocessMs };
      const prior = bestNutritionPrediction(predictions).winner;
      predictions.push(candidate);
      if (nutritionReadScore(candidate) > nutritionReadScore(prior))
        selected = canvas;
      if (
        preset === "auto" &&
        !labelNeedsRescue(bestNutritionPrediction(predictions).winner)
      )
        break;
    }
  }
  const best = bestNutritionPrediction(predictions);
  const evidence: NutritionScanEvidence = {
    classification:
      nutritionCoreCount(best.label) >= 2
        ? "Tabel nutrisi"
        : "Label belum lengkap",
    confidence: best.winner.confidence,
    method: best.winner.method,
    original: original.toDataURL("image/jpeg", 0.85),
    processed: selected.toDataURL("image/jpeg", 0.85),
    predictions,
    elapsedMs: performance.now() - start,
  };
  // No photos, names or nutrient values are persisted or transmitted in this log.
  console.info("[nutrition-preprocess]", {
    method: evidence.method,
    confidence: Math.round(evidence.confidence),
    passes: predictions.length,
    elapsedMs: Math.round(evidence.elapsedMs),
    preprocessMs: Math.round(
      predictions.reduce((n, p) => n + p.preprocessMs, 0),
    ),
  });
  return { label: best.label, confidence: evidence.confidence, evidence };
}
