import {
  nutritionTableRegion,
  useLatinNutritionReader,
} from "./nutritionRegion";
import {
  assessImageQuality,
  imageStatistics,
  preprocessPixels,
  rescueImageMethods,
  type ImageMethod,
  type ImagePreset,
  type ImageQuality,
} from "./nutritionPreprocess";
import {
  bestNutritionPrediction,
  labelNeedsRescue,
  nutritionCoreCount,
  nutritionReadScore,
  type VariantPrediction,
} from "./nutritionReadQuality";
import type { NutritionOcr } from "./nutritionOcr";
import type { LabelOcrItem, NutritionLabel } from "./nutritionLabel";

export type NutritionScanEvidence = {
  classification: "Tabel nutrisi" | "Label belum lengkap";
  confidence: number;
  method: VariantPrediction["method"];
  original: string;
  processed: string;
  predictions: VariantPrediction[];
  elapsedMs: number;
  quality?: ImageQuality;
  usedLlmFallback?: boolean;
};
export type OptimizedNutritionRead = {
  label: NutritionLabel;
  confidence: number;
  evidence: NutritionScanEvidence;
  /** Structured OCR polygons from the winning pass, ready for Stage 2 LLM fallback. */
  items: LabelOcrItem[];
  /** Compact cropped JPEG of the selected table region for optional LLM vision assist. */
  croppedDataUrl: string;
};
export type ReadPipelineOptions = {
  preset?: ImagePreset;
  mode?: "fast" | "quality";
  maxRescues?: number;
  budgetMs?: number;
  cancelled?: () => boolean;
  onProgress?: (method: VariantPrediction["method"]) => void;
};

function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: 90 | 270,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d")!;
  if (degrees === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** Detect whether most OCR polygons are rotated sideways (tall thin vertical boxes). */
function looksRotatedSideways(items: LabelOcrItem[] | undefined): boolean {
  if (!items || items.length < 3) return false;
  let vertical = 0;
  let measurable = 0;
  for (const item of items) {
    if (item.poly.length !== 4 || item.score < 0.4) continue;
    const xs = item.poly.map((p) => p[0]);
    const ys = item.poly.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w < 4 && h < 4) continue;
    measurable++;
    if (h > w * 1.45) vertical++;
  }
  return measurable >= 3 && vertical / measurable >= 0.55;
}

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

  // Fast pre-check on original image statistics & quality (blur/glare/shadows).
  const origCtx = original.getContext("2d", { willReadFrequently: true });
  const origPixels = origCtx
    ? origCtx.getImageData(0, 0, original.width, original.height)
    : null;
  const quality = origPixels ? assessImageQuality(origPixels) : undefined;

  options.onProgress?.("original");
  const first = await reader.read(original, options.mode);
  check();
  predictions.push({ ...first, method: "original", preprocessMs: 0 });
  const preset = options.preset ?? "auto";
  let alphabet: "mixed" | "latin" = "mixed";
  let working = original;

  // Auto-orientation rescue when a sideways photo produces mostly vertical boxes.
  if (
    preset === "auto" &&
    nutritionCoreCount(first.label) < 2 &&
    looksRotatedSideways(first.items) &&
    performance.now() - start < (options.budgetMs ?? 14000)
  ) {
    for (const deg of [90, 270] as const) {
      check();
      if (performance.now() - start >= (options.budgetMs ?? 14000)) break;
      const method = deg === 90 ? ("rotate90" as const) : ("rotate270" as const);
      options.onProgress?.(method);
      const rotated = rotateCanvas(original, deg);
      const rotRead = await reader.read(rotated, options.mode);
      check();
      const candidate: VariantPrediction = {
        ...rotRead,
        method,
        preprocessMs: 0,
      };
      const priorBest = bestNutritionPrediction(predictions).winner;
      predictions.push(candidate);
      if (nutritionReadScore(candidate) > nutritionReadScore(priorBest)) {
        selected = rotated;
        working = rotated;
      }
      if (nutritionCoreCount(rotRead.label) >= 3) break;
    }
  }

  const currentBest = bestNutritionPrediction(predictions).winner;
  // Zoom actual detected table pixels before retrying small, curved packaging.
  // A separate Latin model reads "g" from pixels instead of guessing that 9=g.
  if (preset === "auto" && labelNeedsRescue(currentBest)) {
    if (useLatinNutritionReader(currentBest.label.text)) alphabet = "latin";
    const region = currentBest.items
      ? nutritionTableRegion(currentBest.items, working.width, working.height)
      : null;
    if (region) {
      const zoomed = document.createElement("canvas");
      const scale = Math.min(6, 1200 / region.width, 2200 / region.height);
      zoomed.width = Math.round(region.width * scale);
      zoomed.height = Math.round(region.height * scale);
      zoomed
        .getContext("2d")!
        .drawImage(
          working,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          zoomed.width,
          zoomed.height,
        );
      working = zoomed;
    }
    if (
      (region || alphabet === "latin") &&
      performance.now() - start < (options.budgetMs ?? 14000)
    ) {
      options.onProgress?.("focus");
      const retry = await reader.read(working, options.mode, alphabet);
      check();
      const candidate: VariantPrediction = {
        ...retry,
        method: "focus",
        preprocessMs: 0,
      };
      if (nutritionReadScore(candidate) > nutritionReadScore(currentBest))
        selected = working;
      predictions.push(candidate);
    }
  }

  if (
    preset !== "original" &&
    (preset !== "auto" ||
      labelNeedsRescue(bestNutritionPrediction(predictions).winner))
  ) {
    const context = working.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Gambar belum siap diproses.");
    const pixels = context.getImageData(0, 0, working.width, working.height);
    const stats = imageStatistics(pixels);
    const workingQuality = assessImageQuality(pixels);
    const methods: VariantPrediction["method"][] =
      preset === "auto"
        ? [
            ...(working !== original ? ["scale" as const] : []),
            ...rescueImageMethods(stats, workingQuality),
          ].slice(0, options.maxRescues ?? 3)
        : [preset];
    for (const method of methods) {
      check();
      if (
        preset === "auto" &&
        performance.now() - start >= (options.budgetMs ?? 14000)
      )
        break;
      options.onProgress?.(method);
      // Yield between predictions so the camera and controls can render.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
      const preprocessStart = performance.now();
      const canvas = document.createElement("canvas");
      if (method === "scale") {
        canvas.width = Math.round((working.width * 2) / 3);
        canvas.height = Math.round((working.height * 2) / 3);
        canvas
          .getContext("2d")!
          .drawImage(working, 0, 0, canvas.width, canvas.height);
      } else {
        const processed = preprocessPixels(pixels, method as ImageMethod);
        canvas.width = working.width;
        canvas.height = working.height;
        const ctx = canvas.getContext("2d")!;
        const imageData = ctx.createImageData(
          processed.width,
          processed.height,
        );
        imageData.data.set(processed.data);
        ctx.putImageData(imageData, 0, 0);
      }
      const preprocessMs = performance.now() - preprocessStart;
      const read = await reader.read(canvas, options.mode, alphabet);
      check();
      const candidate: VariantPrediction = { ...read, method, preprocessMs };
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
  const processedDataUrl = selected.toDataURL("image/jpeg", 0.85);
  // Build a bounded JPEG (max 1024px) for optional Stage 2 server LLM fallback.
  const uploadCanvas = document.createElement("canvas");
  const upScale = Math.min(1, 1024 / Math.max(selected.width, selected.height));
  uploadCanvas.width = Math.max(1, Math.round(selected.width * upScale));
  uploadCanvas.height = Math.max(1, Math.round(selected.height * upScale));
  uploadCanvas
    .getContext("2d")!
    .drawImage(selected, 0, 0, uploadCanvas.width, uploadCanvas.height);
  const croppedDataUrl = uploadCanvas.toDataURL("image/jpeg", 0.82);

  const evidence: NutritionScanEvidence = {
    classification:
      nutritionCoreCount(best.label) >= 2
        ? "Tabel nutrisi"
        : "Label belum lengkap",
    confidence: best.winner.confidence,
    method: best.winner.method,
    original: original.toDataURL("image/jpeg", 0.85),
    processed: processedDataUrl,
    predictions,
    elapsedMs: performance.now() - start,
    quality,
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
  return {
    label: best.label,
    confidence: evidence.confidence,
    evidence,
    items: best.winner.items ?? first.items ?? [],
    croppedDataUrl,
  };
}
