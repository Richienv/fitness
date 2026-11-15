"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNutritionOcr,
  labelImage,
  type NutritionOcr,
} from "@/lib/nutritionOcr";
import { type NutritionLabel } from "@/lib/nutritionLabel";
import { nutritionCoreCount } from "@/lib/nutritionReadQuality";
import {
  FULL_PHOTO,
  photoCropPixels,
  type PhotoCrop,
} from "@/lib/nutritionPhoto";
import {
  readOptimizedNutritionLabel,
  type NutritionScanEvidence,
} from "@/lib/nutritionReadPipeline";
import type { RecipeFood } from "@/lib/recipes";
import FriendlySheet from "./FriendlySheet";
import ManualFoodSheet, { type ManualFoodInitial } from "./ManualFoodSheet";
import NutritionPhotoCrop from "./NutritionPhotoCrop";
import Icon from "../ui/Icon";

export default function NutritionLabelPanel({
  onClose,
  onAdd,
  initial,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  initial?: ManualFoodInitial;
}) {
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState("");
  const [crop, setCrop] = useState<PhotoCrop>(FULL_PHOTO);
  const [result, setResult] = useState<NutritionLabel | null>(null);
  const [evidence, setEvidence] = useState<NutritionScanEvidence>();
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [camera, setCamera] = useState<"off" | "starting" | "ready">("off");
  const [elapsed, setElapsed] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null),
    galleryInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const lease = useRef<NutritionOcr | null>(null),
    generation = useRef(0),
    active = useRef(true);
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (active.current) setCamera("off");
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    const old = lease.current;
    lease.current = null;
    if (old) void old.terminate(true);
    if (active.current) {
      setBusy(false);
      setStatus("");
    }
  }, []);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      if (document.hidden) {
        cancel();
        stopCamera();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      active.current = false;
      generation.current++;
      stopCamera();
      void lease.current?.terminate(true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [stopCamera, cancel]);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const start = Date.now(),
      timer = setInterval(
        () => setElapsed(Math.floor((Date.now() - start) / 1000)),
        1000,
      );
    return () => clearInterval(timer);
  }, [busy]);
  function showPhoto(canvas: HTMLCanvasElement) {
    setPhoto(canvas);
    setPreview(canvas.toDataURL("image/jpeg", 0.93));
    setCrop({ ...FULL_PHOTO });
    setError("");
  }
  async function selectImage(file: File | undefined) {
    if (!file) return;
    cancel();
    stopCamera();
    const current = generation.current;
    if (
      (!file.type.startsWith("image/") &&
        !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)) ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Pilih foto maksimal 25 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    setBusy(true);
    setStatus("Membuka foto…");
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!active.current || current !== generation.current) return;
      const canvas = document.createElement("canvas"),
        scale = Math.min(
          1,
          2600 / Math.max(image.naturalWidth, image.naturalHeight),
        );
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      showPhoto(canvas);
    } catch {
      if (active.current && current === generation.current)
        setError(
          "Format foto belum bisa dibuka. Ambil foto lewat kamera HP atau pilih JPG/PNG.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (active.current && current === generation.current) setBusy(false);
    }
  }
  async function startCamera() {
    cancel();
    stopCamera();
    setError("");
    setCamera("starting");
    const current = generation.current;
    let timeout: ReturnType<typeof setTimeout> | undefined,
      expired = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Kamera browser tidak tersedia. Gunakan Ambil foto atau Galeri.",
        );
      const request = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      request
        .then((media) => {
          if (expired || !active.current || current !== generation.current)
            media.getTracks().forEach((t) => t.stop());
        })
        .catch(() => {});
      const media = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            expired = true;
            reject(
              new Error(
                "Kamera browser belum merespons. Gunakan Ambil foto untuk membuka kamera HP.",
              ),
            );
          }, 10000);
        }),
      ]);
      if (!active.current || current !== generation.current) return;
      if (timeout) clearTimeout(timeout);
      stream.current = media;
      if (!video.current)
        throw new Error("Pratinjau belum tersedia. Gunakan kamera HP.");
      video.current.srcObject = media;
      // A stream may arrive without producing a playable video on a webview.
      await Promise.race([
        video.current.play(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error("Pratinjau kamera belum siap. Gunakan kamera HP."),
              ),
            5000,
          );
        }),
      ]);
      if (active.current && current === generation.current) setCamera("ready");
    } catch (e) {
      if (active.current && current === generation.current) {
        stopCamera();
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Kamera browser belum diizinkan. Ambil foto atau pilih dari galeri."
            : e instanceof Error
              ? e.message
              : "Kamera belum bisa dibuka.",
        );
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  function capture() {
    const v = video.current;
    if (!v?.videoWidth) {
      setError("Gambar kamera belum siap. Coba kamera HP.");
      return;
    }
    // Keep the full sensor frame. A rigid overlay must not discard table rows.
    const canvas = labelImage(v, v.videoWidth, v.videoHeight);
    cancel();
    stopCamera();
    showPhoto(canvas);
  }
  function rotate() {
    if (!photo) return;
    const canvas = document.createElement("canvas");
    canvas.width = photo.height;
    canvas.height = photo.width;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(photo, 0, 0);
    showPhoto(canvas);
  }
  async function read() {
    if (!photo || busy) return;
    cancel();
    stopCamera();
    setError("");
    setBusy(true);
    setStatus("Menyiapkan pembaca label…");
    const current = generation.current;
    let reader: NutritionOcr | null = null;
    try {
      reader = await createNutritionOcr((stage) => {
        if (active.current && current === generation.current)
          setStatus(
            stage === "ready"
              ? "Membaca angka pada label…"
              : "Menyiapkan pembaca. Unduhan pertama bisa lebih lama…",
          );
      });
      if (!active.current || current !== generation.current) {
        void reader.terminate(true);
        return;
      }
      lease.current = reader;
      const frame = labelImage(
        photo,
        photo.width,
        photo.height,
        photoCropPixels(crop, photo.width, photo.height),
      );
      const read = await readOptimizedNutritionLabel(reader, frame, {
        mode: "quality",
        maxRescues: 2,
        budgetMs: 14000,
        cancelled: () => !active.current || current !== generation.current,
        onProgress: (method) => {
          if (active.current && current === generation.current)
            setStatus(
              method === "original"
                ? "Membaca angka pada label…"
                : "Memperjelas tulisan dan membaca ulang…",
            );
        },
      });
      if (!active.current || current !== generation.current) return;
      if (!nutritionCoreCount(read.label)) {
        setError(
          "Angka nutrisi belum terbaca. Crop lebih dekat ke tabel, putar jika menyamping, lalu baca lagi.",
        );
        return;
      }
      setEvidence(read.evidence);
      setResult(read.label);
    } catch (e) {
      if (active.current && current === generation.current)
        setError(
          e instanceof Error &&
            /^(Pembaca|Pembacaan|Gambar|Ukuran)/.test(e.message)
            ? e.message
            : "Pembaca belum berhasil dimuat. Periksa koneksi dan coba lagi; foto tetap tersedia.",
        );
    } finally {
      if (reader) void reader.terminate();
      if (lease.current === reader) lease.current = null;
      if (active.current && current === generation.current) setBusy(false);
    }
  }
  function close() {
    cancel();
    stopCamera();
    onClose();
  }
  const pickers = (
    <>
      <input
        ref={cameraInput}
        className="scan-file"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Ambil foto label"
        onChange={(e) => {
          void selectImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        className="scan-file"
        type="file"
        accept="image/*"
        aria-label="Pilih foto dari galeri"
        onChange={(e) => {
          void selectImage(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
  if (manual)
    return <ManualFoodSheet initial={initial} onClose={close} onAdd={onAdd} />;
  if (result)
    return (
      <ManualFoodSheet
        label={result}
        preview={evidence?.original}
        scanEvidence={evidence}
        initial={{ ...initial, name: initial?.name || "Snack" }}
        onClose={close}
        onAdd={onAdd}
        onRescan={() => {
          setResult(null);
          setEvidence(undefined);
          setError("");
        }}
      />
    );
  return (
    <FriendlySheet
      title="Scan label"
      className="nutrition-scan-sheet"
      onClose={close}
      footer={
        <div className="scan-dock">
          {busy ? (
            <>
              <div className="scan-reading" role="status">
                <span className="scan-spinner" />
                {status}
              </div>
              <button className="secondary-button" onClick={cancel}>
                Batalkan pembacaan
              </button>
            </>
          ) : (
            <>
              {photo ? (
                <button className="primary-button" onClick={() => void read()}>
                  Baca label
                </button>
              ) : camera === "ready" ? (
                <button className="primary-button" onClick={capture}>
                  Foto & periksa
                </button>
              ) : (
                <button
                  className="primary-button"
                  onClick={() => {
                    cancel();
                    stopCamera();
                    cameraInput.current?.click();
                  }}
                >
                  Ambil foto
                </button>
              )}
              <div className="scan-dock-row">
                {photo && (
                  <button
                    className="secondary-button"
                    onClick={() => cameraInput.current?.click()}
                  >
                    Foto ulang
                  </button>
                )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    cancel();
                    stopCamera();
                    galleryInput.current?.click();
                  }}
                >
                  Galeri
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    cancel();
                    stopCamera();
                    setManual(true);
                  }}
                >
                  Isi manual
                </button>
              </div>
            </>
          )}
        </div>
      }
    >
      {pickers}
      {photo ? (
        <>
          <p className="label-intro">
            Sisakan tabel, angka, dan satuannya. Geser sudut untuk crop.
          </p>
          <NutritionPhotoCrop
            src={preview}
            ratio={photo.width / photo.height}
            crop={crop}
            onChange={setCrop}
            disabled={busy}
          />
          <div className="scan-photo-tools">
            <button className="text-button" disabled={busy} onClick={rotate}>
              Putar 90°
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setCrop({ ...FULL_PHOTO })}
            >
              Foto utuh
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className={
              "scan-capture-preview " + (camera !== "off" ? "is-camera" : "")
            }
          >
            <video
              ref={video}
              muted
              playsInline
              aria-label="Pratinjau kamera label"
            />
            {camera === "off" && (
              <div className="scan-empty">
                <Icon name="scan" size={44} />
                <h3>Foto tabel nutrisinya.</h3>
                <p>
                  Label Indonesia, English, atau 中文.
                  <br />
                  Boleh dari kamera atau foto yang sudah ada.
                </p>
              </div>
            )}
            {camera === "starting" && (
              <p role="status" className="scan-camera-message">
                Membuka kamera…
              </p>
            )}
          </div>
          <p className="label-intro">
            Dekatkan sampai tulisannya jelas. Hindari pantulan cahaya.
          </p>
          <button
            className="text-button scan-browser-camera"
            disabled={camera === "starting"}
            onClick={() => void startCamera()}
          >
            {camera === "ready"
              ? "Ganti / mulai ulang kamera"
              : "Gunakan kamera browser"}
          </button>
        </>
      )}
      {error && (
        <p className="scan-error" role="alert">
          {error}
        </p>
      )}
      {busy && elapsed >= 12 && (
        <p className="quiet">
          Foto tetap tersedia. Pembacaan pertama perlu mengunduh pembaca teks;
          kamu bisa membatalkan kapan saja.
        </p>
      )}
      <p className="label-privacy">
        Foto diproses di perangkatmu. Hasil bisa dikoreksi sebelum disimpan.
      </p>
    </FriendlySheet>
  );
}
