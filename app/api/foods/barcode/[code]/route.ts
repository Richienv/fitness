import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import {
  parseBarcodeProduct,
  parseServingMass,
  validBarcode,
  type BarcodeProduct,
} from "@/lib/barcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredBarcodeMeta = {
  v: 1;
  code: string;
  brand: string;
  serving: string;
  servingSizeG: number | null;
  basis: "g" | "ml" | "serving";
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
  sodium: number | null;
  salt: number | null;
  saturatedFat: number | null;
  fiber: number | null;
  source: "openfoodfacts" | "user_confirmed";
  updatedAt: string;
};

// Public product data only. Bound memory and deduplicate scans across users on this instance.
const cache = new Map<string, { at: number; product: BarcodeProduct | null }>();
const pending = new Map<string, Promise<BarcodeProduct | null>>();
let requests: number[] = [];

const dec = (n: number | null | undefined): Prisma.Decimal | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? new Prisma.Decimal(n) : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function productFromDbRow(row: {
  name: string;
  note: string | null;
  energy_kcal: Prisma.Decimal | null;
  protein_g: Prisma.Decimal | null;
  carb_g: Prisma.Decimal | null;
  fat_g: Prisma.Decimal | null;
  sugar_g: Prisma.Decimal | null;
  sodium_mg: Prisma.Decimal | null;
  fiber_g: Prisma.Decimal | null;
  portionGCooked: Prisma.Decimal | null;
}, code: string): BarcodeProduct | null {
  if (row.note) {
    try {
      const meta = JSON.parse(row.note) as Partial<StoredBarcodeMeta>;
      if (meta && meta.v === 1 && meta.code === code) {
        return {
          code,
          name: row.name,
          brand: typeof meta.brand === "string" ? meta.brand : "",
          serving: typeof meta.serving === "string" ? meta.serving : "",
          servingSizeG: num(meta.servingSizeG),
          basis:
            meta.basis === "ml" || meta.basis === "serving" ? meta.basis : "g",
          kcal: num(meta.kcal),
          protein: num(meta.protein),
          carbs: num(meta.carbs),
          fat: num(meta.fat),
          sugar: num(meta.sugar),
          sodium: num(meta.sodium),
          salt: num(meta.salt),
          saturatedFat: num(meta.saturatedFat),
          fiber: num(meta.fiber),
          source: meta.source === "user_confirmed" ? "user_confirmed" : "cache",
        };
      }
    } catch {
      // Fall back to column values below.
    }
  }
  return {
    code,
    name: row.name,
    brand: "",
    serving: row.portionGCooked ? `${Number(row.portionGCooked)} g` : "",
    servingSizeG: row.portionGCooked ? Number(row.portionGCooked) : null,
    basis: "g",
    kcal: row.energy_kcal ? Number(row.energy_kcal) : null,
    protein: row.protein_g ? Number(row.protein_g) : null,
    carbs: row.carb_g ? Number(row.carb_g) : null,
    fat: row.fat_g ? Number(row.fat_g) : null,
    sugar: row.sugar_g ? Number(row.sugar_g) : null,
    sodium: row.sodium_mg ? Number(row.sodium_mg) : null,
    fiber: row.fiber_g ? Number(row.fiber_g) : null,
    source: "cache",
  };
}

/** Save a barcode product into the shared Food catalogue (keyed by BARCODE:<code>).
 *  Uses existing columns only — zero schema migrations required. */
async function upsertBarcodeInDb(
  product: BarcodeProduct,
  source: "openfoodfacts" | "user_confirmed",
): Promise<void> {
  const sourceCode = `BARCODE:${product.code}`;
  const cleanName = product.name.trim() || `Produk ${product.code}`;
  const nameNormalized = normalizeName(cleanName);
  const servingMass =
    product.servingSizeG ?? parseServingMass(product.serving) ?? null;

  // Compute per-100g equivalent for the Food catalogue columns when possible.
  const scaleTo100 =
    product.basis === "g" || product.basis === "ml"
      ? 1
      : servingMass && servingMass > 0
        ? 100 / servingMass
        : null;
  const to100 = (v: number | null | undefined) =>
    scaleTo100 !== null && typeof v === "number" && Number.isFinite(v)
      ? v * scaleTo100
      : null;

  const meta: StoredBarcodeMeta = {
    v: 1,
    code: product.code,
    brand: product.brand ?? "",
    serving: product.serving ?? "",
    servingSizeG: servingMass,
    basis: product.basis,
    kcal: product.kcal,
    protein: product.protein,
    carbs: product.carbs,
    fat: product.fat,
    sugar: product.sugar ?? null,
    sodium: product.sodium ?? null,
    salt: product.salt ?? null,
    saturatedFat: product.saturatedFat ?? null,
    fiber: product.fiber ?? null,
    source,
    updatedAt: new Date().toISOString(),
  };

  const searchText = [nameNormalized, normalizeName(product.brand ?? ""), product.code]
    .filter(Boolean)
    .join(" ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const data = {
    source: "CUSTOM" as const,
    name: cleanName,
    nameNormalized: nameNormalized || product.code,
    state: "Kemasan",
    foodGroup: "Kemasan/Barcode",
    nameEn: null,
    note: JSON.stringify(meta),
    searchText,
    popularity: source === "user_confirmed" ? 8 : 5,
    energy_kcal: dec(to100(product.kcal)),
    protein_g: dec(to100(product.protein)),
    carb_g: dec(to100(product.carbs)),
    fat_g: dec(to100(product.fat)),
    sugar_g: dec(to100(product.sugar)),
    sodium_mg: dec(to100(product.sodium)),
    fiber_g: dec(to100(product.fiber)),
    portionGCooked: dec(servingMass),
  };

  await db.food.upsert({
    where: { sourceCode },
    create: { sourceCode, ...data },
    update: data,
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!(await getUserId()))
    return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });
  const { code } = await params;
  if (!validBarcode(code))
    return NextResponse.json(
      { error: "Masukkan 8–14 digit barcode." },
      { status: 400 },
    );
  try {
    const now = Date.now();
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";

    // 1. In-memory hot cache
    const saved = refresh ? undefined : cache.get(code);
    if (saved && now - saved.at < (saved.product ? 86400000 : 300000)) {
      return saved.product
        ? NextResponse.json({ product: saved.product })
        : NextResponse.json(
            {
              error:
                "Barcode terbaca, tetapi produk ini belum ada di database produk.",
            },
            { status: 404 },
          );
    }

    // 2. Durable PostgreSQL cache (user-confirmed local snacks + previously fetched OFF hits)
    let dbProduct: BarcodeProduct | null = null;
    try {
      const row = await db.food.findUnique({
        where: { sourceCode: `BARCODE:${code}` },
        select: {
          name: true,
          note: true,
          energy_kcal: true,
          protein_g: true,
          carb_g: true,
          fat_g: true,
          sugar_g: true,
          sodium_mg: true,
          fiber_g: true,
          portionGCooked: true,
        },
      });
      if (row) dbProduct = productFromDbRow(row, code);
    } catch {
      // If DB is temporarily unavailable, continue seamlessly to Open Food Facts.
    }

    // User-confirmed local records always win; cached OFF records win unless refresh=1.
    if (
      dbProduct &&
      (dbProduct.source === "user_confirmed" || !refresh) &&
      dbProduct.kcal !== null
    ) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(code, { at: now, product: dbProduct });
      return NextResponse.json({ product: dbProduct });
    }

    // 3. Open Food Facts v3 public lookup (with deduplication + soft rate limit)
    let lookup = pending.get(code);
    if (!lookup) {
      requests = requests.filter((t) => now - t < 60000);
      if (requests.length >= 20)
        return NextResponse.json(
          {
            error:
              "Pencarian produk sedang ramai. Coba lagi dalam satu menit atau scan label nutrisi.",
          },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      requests.push(now);
      lookup = (async () => {
        const response = await fetch(
          `https://world.openfoodfacts.org/api/v3/product/${code}.json?fields=code,product_name,product_name_id,product_name_en,product_name_zh,product_name_zh_cn,product_name_zh_tw,generic_name,generic_name_id,generic_name_en,generic_name_zh,abbreviated_product_name,brands,quantity,product_quantity_unit,nutrition_data_per,serving_size,serving_quantity,nutriments`,
          {
            headers: {
              "User-Agent": "R2Fit/1.1 (https://github.com/Richienv/fitness)",
            },
            ...(refresh
              ? { cache: "no-store" as const }
              : { next: { revalidate: 86400 } }),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (response.status === 404) return dbProduct;
        if (!response.ok) throw new Error("Product lookup unavailable");
        const parsed = parseBarcodeProduct(await response.json(), code);
        if (parsed && parsed.kcal !== null && !parsed.nameMissing) {
          // Warm the durable Postgres cache for future cold starts (don't overwrite user_confirmed).
          if (dbProduct?.source !== "user_confirmed") {
            void upsertBarcodeInDb(parsed, "openfoodfacts").catch(() => {});
          }
        }
        return parsed ?? dbProduct;
      })().finally(() => pending.delete(code));
      pending.set(code, lookup);
    }

    const product = await lookup;
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(code, { at: now, product });

    return product
      ? NextResponse.json({ product })
      : NextResponse.json(
          {
            error:
              "Barcode terbaca, tetapi produk ini belum ada di Open Food Facts. Scan label nutrisinya agar tersimpan otomatis.",
          },
          { status: 404 },
        );
  } catch {
    return NextResponse.json(
      {
        error:
          "Database produk belum bisa dihubungi. Coba lagi atau scan label nutrisi.",
      },
      { status: 502 },
    );
  }
}

/** Save a user-confirmed product (e.g. from label OCR or manual correction) to the
 *  shared barcode cache so future scans of this barcode resolve immediately. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });
  const { code } = await params;
  if (!validBarcode(code))
    return NextResponse.json(
      { error: "Format barcode tidak valid." },
      { status: 400 },
    );

  try {
    const body = (await req.json().catch(() => null)) as Partial<BarcodeProduct> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Data produk tidak valid." }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const kcal = num(body.kcal);
    const protein = num(body.protein);
    const carbs = num(body.carbs);
    const fat = num(body.fat);
    if (!name || kcal === null || protein === null || carbs === null || fat === null) {
      return NextResponse.json(
        { error: "Nama dan 4 nutrisi utama wajib diisi." },
        { status: 400 },
      );
    }
    const basis: BarcodeProduct["basis"] =
      body.basis === "ml" || body.basis === "serving" ? body.basis : "g";
    const product: BarcodeProduct = {
      code,
      name: name.slice(0, 120),
      brand: typeof body.brand === "string" ? body.brand.trim().slice(0, 80) : "",
      serving: typeof body.serving === "string" ? body.serving.trim().slice(0, 60) : "",
      servingSizeG: num(body.servingSizeG),
      basis,
      kcal,
      protein,
      carbs,
      fat,
      sugar: num(body.sugar),
      sodium: num(body.sodium),
      salt: num(body.salt),
      saturatedFat: num(body.saturatedFat),
      fiber: num(body.fiber),
      source: "user_confirmed",
    };

    await upsertBarcodeInDb(product, "user_confirmed");
    cache.set(code, { at: Date.now(), product });

    await logActivity({
      actor: userId,
      action: "barcode-cache-save",
      entityId: code,
      entityType: "BarcodeProduct",
      payload: { name: product.name, basis: product.basis },
    }).catch(() => {});

    return NextResponse.json({ ok: true, product });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Gagal menyimpan cache barcode.",
        detail: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
