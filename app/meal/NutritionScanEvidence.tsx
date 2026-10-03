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
  return (
    <div className="label-scan-result">
      <div className="label-result-heading">
        <strong>{evidence.classification}</strong>
        <span>Confidence OCR {percent(evidence.confidence)}</span>
      </div>
      <p className="quiet">
        {IMAGE_METHODS[evidence.method]} terpilih ·{" "}
        {evidence.predictions.length} versi dibaca. Confidence menunjukkan
        keyakinan pembaca teks, bukan jaminan angka benar.
      </p>
      <details className="label-evidence">
        <summary>Bandingkan gambar dan hasil</summary>
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
                : IMAGE_METHODS[evidence.method]}
            </figcaption>
            <img
              src={evidence.processed}
              alt="Gambar yang digunakan untuk hasil terpilih"
            />
          </figure>
        </div>
        <details className="label-variant-details">
          <summary>Hasil tiap versi ({evidence.predictions.length})</summary>
          {evidence.predictions.map((prediction) => (
            <div className="label-variant-result" key={prediction.method}>
              <strong>
                {IMAGE_METHODS[prediction.method]}
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
    </div>
  );
}
