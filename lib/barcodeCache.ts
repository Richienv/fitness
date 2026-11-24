"use client";
// Fast on-device cache of confirmed/found barcode products so repeat scans
// open instantaneously (even offline) without re-running OCR or HTTP requests.
import type { BarcodeProduct } from "./barcode";
import { scopedKey } from "./userScope";

const KEY = "richie.barcodes.v1";
const MAX_ITEMS = 250;

type StoredBarcode = BarcodeProduct & { cachedAt: number };

function readAll(): Record<string, StoredBarcode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, StoredBarcode>): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(map);
    if (entries.length > MAX_ITEMS) {
      entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
      map = Object.fromEntries(entries.slice(0, MAX_ITEMS));
    }
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(map));
  } catch {
    // Ignore storage quota errors — server DB cache remains authoritative.
  }
}

export function getCachedBarcode(code: string): BarcodeProduct | null {
  const hit = readAll()[code];
  if (!hit) return null;
  const { cachedAt: _at, ...product } = hit;
  void _at;
  return product;
}

export function saveCachedBarcode(product: BarcodeProduct): void {
  const all = readAll();
  all[product.code] = { ...product, cachedAt: Date.now() };
  writeAll(all);
}

/** Persist a user-confirmed barcode product both locally and in the shared DB cache. */
export async function persistConfirmedBarcode(
  product: BarcodeProduct,
): Promise<void> {
  saveCachedBarcode({ ...product, source: "user_confirmed" });
  if (typeof window === "undefined") return;
  try {
    await fetch(`/api/foods/barcode/${encodeURIComponent(product.code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
      keepalive: true,
    });
  } catch {
    // Local cache already saved; server sync will succeed when back online.
  }
}

/** Fire-and-forget audit telemetry for tracking barcode hit rate and OCR reliability. */
export function recordScanAudit(event: {
  source: "barcode_cache" | "openfoodfacts" | "ocr_rules" | "ocr_llm" | "manual";
  barcode?: string;
  ocrConfidence?: number;
  coreFields?: number;
  usedLlm?: boolean;
  editedByUser?: boolean;
  elapsedMs?: number;
  method?: string;
}): void {
  if (typeof window === "undefined") return;
  fetch("/api/foods/scan-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {});
}
