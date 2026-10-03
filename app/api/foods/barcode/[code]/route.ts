import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import {
  parseBarcodeProduct,
  validBarcode,
  type BarcodeProduct,
} from "@/lib/barcode";
// Public product data only. Bound memory and deduplicate scans across users on this instance.
const cache = new Map<string, { at: number; product: BarcodeProduct | null }>();
const pending = new Map<string, Promise<BarcodeProduct | null>>();
let requests: number[] = [];
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
    const saved = refresh ? undefined : cache.get(code);
    let product: BarcodeProduct | null;
    if (saved && now - saved.at < (saved.product ? 86400000 : 300000))
      product = saved.product;
    else {
      let lookup = pending.get(code);
      if (!lookup) {
        requests = requests.filter((t) => now - t < 60000);
        if (requests.length >= 15)
          return NextResponse.json(
            {
              error:
                "Pencarian produk sedang ramai. Coba lagi dalam satu menit atau tambah manual.",
            },
            { status: 429, headers: { "Retry-After": "60" } },
          );
        requests.push(now);
        lookup = (async () => {
          const response = await fetch(
            `https://world.openfoodfacts.org/api/v3/product/${code}.json?fields=code,product_name,product_name_id,product_name_en,product_name_zh,product_name_zh_cn,product_name_zh_tw,generic_name,generic_name_id,generic_name_en,generic_name_zh,abbreviated_product_name,brands,quantity,product_quantity_unit,nutrition_data_per,serving_size,nutriments`,
            {
              headers: {
                "User-Agent": "R2Fit/1.0 (https://github.com/Richienv/fitness)",
              },
              ...(refresh
                ? { cache: "no-store" as const }
                : { next: { revalidate: 86400 } }),
              signal: AbortSignal.timeout(12000),
            },
          );
          if (response.status === 404) return null;
          if (!response.ok) throw new Error("Product lookup unavailable");
          return parseBarcodeProduct(await response.json(), code);
        })().finally(() => pending.delete(code));
        pending.set(code, lookup);
      }
      product = await lookup;
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(code, { at: now, product });
    }
    return product
      ? NextResponse.json({ product })
      : NextResponse.json(
          {
            error:
              "Barcode terbaca, tetapi produk ini belum ada di Open Food Facts.",
          },
          { status: 404 },
        );
  } catch {
    return NextResponse.json(
      {
        error:
          "Database produk belum bisa dihubungi. Coba lagi atau tambah makanan manual.",
      },
      { status: 502 },
    );
  }
}
