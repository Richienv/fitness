export const IMAGE_METHODS = {
  original: "Asli",
  contrast: "Kontras warna",
  clahe: "Kontras lokal (CLAHE)",
  grayscale: "Abu-abu + kontras",
  clean: "Kurangi noise + tajamkan",
  threshold: "Hitam-putih adaptif",
} as const;
export type ImageMethod = keyof typeof IMAGE_METHODS;
export type ImagePreset = "auto" | ImageMethod;
export type PixelImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
export type ImageStats = {
  low: number;
  high: number;
  mean: number;
  edge: number;
};
export type ImageQuality = {
  ok: boolean;
  blurScore: number;
  isBlurry: boolean;
  glareRatio: number;
  hasGlare: boolean;
  shadowRatio: number;
  isTooDark: boolean;
  isLowContrast: boolean;
  warnings: string[];
};
export type FilterOptions = {
  contrast?: number;
  brightness?: number;
  sharpen?: number;
  clipLimit?: number;
};

function validate(image: PixelImage) {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.data.length !== image.width * image.height * 4
  )
    throw new Error("Ukuran gambar tidak valid.");
}
function luminance(image: PixelImage) {
  validate(image);
  const gray = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4,
      alpha = image.data[p + 3] / 255;
    // Composite transparent uploads onto white rather than inventing black text.
    gray[i] =
      (image.data[p] * 0.299 +
        image.data[p + 1] * 0.587 +
        image.data[p + 2] * 0.114) *
        alpha +
      255 * (1 - alpha);
  }
  return gray;
}
export function imageStatistics(image: PixelImage): ImageStats {
  const gray = luminance(image),
    hist = new Uint32Array(256);
  let sum = 0,
    edge = 0,
    pairs = 0;
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]]++;
    sum += gray[i];
    if (i % image.width) {
      edge += Math.abs(gray[i] - gray[i - 1]);
      pairs++;
    }
  }
  const percentile = (fraction: number) => {
    let total = 0;
    for (let i = 0; i < 256; i++) {
      total += hist[i];
      if (total >= gray.length * fraction) return i;
    }
    return 255;
  };
  return {
    low: percentile(0.02),
    high: percentile(0.98),
    mean: sum / gray.length,
    edge: pairs ? edge / pairs : 0,
  };
}

/** Fast blur, glare, exposure and contrast diagnostic run before OCR. */
export function assessImageQuality(image: PixelImage): ImageQuality {
  const gray = luminance(image);
  const { width, height } = image;
  const stats = imageStatistics(image);
  let glarePixels = 0;
  let shadowPixels = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] >= 245) glarePixels++;
    if (gray[i] <= 35) shadowPixels++;
  }
  const glareRatio = glarePixels / gray.length;
  const shadowRatio = shadowPixels / gray.length;

  // Laplacian variance on a bounded stride for fast, resolution-stable sharpness scoring.
  const step = Math.max(1, Math.floor(Math.max(width, height) / 320));
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = y * width + x;
      const lap =
        gray[i - step * width] +
        gray[i + step * width] +
        gray[i - step] +
        gray[i + step] -
        4 * gray[i];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const blurScore = lapCount ? lapSqSum / lapCount - lapMean * lapMean : 0;

  const contrastSpan = stats.high - stats.low;
  const isBlurry = lapCount >= 16 && blurScore < 45;
  const hasGlare = glareRatio > 0.35 && stats.mean > 190;
  const isTooDark = stats.mean < 65 || shadowRatio > 0.55;
  const isLowContrast = contrastSpan < 75;

  const warnings: string[] = [];
  if (isBlurry)
    warnings.push("Foto terlihat buram — tahan stabil dan dekatkan ke tabel nutrisi.");
  if (hasGlare)
    warnings.push("Ada pantulan cahaya terang — miringkan kemasan sedikit agar tidak silau.");
  if (isTooDark)
    warnings.push("Foto terlalu gelap — tambah cahaya agar angka terbaca jelas.");
  if (isLowContrast && !isTooDark && !hasGlare)
    warnings.push("Kontras tulisan rendah — crop lebih dekat ke tabel nutrisi.");

  return {
    ok: warnings.length === 0,
    blurScore: Math.round(blurScore),
    isBlurry,
    glareRatio: Math.round(glareRatio * 1000) / 1000,
    hasGlare,
    shadowRatio: Math.round(shadowRatio * 1000) / 1000,
    isTooDark,
    isLowContrast,
    warnings,
  };
}

/** Tile-based Contrast-Limited Adaptive Histogram Equalization (CLAHE) on 8-bit grayscale.
 *  Dramatically improves glossy/curved packaging where shadows and reflections coexist. */
function applyClahe(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimitFactor = 2.4,
): Uint8ClampedArray {
  const tilesX = Math.max(2, Math.min(8, Math.round(width / 120)));
  const tilesY = Math.max(2, Math.min(8, Math.round(height / 120)));
  const tileW = width / tilesX;
  const tileH = height / tilesY;
  const cdfs: Uint8ClampedArray[] = new Array(tilesX * tilesY);

  for (let ty = 0; ty < tilesY; ty++) {
    const y0 = Math.floor(ty * tileH);
    const y1 = ty === tilesY - 1 ? height : Math.floor((ty + 1) * tileH);
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.floor(tx * tileW);
      const x1 = tx === tilesX - 1 ? width : Math.floor((tx + 1) * tileW);
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          hist[gray[row + x]]++;
          count++;
        }
      }
      const cdf = new Uint8ClampedArray(256);
      if (count === 0) {
        for (let i = 0; i < 256; i++) cdf[i] = i;
        cdfs[ty * tilesX + tx] = cdf;
        continue;
      }
      // Preserve genuinely flat patches instead of amplifying noise.
      let minBin = 255;
      let maxBin = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > 0) {
          if (i < minBin) minBin = i;
          if (i > maxBin) maxBin = i;
        }
      }
      if (maxBin - minBin <= 8) {
        for (let i = 0; i < 256; i++) cdf[i] = i;
        cdfs[ty * tilesX + tx] = cdf;
        continue;
      }
      const clipLimit = Math.max(1, Math.round((count / 256) * clipLimitFactor));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          excess += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      const redist = Math.floor(excess / 256);
      const rem = excess - redist * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += redist + (i < rem ? 1 : 0);
      }
      let cum = 0;
      for (let i = 0; i < 256; i++) {
        cum += hist[i];
        cdf[i] = Math.round(((cum - 1) / Math.max(1, count - 1)) * 255);
      }
      cdfs[ty * tilesX + tx] = cdf;
    }
  }

  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const gy = (y + 0.5) / tileH - 0.5;
    const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(gy)));
    const ty1 = Math.max(0, Math.min(tilesY - 1, ty0 + 1));
    const fy = Math.max(0, Math.min(1, gy - ty0));
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const gx = (x + 0.5) / tileW - 0.5;
      const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(gx)));
      const tx1 = Math.max(0, Math.min(tilesX - 1, tx0 + 1));
      const fx = Math.max(0, Math.min(1, gx - tx0));
      const v = gray[row + x];
      const top =
        cdfs[ty0 * tilesX + tx0][v] * (1 - fx) +
        cdfs[ty0 * tilesX + tx1][v] * fx;
      const bot =
        cdfs[ty1 * tilesX + tx0][v] * (1 - fx) +
        cdfs[ty1 * tilesX + tx1][v] * fx;
      out[row + x] = Math.round(top * (1 - fy) + bot * fy);
    }
  }
  return out;
}

export function automaticImageMethods(stats: ImageStats): ImageMethod[] {
  // Two rescue options, generated only if OCR asks for them. Never threshold first.
  if (stats.high - stats.low < 100 || stats.mean < 100 || stats.mean > 215)
    return ["contrast", "grayscale"];
  return stats.edge > 18 ? ["clean", "grayscale"] : ["grayscale", "contrast"];
}

/** Extended rescue order that prioritizes tile-based CLAHE on uneven lighting,
 *  glare, shadows, or low-contrast packaging. */
export function rescueImageMethods(
  stats: ImageStats,
  quality?: ImageQuality,
): ImageMethod[] {
  if (
    quality &&
    (quality.hasGlare || quality.isTooDark || quality.isLowContrast || quality.shadowRatio > 0.25)
  ) {
    return ["clahe", "clean", "contrast"];
  }
  if (stats.high - stats.low < 110 || stats.mean < 100 || stats.mean > 210) {
    return ["clahe", "contrast", "grayscale"];
  }
  return stats.edge > 18
    ? ["clean", "clahe", "grayscale"]
    : ["clahe", "grayscale", "contrast"];
}

export function preprocessPixels(
  image: PixelImage,
  method: ImageMethod,
  options: FilterOptions = {},
): PixelImage {
  validate(image);
  const { width, height } = image;
  const output = new Uint8ClampedArray(image.data.length);
  if (method === "original") {
    output.set(image.data);
    return { width, height, data: output };
  }
  const gray = luminance(image),
    stats = imageStatistics(image);
  if (method === "clahe") {
    const equalized = applyClahe(gray, width, height, options.clipLimit ?? 2.4);
    for (let i = 0; i < equalized.length; i++) {
      const p = i * 4;
      output[p] = output[p + 1] = output[p + 2] = equalized[i];
      output[p + 3] = 255;
    }
    return { width, height, data: output };
  }
  const range = stats.high - stats.low;
  // Bound gain: flat/glare patches must not become fabricated strokes.
  const gain =
    (range > 8 ? Math.min(2.8, 225 / range) : 1) * (options.contrast ?? 1);
  const brightness = options.brightness ?? 0;
  const mapped = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++)
    mapped[i] =
      range > 8
        ? (gray[i] - stats.low) * gain + 15 + brightness
        : gray[i] + brightness;
  if (method === "contrast") {
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4,
        alpha = image.data[p + 3] / 255;
      for (let channel = 0; channel < 3; channel++) {
        const color = image.data[p + channel] * alpha + 255 * (1 - alpha);
        output[p + channel] = color + mapped[i] - gray[i];
      }
      output[p + 3] = 255;
    }
    return { width, height, data: output };
  }
  let pixels = mapped;
  if (method === "clean") {
    const denoised = new Uint8ClampedArray(mapped.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let weighted = 0,
          min = 255,
          max = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const value =
              mapped[
                Math.max(0, Math.min(height - 1, y + dy)) * width +
                  Math.max(0, Math.min(width - 1, x + dx))
              ];
            weighted += value * (dx === 0 || dy === 0 ? 2 : 1);
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        const i = y * width + x,
          center = mapped[i];
        const corrected =
          center > max + 20 || center < min - 20 ? weighted / 12 : center;
        // A small Gaussian blend suppresses noise without heavy per-pixel sorting.
        denoised[i] =
          corrected * 0.65 + ((weighted + corrected * 4) / 16) * 0.35;
      }
    pixels = new Uint8ClampedArray(mapped.length);
    const amount = Math.max(0, Math.min(0.7, options.sharpen ?? 0.35));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const average =
          (denoised[Math.max(0, y - 1) * width + x] +
            denoised[Math.min(height - 1, y + 1) * width + x] +
            denoised[y * width + Math.max(0, x - 1)] +
            denoised[y * width + Math.min(width - 1, x + 1)]) /
          4;
        pixels[i] = denoised[i] + amount * (denoised[i] - average);
      }
  } else if (method === "threshold") {
    const stride = width + 1,
      integral = new Float64Array(stride * (height + 1));
    for (let y = 1; y <= height; y++) {
      let row = 0;
      for (let x = 1; x <= width; x++) {
        row += mapped[(y - 1) * width + x - 1];
        integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
      }
    }
    const radius = Math.max(3, Math.round(Math.min(width, height) / 40));
    pixels = new Uint8ClampedArray(mapped.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - radius),
          x2 = Math.min(width, x + radius + 1),
          y1 = Math.max(0, y - radius),
          y2 = Math.min(height, y + radius + 1);
        const mean =
          (integral[y2 * stride + x2] -
            integral[y1 * stride + x2] -
            integral[y2 * stride + x1] +
            integral[y1 * stride + x1]) /
          ((x2 - x1) * (y2 - y1));
        pixels[y * width + x] = mapped[y * width + x] < mean - 8 ? 0 : 255;
      }
  }
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 4;
    output[p] = output[p + 1] = output[p + 2] = pixels[i];
    output[p + 3] = 255;
  }
  return { width, height, data: output };
}
