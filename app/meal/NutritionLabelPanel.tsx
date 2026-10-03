"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NutritionOcr } from "@/lib/nutritionOcr";
import {
  labelCanAutoCapture,
  labelFingerprint,
  confirmLabelRead,
  type NutritionLabel,
} from "@/lib/nutritionLabel";
import { nutritionGuideCrop } from "@/lib/nutritionCamera";
import {
  createNutritionOcr,
  labelImage,
  readNutritionLabel,
} from "@/lib/nutritionOcr";
import type { RecipeFood } from "@/lib/recipes";
import FriendlySheet from "./FriendlySheet";
import ManualFoodSheet, { type ManualFoodInitial } from "./ManualFoodSheet";
export default function NutritionLabelPanel({
  onClose,
  onAdd,
  initial,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  initial?: ManualFoodInitial;
}) {
  const [result, setResult] = useState<NutritionLabel | null>(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("Menyiapkan pembaca label…");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const cameraBox = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<Promise<NutritionOcr> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const run = useRef(0);
  const wantsCamera = useRef(true);
  const stopCamera = useCallback(() => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (active.current) setRunning(false);
  }, []);
  const getWorker = useCallback(() => {
    if (!worker.current) {
      const promise = createNutritionOcr((stage) => {
        if (active.current && stage !== "recognizing text")
          setStatus(
            stage === "ready"
              ? "Membaca tabel nutrisi…"
              : "Menyiapkan pembaca label… Unduhan pertama bisa lebih lama.",
          );
      });
      worker.current = promise;
      promise.catch(() => {
        if (worker.current === promise) worker.current = null;
      });
    }
    return worker.current;
  }, []);
  const accept = useCallback(
    (label: NutritionLabel, frame: HTMLCanvasElement, confidence: number) => {
      wantsCamera.current = false;
      stopCamera();
      setPreview(frame.toDataURL("image/jpeg", 0.85));
      setResult({
        ...label,
        warnings: [
          ...label.warnings,
          ...(confidence < 75 &&
          !label.warnings.some((w) => w.includes("kurang jelas"))
            ? [
                "Sebagian teks kurang jelas. Periksa angka dengan foto sebelum menambahkan.",
              ]
            : []),
        ],
      });
      setBusy(false);
      const pending = worker.current;
      worker.current = null;
      if (pending) void pending.then((w) => w.terminate()).catch(() => {});
    },
    [stopCamera],
  );
  const start = useCallback(async () => {
    stopCamera();
    setError("");
    setStatus("Menyalakan kamera…");
    setBusy(false);
    const generation = run.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Kamera tidak tersedia. Pilih gambar label atau isi manual.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (!active.current || generation !== run.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (!video.current) throw new Error("Pratinjau kamera belum tersedia.");
      video.current.srcObject = media;
      await video.current.play();
      if (!active.current || generation !== run.current) return;
      setRunning(true);
      const reader = await getWorker();
      if (!active.current || generation !== run.current) return;
      let last = "",
        repeats = 0;
      let previous: NutritionLabel | null = null;
      let qualityNext = false;
      const scan = async () => {
        if (!active.current || generation !== run.current || document.hidden)
          return;
        const v = video.current;
        if (!v || v.videoWidth < 160 || v.videoHeight < 160) {
          setStatus("Menunggu gambar kamera…");
          timer.current = setTimeout(() => void scan(), 500);
          return;
        }
        setStatus("Membaca tabel nutrisi… Tahan kemasan tetap.");
        try {
          const box = cameraBox.current?.getBoundingClientRect();
          if (!box?.width || !box.height)
            throw new Error("Bingkai kamera belum siap.");
          const crop = nutritionGuideCrop(
            v.videoWidth,
            v.videoHeight,
            box.width,
            box.height,
          );
          const frame = labelImage(v, v.videoWidth, v.videoHeight, crop);
          const read = await readNutritionLabel(
            reader,
            frame,
            qualityNext ? "quality" : "fast",
          );
          if (!active.current || generation !== run.current) return;
          const fingerprint = labelFingerprint(read.label);
          repeats = fingerprint === last ? repeats + 1 : 1;
          last = fingerprint;
          const label =
            repeats > 1 && previous
              ? confirmLabelRead(previous, read.label)
              : read.label;
          previous = read.label;
          const coreCount = [
            label.values.kcal,
            label.values.protein,
            label.values.carbs,
            label.values.fat,
          ].filter((n) => n !== null).length;
          qualityNext =
            coreCount >= 2 &&
            (read.confidence < 92 || label.warnings.length > 0);
          if (labelCanAutoCapture(label, read.confidence, repeats)) {
            accept(label, frame, read.confidence);
            return;
          }
          setStatus(
            coreCount === 4
              ? "Tabel terbaca. Tahan tetap sebentar untuk memastikan angka."
              : coreCount >= 2
                ? "Sebagian tabel terbaca. Masukkan judul dan baris paling bawah."
                : "Dekatkan tabel sampai memenuhi bingkai. Kurangi pantulan cahaya.",
          );
          timer.current = setTimeout(() => void scan(), 350);
        } catch {
          if (!active.current || generation !== run.current) return;
          wantsCamera.current = false;
          stopCamera();
          setError(
            "Pembaca label terhenti. Coba lagi, pilih gambar, atau isi manual.",
          );
          const pending = worker.current;
          worker.current = null;
          if (pending) void pending.then((w) => w.terminate()).catch(() => {});
        }
      };
      void scan();
    } catch (e) {
      if (!active.current || generation !== run.current) return;
      wantsCamera.current = false;
      stopCamera();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser atau pilih gambar label."
          : e instanceof Error
            ? e.message
            : "Kamera belum bisa dibuka.",
      );
    }
  }, [accept, getWorker, stopCamera]);
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    // Load in parallel with camera permission and positioning, not after a frame.
    if (!result && !manual)
      void getWorker()
        .then((w) => w.initialize())
        .catch(() => {
          if (!cancelled && active.current)
            setError("Pembaca label belum siap. Coba lagi atau isi manual.");
        });
    if (!result && !manual && wantsCamera.current && !document.hidden)
      void start();
    const visibility = () => {
      if (document.hidden && wantsCamera.current) stopCamera();
      else if (!result && !manual && wantsCamera.current) void start();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      active.current = false;
      stopCamera();
      document.removeEventListener("visibilitychange", visibility);
      const pending = worker.current;
      worker.current = null;
      if (pending) void pending.then((w) => w.terminate()).catch(() => {});
    };
  }, [attempt, manual, result, start, stopCamera, getWorker]);
  async function selectImage(file: File | undefined) {
    if (!file) return;
    wantsCamera.current = false;
    stopCamera();
    setError("");
    setBusy(true);
    setStatus("Membaca gambar label…");
    const previous = worker.current;
    worker.current = null;
    if (previous) void previous.then((w) => w.terminate()).catch(() => {});
    const generation = run.current;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setError("Pilih gambar label berukuran maksimal 15 MB.");
      setBusy(false);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!active.current || generation !== run.current) return;
      const frame = labelImage(image, image.naturalWidth, image.naturalHeight);
      const reader = await getWorker();
      if (!active.current || generation !== run.current) return;
      const read = await readNutritionLabel(reader, frame);
      if (active.current && generation === run.current)
        accept(read.label, frame, read.confidence);
    } catch {
      if (active.current && generation === run.current)
        setError(
          "Gambar belum bisa dibaca. Pilih JPG/PNG yang lebih jelas atau isi manual.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (active.current && generation === run.current) setBusy(false);
    }
  }
  if (manual)
    return (
      <ManualFoodSheet initial={initial} onClose={onClose} onAdd={onAdd} />
    );
  if (result)
    return (
      <ManualFoodSheet
        label={result}
        preview={preview}
        initial={initial}
        onClose={onClose}
        onAdd={onAdd}
        onRescan={() => {
          setResult(null);
          setPreview("");
          wantsCamera.current = true;
          setAttempt((n) => n + 1);
        }}
      />
    );
  return (
    <FriendlySheet
      title="Scan label nutrisi"
      onClose={() => {
        wantsCamera.current = false;
        stopCamera();
        onClose();
      }}
    >
      <p className="label-intro">
        Masukkan tabel <span lang="zh">营养成分表</span> utuh. Terbaca otomatis,
        lalu bisa dikoreksi.
      </p>
      <div
        ref={cameraBox}
        className={`label-camera${running ? " scanning" : ""}`}
      >
        <video
          ref={video}
          muted
          playsInline
          aria-label="Pratinjau label nutrisi"
        />
        <div className="label-guide" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="label-position-hint">
          Judul tabel di bagian atas bingkai
        </span>
        {!running && (
          <div className="label-table-example" aria-hidden="true">
            <strong lang="zh">营养成分表</strong>
            <div className="label-example-head">
              <span lang="zh">项目</span>
              <span>每100克 / ml</span>
              <span>NRV%</span>
            </div>
            {[
              ["能量", "kJ"],
              ["蛋白质", "g"],
              ["脂肪", "g"],
              ["碳水化合物", "g"],
              ["钠", "mg"],
            ].map(([name, unit]) => (
              <div className="label-example-row" key={name}>
                <span lang="zh">{name}</span>
                <span className="label-example-dots" />
                <span>{unit}</span>
              </div>
            ))}
            <small>Contoh posisi tabel</small>
          </div>
        )}
        <span className="label-camera-label">
          Angka + satuan di tengah · baris bawah ikut masuk
        </span>
      </div>
      <p role="status" className="barcode-status">
        {error || status}
      </p>
      {!!error && !running && !busy && (
        <button
          className="secondary-button"
          onClick={() => {
            wantsCamera.current = true;
            setAttempt((n) => n + 1);
          }}
        >
          Coba kamera lagi
        </button>
      )}
      <label className="label-upload secondary-button">
        {busy ? "Membaca gambar…" : "Pilih gambar label"}
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            void selectImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="label-privacy">
        Foto tetap di perangkat. kJ jadi kkal; NRV% diabaikan.
      </p>
      <button
        className="text-button"
        onClick={() => {
          wantsCamera.current = false;
          stopCamera();
          setManual(true);
        }}
      >
        Isi nutrisi manual
      </button>
    </FriendlySheet>
  );
}
