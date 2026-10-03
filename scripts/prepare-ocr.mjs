import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = path.resolve("public/ocr/paddle-v1");
await mkdir(path.join(root, "runtime"), { recursive: true });
const sdk = path.dirname(
  fileURLToPath(import.meta.resolve("@paddleocr/paddleocr-js")),
);
await build({
  entryPoints: [path.join(sdk, "index.mjs")],
  outfile: path.join(root, "sdk.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  external: ["fs", "path", "crypto"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const worker = (await readdir(path.join(sdk, "assets"))).find((n) =>
  /^worker-entry-.*\.js$/.test(n),
);
if (!worker) throw new Error("PaddleOCR worker asset is missing.");
await copyFile(path.join(sdk, "assets", worker), path.join(root, "worker.js"));
const ort = path.dirname(fileURLToPath(import.meta.resolve("onnxruntime-web")));
// The official worker bundles ORT's JSEP loader even with backend: "wasm".
// Ship both loader pairs so a fresh deployment has the worker's required files.
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await copyFile(path.join(ort, file), path.join(root, "runtime", file));
for (const model of JSON.parse(
  await readFile("scripts/ocr-models.json", "utf8"),
)) {
  const target = path.join(root, `${model.name}.tar`);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  let data;
  try {
    data = await readFile(target);
  } catch {}
  if (!data || hash(data) !== model.sha256) {
    console.log(`Downloading ${model.name} from official PaddleOCR assets…`);
    const res = await fetch(model.url, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`OCR model download failed: ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
    if (hash(data) !== model.sha256)
      throw new Error(`OCR model checksum mismatch: ${model.name}`);
    await writeFile(target, data);
  }
}
console.log(
  "Prepared same-origin PaddleOCR worker, runtime and Chinese models.",
);
