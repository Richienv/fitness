import {
  parseNutritionLabel,
  labelTextFromOcr,
  labelConfidenceFromOcr,
  withLabelConfidenceWarnings,
  type NutritionLabel,
  type LabelOcrItem,
} from "./nutritionLabel";
import type { LabelCrop } from "./nutritionCamera";
export type NutritionRead = {
  label: NutritionLabel;
  confidence: number;
  elapsedMs: number;
};
export type NutritionOcr = {
  initialize: () => Promise<void>;
  read: (
    image: HTMLCanvasElement,
    mode?: "fast" | "quality",
  ) => Promise<NutritionRead>;
  /** Release this lease; a short idle window keeps the next scan warm. */
  terminate: (discard?: boolean) => Promise<void>;
};
type Engine = {
  initialize: () => Promise<void>;
  read: NutritionOcr["read"];
  destroy: () => Promise<void>;
};
type SharedEngine = {
  promise: Promise<Engine>;
  users: number;
  idle: ReturnType<typeof setTimeout> | null;
};
let shared: SharedEngine | null = null;
const IDLE_MS = 90_000;
function bounded<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
async function makeEngine(): Promise<Engine> {
  const base = `${location.origin}/ocr/paddle-v1`;
  const moduleUrl = `${base}/worker-client-v2.mjs`;
  // Main-thread OpenCV is excluded from this worker-only client. The official
  // worker still contains the complete runtime and both model URLs are local.
  const { PaddleOCR } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl
  )) as typeof import("@paddleocr/paddleocr-js");
  let browserWorker: Worker | null = null;
  const ocr = await bounded(
    PaddleOCR.create({
      initialize: false,
      worker: {
        createWorker: () => {
          browserWorker = new Worker(`${base}/worker.js`, { type: "module" });
          return browserWorker;
        },
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
    }),
    45000,
    "Pembaca belum bisa dimuat. Periksa koneksi lalu coba lagi.",
  ).catch((error) => {
    browserWorker?.terminate();
    throw error;
  });
  let initialization: Promise<void> | null = null;
  let queue = Promise.resolve();
  const initialize = () =>
    (initialization ??= bounded(
      ocr.initialize(),
      45000,
      "Pembaca belum selesai dimuat. Periksa koneksi, lalu coba lagi; foto tetap tersedia.",
    ).then(() => {}));
  return {
    initialize,
    read(image, mode = "quality") {
      const task = queue.then(async () => {
        await initialize();
        const start = performance.now();
        const [result] = await bounded(
          ocr.predict(image, {
            textDetLimitSideLen: mode === "fast" ? 768 : 1600,
            textDetLimitType: "max",
            textRecScoreThresh: 0.5,
          }),
          30000,
          "Pembacaan terlalu lama. Crop lebih dekat ke tabel, lalu baca lagi.",
        );
        const items = result.items as LabelOcrItem[];
        const label = withLabelConfidenceWarnings(
          items,
          parseNutritionLabel(labelTextFromOcr(items)),
        );
        return {
          label,
          confidence: labelConfidenceFromOcr(items, label),
          elapsedMs: performance.now() - start,
        };
      });
      queue = task.then(
        () => {},
        () => {},
      );
      return task;
    },
    async destroy() {
      browserWorker?.terminate();
      // A stalled initialization must not keep a worker alive indefinitely.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ocr.dispose().catch(() => {}),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        browserWorker?.terminate();
      }
    },
  };
}
export async function createNutritionOcr(
  progress: (status: string, percent: number) => void,
): Promise<NutritionOcr> {
  const entry = (shared ??= { promise: makeEngine(), users: 0, idle: null });
  entry.users++;
  if (entry.idle) clearTimeout(entry.idle);
  entry.idle = null;
  let alive = true;
  let readyReported = false;
  const release = async (discard = false) => {
    if (!alive) return;
    alive = false;
    entry.users--;
    if (discard) {
      if (shared === entry) shared = null;
      if (entry.idle) clearTimeout(entry.idle);
      void entry.promise.then((engine) => engine.destroy()).catch(() => {});
      return;
    }
    if (entry.users === 0 && !entry.idle)
      entry.idle = setTimeout(() => {
        if (shared === entry) shared = null;
        void entry.promise.then((engine) => engine.destroy()).catch(() => {});
      }, IDLE_MS);
  };
  try {
    progress("loading", 0);
    const engine = await entry.promise;
    const initialize = async () => {
      try {
        await engine.initialize();
      } catch (e) {
        if (shared === entry) shared = null;
        void release();
        void engine.destroy();
        throw e;
      }
      if (alive && !readyReported) {
        readyReported = true;
        progress("ready", 100);
      }
    };
    return {
      initialize,
      read: async (image, mode) => {
        if (!alive) throw new Error("Sesi pembacaan sudah ditutup.");
        await initialize();
        if (!alive) throw new Error("Sesi pembacaan sudah ditutup.");
        try {
          return await engine.read(image, mode);
        } catch (error) {
          await release(true);
          throw error;
        }
      },
      terminate: release,
    };
  } catch (e) {
    if (shared === entry) shared = null;
    await release();
    throw e;
  }
}
export const readNutritionLabel = (
  worker: NutritionOcr,
  image: HTMLCanvasElement,
  mode?: "fast" | "quality",
) => worker.read(image, mode);
export function labelImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  crop?: LabelCrop,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const region = crop ?? { x: 0, y: 0, width, height };
  const scale = Math.min(2, 1800 / region.width, 2200 / region.height);
  canvas.width = Math.round(region.width * scale);
  canvas.height = Math.round(region.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gambar belum bisa diproses. Coba lagi.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}
