"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { validBarcode, type BarcodeProduct } from "@/lib/barcode";
import type { RecipeFood } from "@/lib/recipes";
import FriendlySheet from "./FriendlySheet";
import ManualFoodSheet from "./ManualFoodSheet";
import NutritionSummary from "./NutritionSummary";
import Icon from "../ui/Icon";
type CameraControls = { stop: () => void };
export default function BarcodePanel({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (food: RecipeFood) => void;
}) {
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [cameraState, setCameraState] = useState<
    "starting" | "scanning" | "stopped"
  >("starting");
  const [snapshot, setSnapshot] = useState("");
  const [scanHint, setScanHint] = useState("");
  const scanning = cameraState !== "stopped";
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<CameraControls | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const scanFound = useRef(false);
  const cache = useRef(new Map<string, BarcodeProduct | null>());
  const abort = useRef<AbortController | null>(null);
  const active = useRef(false);
  const wantsCamera = useRef(true);
  const stopCamera = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
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
    async (raw: string) => {
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
      if (!navigator.onLine) {
        setError(
          "Koneksi terputus. Sambungkan internet atau tambah makanan manual.",
        );
        return;
      }
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      try {
        let found: BarcodeProduct | null;
        if (cache.current.has(next)) found = cache.current.get(next)!;
        else {
          const res = await fetch(`/api/foods/barcode/${next}`, {
            signal: controller.signal,
          });
          const data = await res.json();
          if (res.status === 404) {
            found = null;
          } else if (!res.ok) {
            throw new Error(
              data.error || "Database produk belum bisa dihubungi. Coba lagi.",
            );
          } else found = data.product;
          cache.current.set(next, found);
        }
        if (!controller.signal.aborted && active.current) {
          setProduct(found);
          setAmount(found?.basis === "serving" ? "1" : "100");
          if (!found)
            setError(
              "Produk belum ditemukan. Tambahkan informasi dari label kemasan secara manual.",
            );
        }
      } catch (e) {
        if (!controller.signal.aborted && active.current)
          setError(
            !navigator.onLine
              ? "Koneksi terputus. Sambungkan internet atau tambah makanan manual."
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
    const run = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Kamera tidak tersedia di browser ini. Masukkan nomor barcode di bawah.",
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
      if (!video.current) throw new Error("Pratinjau kamera tidak tersedia.");
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
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 500,
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
              "Pemindaian terhenti. Coba kamera lagi atau ketik nomor barcode.",
            );
            return;
          }
          if (!result) return;
          const read = result.getText();
          if (!validBarcode(read)) return;
          scanFound.current = true;
          // Freeze this frame before the decoder releases the video stream.
          // This stays in memory; only the barcode number goes to the lookup API.
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
              // A preview failure must not discard a successfully decoded barcode.
            }
          }
          c.stop();
          void lookup(read);
        },
      );
      if (!active.current || run !== generation.current) {
        control.stop();
        return;
      }
      controls.current = control;
      setCameraState("scanning");
      timer.current = setTimeout(() => {
        if (active.current && run === generation.current)
          setScanHint(
            "Tambah cahaya dan pastikan seluruh barcode terlihat. Scan tetap berjalan.",
          );
      }, 15000);
    } catch (e) {
      if (!active.current || run !== generation.current) return;
      wantsCamera.current = false;
      stopCamera();
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera di pengaturan browser atau ketik barcode."
          : name === "NotFoundError"
            ? "Kamera tidak ditemukan. Ketik nomor barcode dari kemasan."
            : name === "NotReadableError"
              ? "Kamera sedang digunakan aplikasi lain. Tutup aplikasi itu atau ketik barcode."
              : e instanceof Error
                ? e.message
                : "Kamera belum bisa dibuka. Ketik nomor barcode di bawah.",
      );
    }
  }, [lookup, stopCamera]);
  useEffect(() => {
    active.current = true;
    if (!manual && wantsCamera.current && !document.hidden) void startCamera();
    const visibility = () => {
      if (document.hidden) stopCamera();
      else if (!manual && wantsCamera.current) void startCamera();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      stopCamera();
      abort.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [manual, startCamera, stopCamera]);
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
  if (manual)
    return (
      <ManualFoodSheet
        onClose={() => setManual(false)}
        onAdd={onAdd}
        initial={
          product
            ? {
                name: product.name,
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
      title="Scan barcode"
      onClose={() => {
        pauseCamera();
        onClose();
      }}
    >
      <p className="quiet">
        Arahkan kamera ke barcode. Produk dicari otomatis begitu terbaca.
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
          ? `Barcode ${code} terbaca. Mencari produk…`
          : cameraState === "starting"
            ? "Izinkan kamera jika browser meminta izin."
            : cameraState === "scanning"
              ? scanHint || "Scan aktif. Tidak perlu menekan tombol."
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
          {error}
        </div>
      )}
      {product && (
        <section className="barcode-product">
          <h3>{product.name}</h3>
          {product.brand && <p>{product.brand}</p>}
          <p className="quiet">
            Sumber:{" "}
            <a
              href={`https://world.openfoodfacts.org/product/${product.code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Food Facts
            </a>
          </p>
          <p className="quiet">
            {product.serving ? `Sajian pada kemasan: ${product.serving}. ` : ""}
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
            <p className="status-message">
              Data nutrisi belum lengkap. Lengkapi dari label kemasan sebelum
              mencatat.
            </p>
          )}
          <button
            className="primary-button"
            disabled={!valid}
            onClick={() => {
              if (!valid || !product) return;
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
                ...(product.basis === "g" ? { gramsPerUnit: quantity } : {}),
                ...(product.sugar === null
                  ? {}
                  : { sugar: product.sugar * multiplier }),
              });
            }}
          >
            Tambahkan ke pilihan makan
          </button>
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
        Tambah makanan manual
      </button>
    </FriendlySheet>
  );
}
