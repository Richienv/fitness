"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBarcodeStabilizer,
  validBarcode,
  type BarcodeProduct,
} from "@/lib/barcode";
import {
  getCachedBarcode,
  recordScanAudit,
  saveCachedBarcode,
} from "@/lib/barcodeCache";
import type { RecipeFood } from "@/lib/recipes";
import FriendlySheet from "./FriendlySheet";
import ManualFoodSheet from "./ManualFoodSheet";
import NutritionSummary from "./NutritionSummary";
import Icon from "../ui/Icon";
import dynamic from "next/dynamic";

const NutritionLabelPanel = dynamic(() => import("./NutritionLabelPanel"), {
  ssr: false,
});

type CameraControls = { stop: () => void };

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
};

function createNativeDetector(): NativeBarcodeDetector | null {
  if (typeof window === "undefined") return null;
  const Ctor = (
    window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => NativeBarcodeDetector;
    }
  ).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"],
    });
  } catch {
    return null;
  }
}

export default function BarcodePanel({
  onClose,
  onAdd,
  startInLabel = false,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
  startInLabel?: boolean;
}) {
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [labelScan, setLabelScan] = useState(startInLabel);
  const [cameraState, setCameraState] = useState<
    "starting" | "scanning" | "stopped"
  >(startInLabel ? "stopped" : "starting");
  const [snapshot, setSnapshot] = useState("");
  const [scanHint, setScanHint] = useState("");
  const scanning = cameraState !== "stopped";
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<CameraControls | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const scanFound = useRef(false);
  const stabilizer = useRef(createBarcodeStabilizer(2, 2500));
  const cache = useRef(new Map<string, BarcodeProduct | null>());
  const abort = useRef<AbortController | null>(null);
  const active = useRef(false);
  const wantsCamera = useRef(!startInLabel);

  const stopCamera = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    if (raf.current) clearTimeout(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (video.current) video.current.srcObject = null;
    if (active.current) setCameraState("stopped");
  }, []);

  function pauseCamera() {
    wantsCamera.current = false;
    stopCamera();
  }

  const lookup = useCallback(
    async (raw: string, refresh = false) => {
      wantsCamera.current = false;
      const next = raw.replace(/\s/g, "");
      stopCamera();
      abort.current?.abort();
      setLoading(false);
      setCode(next);
      setError("");
      setProduct(null);
      if (!validBarcode(next)) {
        setError("Masukkan 8–14 angka barcode yang tercetak pada kemasan.");
        return;
      }

      // 1. Instant localStorage cache check (works even offline!)
      if (!refresh) {
        const localHit = getCachedBarcode(next);
        if (localHit) {
          cache.current.set(next, localHit);
          setProduct(localHit);
          setAmount(localHit.basis === "serving" ? "1" : "100");
          recordScanAudit({
            source: "barcode_cache",
            barcode: next,
            coreFields: [
              localHit.kcal,
              localHit.protein,
              localHit.carbs,
              localHit.fat,
            ].filter((v) => v !== null).length,
          });
          return;
        }
      }

      if (!navigator.onLine) {
        setError(
          "Koneksi terputus dan produk belum ada di cache perangkat. Scan label nutrisi atau isi manual.",
        );
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      const started = performance.now();
      try {
        let found: BarcodeProduct | null;
        if (!refresh && cache.current.has(next))
          found = cache.current.get(next)!;
        else {
          const res = await fetch(
            `/api/foods/barcode/${next}${refresh ? "?refresh=1" : ""}`,
            {
              signal: controller.signal,
            },
          );
          const data = await res.json();
          if (res.status === 404) {
            found = null;
          } else if (!res.ok) {
            throw new Error(
              data.error || "Database produk belum bisa dihubungi. Coba lagi.",
            );
          } else found = data.product;
          if (found) {
            cache.current.set(next, found);
            if (found.kcal !== null) saveCachedBarcode(found);
          } else cache.current.delete(next);
        }
        if (!controller.signal.aborted && active.current) {
          setProduct(found);
          setAmount(found?.basis === "serving" ? "1" : "100");
          if (found) {
            recordScanAudit({
              source:
                found.source === "openfoodfacts"
                  ? "openfoodfacts"
                  : "barcode_cache",
              barcode: next,
              coreFields: [
                found.kcal,
                found.protein,
                found.carbs,
                found.fat,
              ].filter((v) => v !== null).length,
              elapsedMs: performance.now() - started,
            });
          } else {
            setError(
              "Barcode terbaca, tetapi produk ini belum ada di database. Scan label nutrisinya agar tersimpan otomatis untuk scan berikutnya.",
            );
          }
        }
      } catch (e) {
        if (!controller.signal.aborted && active.current)
          setError(
            !navigator.onLine
              ? "Koneksi terputus. Scan label nutrisi atau tambah makanan manual."
              : e instanceof Error
                ? e.message
                : "Database produk belum bisa dihubungi. Coba lagi.",
          );
      } finally {
        if (abort.current === controller && active.current) setLoading(false);
      }
    },
    [stopCamera],
  );

  const captureVideoSnapshot = useCallback(() => {
    const preview = video.current;
    if (preview?.videoWidth && preview.videoHeight) {
      try {
        const frame = document.createElement("canvas");
        frame.width = Math.min(preview.videoWidth, 640);
        frame.height = Math.round(
          preview.videoHeight * (frame.width / preview.videoWidth),
        );
        const context = frame.getContext("2d");
        if (context) {
          context.drawImage(preview, 0, 0, frame.width, frame.height);
          setSnapshot(frame.toDataURL("image/jpeg", 0.8));
        }
      } catch {
        // Never discard a decoded barcode on snapshot failure.
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    wantsCamera.current = true;
    stopCamera();
    abort.current?.abort();
    setLoading(false);
    setError("");
    setProduct(null);
    setCode("");
    setSnapshot("");
    setScanHint("");
    setCameraState("starting");
    scanFound.current = false;
    stabilizer.current.reset();
    const run = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Kamera tidak tersedia di browser ini. Ketik barcode atau beralih ke tab Label nutrisi.",
        );
      const camera = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!active.current || run !== generation.current) {
        camera.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = camera;
      if (!video.current) throw new Error("Pratinjau kamera tidak tersedia.");

      const onDecodedCandidate = (rawCode: string, stopFn: () => void) => {
        if (!active.current || scanFound.current || run !== generation.current)
          return;
        // Require 2 consecutive identical frames before triggering lookup.
        const locked = stabilizer.current.push(rawCode);
        if (!locked) {
          setScanHint(`Memastikan barcode ${rawCode}… tahan sebentar.`);
          return;
        }
        scanFound.current = true;
        captureVideoSnapshot();
        stopFn();
        void lookup(locked);
      };

      // Prefer hardware-accelerated native BarcodeDetector when available (~6-8 fps),
      // falling back to @zxing/browser everywhere else.
      const nativeDetector = createNativeDetector();
      if (nativeDetector) {
        video.current.srcObject = camera;
        await video.current.play();
        if (!active.current || run !== generation.current) return;
        setCameraState("scanning");
        const poll = async () => {
          if (!active.current || scanFound.current || run !== generation.current)
            return;
          const v = video.current;
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            try {
              const found = await nativeDetector.detect(v);
              const hit = found.find(
                (f) => f.rawValue && validBarcode(f.rawValue.replace(/\s/g, "")),
              );
              if (hit?.rawValue) {
                onDecodedCandidate(hit.rawValue, () => {
                  if (raf.current) clearTimeout(raf.current);
                  raf.current = null;
                });
                if (scanFound.current) return;
              }
            } catch {
              // Ignore single-frame detection errors.
            }
          }
          raf.current = setTimeout(() => void poll(), 140);
        };
        raf.current = setTimeout(() => void poll(), 140);
      } else {
        const [
          { BrowserMultiFormatOneDReader },
          {
            DecodeHintType,
            BarcodeFormat,
            NotFoundException,
            ChecksumException,
            FormatException,
          },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (!active.current || run !== generation.current) {
          camera.getTracks().forEach((t) => t.stop());
          return;
        }
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
        ]);
        const reader = new BrowserMultiFormatOneDReader(hints, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 300,
        });
        const control = await reader.decodeFromStream(
          camera,
          video.current,
          (result, err, c) => {
            if (
              !active.current ||
              scanFound.current ||
              run !== generation.current
            )
              return;
            if (
              err &&
              !(err instanceof NotFoundException) &&
              !(err instanceof ChecksumException) &&
              !(err instanceof FormatException)
            ) {
              wantsCamera.current = false;
              c.stop();
              stopCamera();
              setError(
                "Pemindaian terhenti. Coba kamera lagi atau beralih ke Label nutrisi.",
              );
              return;
            }
            if (!result) return;
            onDecodedCandidate(result.getText(), () => c.stop());
          },
        );
        if (!active.current || run !== generation.current) {
          control.stop();
          return;
        }
        controls.current = control;
        setCameraState("scanning");
      }

      timer.current = setTimeout(() => {
        if (active.current && run === generation.current)
          setScanHint(
            "Tambah cahaya dan pastikan seluruh barcode terlihat, atau ketuk tab Label nutrisi.",
          );
      }, 12000);
    } catch (e) {
      if (!active.current || run !== generation.current) return;
      wantsCamera.current = false;
      stopCamera();
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera di browser, ketik barcode, atau beralih ke tab Label nutrisi."
          : name === "NotFoundError"
            ? "Kamera tidak ditemukan. Ketik barcode atau foto label nutrisi."
            : name === "NotReadableError"
              ? "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu atau ketik barcode."
              : e instanceof Error
                ? e.message
                : "Kamera belum bisa dibuka. Ketik nomor barcode atau foto label nutrisi.",
      );
    }
  }, [lookup, stopCamera, captureVideoSnapshot]);

  useEffect(() => {
    active.current = true;
    if (!manual && !labelScan && wantsCamera.current && !document.hidden)
      void startCamera();
    const visibility = () => {
      if (document.hidden) stopCamera();
      else if (!manual && !labelScan && wantsCamera.current) void startCamera();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      stopCamera();
      abort.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [manual, labelScan, startCamera, stopCamera]);

  const basis =
    product?.basis === "serving"
      ? "per sajian"
      : `per 100 ${product?.basis ?? "g"}`;
  const quantity = Number(amount);
  const multiplier = product?.basis === "serving" ? quantity : quantity / 100;
  const nutrition = {
    kcal: product?.kcal == null ? null : product.kcal * multiplier,
    protein: product?.protein == null ? null : product.protein * multiplier,
    carbs: product?.carbs == null ? null : product.carbs * multiplier,
    fat: product?.fat == null ? null : product.fat * multiplier,
  };
  const complete = product && Object.values(nutrition).every((v) => v !== null);
  const valid = complete && quantity > 0 && Number.isFinite(quantity);

  function openLabelTab() {
    pauseCamera();
    abort.current?.abort();
    setLoading(false);
    setLabelScan(true);
  }

  if (labelScan)
    return (
      <NutritionLabelPanel
        onClose={() => onClose()}
        onAdd={onAdd}
        barcode={validBarcode(code) ? code : undefined}
        barcodeProduct={product}
        initial={
          product && !product.nameMissing
            ? { name: product.name, brand: product.brand }
            : undefined
        }
        onSwitchToBarcode={() => {
          setLabelScan(false);
          wantsCamera.current = true;
        }}
      />
    );

  if (manual)
    return (
      <ManualFoodSheet
        onClose={() => setManual(false)}
        onAdd={onAdd}
        barcode={validBarcode(code) ? code : undefined}
        barcodeProduct={product}
        scanSource="manual"
        initial={
          product
            ? {
                name: product.name,
                brand: product.brand,
                ...nutrition,
                unit:
                  product.basis === "serving"
                    ? `${quantity} sajian`
                    : `${quantity} ${product.basis}`,
              }
            : {}
        }
      />
    );

  return (
    <FriendlySheet
      title="Scan kemasan"
      className="nutrition-scan-sheet"
      onClose={() => {
        pauseCamera();
        onClose();
      }}
    >
      <div className="scan-mode-tabs" role="tablist" aria-label="Mode pindai">
        <button type="button" role="tab" aria-selected={true} className="is-active">
          Barcode (cepat)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          onClick={openLabelTab}
        >
          Label nutrisi
        </button>
      </div>
      <p className="quiet">
        Arahkan ke barcode dulu — lebih cepat &amp; akurat. Kalau belum terdaftar,
        tinggal lanjut scan tabel nutrisinya.
      </p>
      <div
        className={`barcode-camera${scanning ? " scanning" : ""}${snapshot ? " captured" : ""}`}
      >
        <video
          ref={video}
          muted
          playsInline
          aria-label="Pratinjau pemindaian barcode"
        />
        {snapshot && (
          <img src={snapshot} alt={`Barcode ${code} yang terbaca`} />
        )}
        {!scanning && !snapshot && <Icon name="barcode" size={48} />}
        {scanning && <div className="barcode-guide" aria-hidden="true" />}
        {cameraState === "starting" && (
          <span className="barcode-camera-label">Menyalakan kamera…</span>
        )}
        {snapshot && (
          <span className="barcode-camera-label">Barcode terbaca</span>
        )}
      </div>
      <p className="barcode-status" role="status" aria-live="polite">
        {loading
          ? `${snapshot ? `Barcode ${code} terbaca. ` : ""}Mencari informasi produk…`
          : cameraState === "starting"
            ? "Izinkan kamera jika browser meminta izin."
            : cameraState === "scanning"
              ? scanHint || "Scan barcode aktif (konfirmasi 2 frame otomatis)."
              : code
                ? `Barcode: ${code}`
                : "Kamera berhenti."}
      </p>
      {!scanning && (
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => void startCamera()}
        >
          {code ? "Scan barcode lain" : "Coba kamera lagi"}
        </button>
      )}
      {error && (
        <div className="status-message" role="status">
          <p>{error}</p>
          <div className="scan-fallback-actions">
            <button
              type="button"
              className="primary-button"
              onClick={openLabelTab}
            >
              {validBarcode(code)
                ? "Scan label nutrisi kemasan ini"
                : "Foto label nutrisi"}
            </button>
            {validBarcode(code) && (
              <button
                type="button"
                className="text-button"
                disabled={loading}
                onClick={() => void lookup(code, true)}
              >
                Cari ulang di Open Food Facts
              </button>
            )}
          </div>
        </div>
      )}
      {product && (
        <section className="barcode-product">
          <h3>{product.name}</h3>
          {product.nameMissing && (
            <p className="quiet">
              Nama produk belum tersedia di database. Nutrisi yang tersedia
              tetap ditampilkan.
            </p>
          )}
          {product.brand && <p>{product.brand}</p>}
          <p className="quiet">
            Sumber:{" "}
            {product.source === "user_confirmed" ? (
              <strong>Cache R2 Fit (terverifikasi)</strong>
            ) : (
              <a
                href={`https://world.openfoodfacts.org/product/${product.code}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Food Facts{product.source === "cache" ? " (cache)" : ""}
              </a>
            )}
          </p>
          <p className="quiet">
            {product.serving
              ? `Sajian pada kemasan: ${product.serving}. `
              : product.servingSizeG
                ? `Takaran saji: ${product.servingSizeG} g. `
                : ""}
            Acuan nutrisi {basis}.
          </p>
          <label className="field-label">
            Jumlah konsumsi (
            {product.basis === "serving" ? "sajian" : product.basis})
            <input
              type="number"
              min="0.1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <NutritionSummary
            values={nutrition}
            caption="Jumlah yang akan dicatat"
          />
          {!complete && (
            <div className="status-message">
              <p>
                Produk ditemukan, tetapi data nutrisi belum lengkap. Scan label
                nutrisi untuk melengkapi dan menyimpan ke cache.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={openLabelTab}
              >
                Scan label nutrisi untuk melengkapi
              </button>
            </div>
          )}
          {complete && (
            <>
              <button
                className="primary-button"
                disabled={!valid}
                onClick={() => {
                  if (!valid || !product) return;
                  const gramsPerUnit =
                    product.basis === "g"
                      ? quantity
                      : product.basis === "serving" && product.servingSizeG
                        ? quantity * product.servingSizeG
                        : undefined;
                  onAdd({
                    id: `barcode_${product.code}_${crypto.randomUUID()}`,
                    name: `${product.name}${product.brand ? ` · ${product.brand}` : ""}`,
                    unit:
                      product.basis === "serving"
                        ? `${quantity} sajian`
                        : `${quantity} ${product.basis}`,
                    kcal: nutrition.kcal!,
                    protein: nutrition.protein!,
                    carbs: nutrition.carbs!,
                    fat: nutrition.fat!,
                    ...(gramsPerUnit ? { gramsPerUnit } : {}),
                    ...(product.sugar == null
                      ? {}
                      : { sugar: product.sugar * multiplier }),
                    ...(product.sodium == null
                      ? {}
                      : { sodium: product.sodium * multiplier }),
                    ...(product.salt == null
                      ? {}
                      : { salt: product.salt * multiplier }),
                    ...(product.saturatedFat == null
                      ? {}
                      : { saturatedFat: product.saturatedFat * multiplier }),
                    ...(product.fiber == null
                      ? {}
                      : { fiber: product.fiber * multiplier }),
                  });
                }}
              >
                Tambahkan ke pilihan makan
              </button>
              <button
                type="button"
                className="text-button"
                onClick={openLabelTab}
              >
                Angka beda dengan kemasan? Scan label untuk perbaiki
              </button>
            </>
          )}
        </section>
      )}
      <details
        className="barcode-manual"
        onToggle={(e) => {
          if (e.currentTarget.open) pauseCamera();
        }}
      >
        <summary>Ketik nomor barcode</summary>
        <form
          className="friendly-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSnapshot("");
            void lookup(code);
          }}
        >
          <label>
            Nomor barcode
            <input
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(e) => {
                pauseCamera();
                abort.current?.abort();
                setLoading(false);
                setError("");
                setSnapshot("");
                setCode(e.target.value.replace(/[^0-9]/g, ""));
                setProduct(null);
              }}
              placeholder="Ketik angka dari kemasan"
              maxLength={14}
            />
          </label>
          <button className="primary-button" disabled={loading || !code}>
            {loading ? "Mencari produk…" : "Cari produk"}
          </button>
        </form>
      </details>
      <button
        className="text-button"
        onClick={() => {
          pauseCamera();
          abort.current?.abort();
          setLoading(false);
          setManual(true);
        }}
      >
        {code ? "Isi nutrisi manual" : "Tambah makanan manual"}
      </button>
    </FriendlySheet>
  );
}
