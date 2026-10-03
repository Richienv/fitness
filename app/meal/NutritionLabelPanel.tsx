"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NutritionOcr } from "@/lib/nutritionOcr";
import {
  labelCanAutoCapture,
  labelFingerprint,
  type NutritionLabel,
} from "@/lib/nutritionLabel";
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
          ...(confidence < 75
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
      const scan = async () => {
        if (!active.current || generation !== run.current || document.hidden)
          return;
        const v = video.current;
        if (!v?.videoWidth) {
          timer.current = setTimeout(() => void scan(), 500);
          return;
        }
        setStatus("Membaca tabel nutrisi… Tahan kemasan tetap.");
        try {
          const frame = labelImage(v, v.videoWidth, v.videoHeight);
          const read = await readNutritionLabel(reader, frame);
          if (!active.current || generation !== run.current) return;
          const fingerprint = labelFingerprint(read.label);
          repeats = fingerprint === last ? repeats + 1 : 1;
          last = fingerprint;
          if (labelCanAutoCapture(read.label, read.confidence, repeats)) {
            accept(read.label, frame, read.confidence);
            return;
          }
          setStatus(
            repeats > 1 && read.label.basis
              ? "Label terdeteksi. Memastikan angka tetap sama…"
              : "Dekatkan tabel nutrisi dan kurangi pantulan. Scan terus berjalan.",
          );
          timer.current = setTimeout(() => void scan(), 1000);
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
    active.current = true;
    if (!result && !manual && wantsCamera.current && !document.hidden)
      void start();
    const visibility = () => {
      if (document.hidden) stopCamera();
      else if (!result && !manual && wantsCamera.current) void start();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      stopCamera();
      document.removeEventListener("visibilitychange", visibility);
      const pending = worker.current;
      worker.current = null;
      if (pending) void pending.then((w) => w.terminate()).catch(() => {});
    };
  }, [attempt, manual, result, start, stopCamera]);
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
      <p className="quiet">
        Arahkan kamera ke tabel 营养成分表. Angka ditangkap otomatis saat
        terbaca stabil, lalu bisa kamu koreksi.
      </p>
      <div className={`label-camera${running ? " scanning" : ""}`}>
        <video
          ref={video}
          muted
          playsInline
          aria-label="Pratinjau label nutrisi"
        />
        <div className="label-guide" aria-hidden="true" />
        <span className="label-camera-label">营养成分表 · Nutrition</span>
      </div>
      <p role="status" className="barcode-status">
        {error || status}
      </p>
      {!running && !busy && (
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
      <p className="quiet">
        Foto diproses di perangkat ini. Energi kJ dikonversi ke kkal; persentase
        NRV diabaikan.
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
