import { IMAGE_METHODS } from "@/lib/nutritionPreprocess";
import {
  nutritionCoreCount,
  nutritionReadScore,
} from "@/lib/nutritionReadQuality";
import type { NutritionScanEvidence as ScanEvidence } from "@/lib/nutritionReadPipeline";

export default function NutritionScanEvidence({
  evidence,
  text,
}: {
  evidence: ScanEvidence;
  text: string;
}) {
  const percent = (n: number) => `${Math.round(n)}%`;
  const methodName = (method: ScanEvidence["method"]) =>
    method === "focus"
      ? "Fokus tabel"
      : method === "scale"
        ? "Ukuran alternatif"
        : method === "rotate90"
          ? "Putar otomatis 90°"
          : method === "rotate270"
            ? "Putar otomatis 270°"
            : method === "llm"
              ? "Bantuan AI terstruktur"
              : IMAGE_METHODS[method];
  const winner =
    evidence.predictions.find((p) => p.method === evidence.method) ??
    evidence.predictions[0];
  return (
    <details className="label-evidence label-scan-result">
      <summary>
        Lihat foto & hasil baca ({winner ? nutritionCoreCount(winner.label) : 0}
        /4 nutrisi utama
        {evidence.usedLlmFallback ? " · AI" : ""})
      </summary>
      <div className="label-image-comparison">
        <figure>
          <figcaption>Gambar asli</figcaption>
          <img
            src={evidence.original}
            alt="Gambar label asli sebelum perbaikan"
          />
        </figure>
        <figure>
          <figcaption>
            {evidence.method === "original"
              ? "Asli terpilih"
              : methodName(evidence.method)}
          </figcaption>
          <img
            src={evidence.processed}
            alt="Gambar yang digunakan untuk hasil terpilih"
          />
        </figure>
      </div>
      <details className="label-variant-details">
        <summary>Hasil tiap versi ({evidence.predictions.length})</summary>
        {evidence.predictions.map((prediction, idx) => (
          <div className="label-variant-result" key={`${prediction.method}-${idx}`}>
            <strong>
              {methodName(prediction.method)}
              {prediction.method === evidence.method ? " · Terpilih" : ""}
            </strong>
            <p>
              OCR {percent(prediction.confidence)} ·{" "}
              {nutritionCoreCount(prediction.label)}/4 nutrisi utama · skor
              kelengkapan {Math.round(nutritionReadScore(prediction))}
            </p>
            <p>
              {(prediction.elapsedMs / 1000).toFixed(2)} dtk baca ·{" "}
              {Math.round(prediction.preprocessMs)} ms perbaikan
            </p>
            <p>
              kkal {prediction.label.values.kcal ?? "—"} · P{" "}
              {prediction.label.values.protein ?? "—"} · K{" "}
              {prediction.label.values.carbs ?? "—"} · L{" "}
              {prediction.label.values.fat ?? "—"}
            </p>
            <pre>{prediction.label.text}</pre>
          </div>
        ))}
      </details>
      <details className="label-variant-details">
        <summary>Teks terpilih</summary>
        <pre>{text}</pre>
      </details>
    </details>
  );
}
