import {
  parseNutritionLabel,
  labelTextFromOcr,
  type NutritionLabel,
  type LabelOcrItem,
} from "./nutritionLabel";
export type NutritionOcr = {
  read: (
    image: HTMLCanvasElement,
  ) => Promise<{ label: NutritionLabel; confidence: number }>;
  terminate: () => Promise<void>;
};
export async function createNutritionOcr(
  progress: (status: string, percent: number) => void,
): Promise<NutritionOcr> {
  progress("loading", 0);
  const base = `${location.origin}/ocr/paddle-v1`;
  const moduleUrl = `${base}/sdk.mjs`;
  // Assets are bundled at build time and served by this app, including worker,
  // ONNX runtime, OpenCV and both Chinese OCR models. No photo leaves the device.
  const { PaddleOCR } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl
  )) as typeof import("@paddleocr/paddleocr-js");
  const ocr = await PaddleOCR.create({
    initialize: false,
    worker: {
      createWorker: () => new Worker(`${base}/worker.js`, { type: "module" }),
    },
    textDetectionModelName: "PP-OCRv5_mobile_det",
    textRecognitionModelName: "PP-OCRv5_mobile_rec",
    textDetectionModelAsset: { url: `${base}/PP-OCRv5_mobile_det.tar` },
    textRecognitionModelAsset: { url: `${base}/PP-OCRv5_mobile_rec.tar` },
    ortOptions: {
      backend: "wasm",
      wasmPaths: `${base}/runtime/`,
      numThreads: 1,
    },
  });
  let initialized = false;
  return {
    async read(image) {
      if (!initialized) {
        await ocr.initialize();
        initialized = true;
        progress("ready", 100);
      }
      const [result] = await ocr.predict(image, {
        textDetLimitSideLen: 960,
        textRecScoreThresh: 0.5,
      });
      const items = result.items as LabelOcrItem[];
      const label = parseNutritionLabel(labelTextFromOcr(items));
      const confidence = items.length
        ? (items.reduce((n, i) => n + i.score, 0) / items.length) * 100
        : 0;
      return { label, confidence };
    },
    async terminate() {
      await ocr.dispose();
    },
  };
}
export const readNutritionLabel = (
  worker: NutritionOcr,
  image: HTMLCanvasElement,
) => worker.read(image);
export function labelImage(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, 1600 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gambar belum bisa diproses. Coba lagi.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
