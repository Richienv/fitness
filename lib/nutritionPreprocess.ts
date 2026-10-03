export const IMAGE_METHODS = {
  original: "Asli",
  contrast: "Kontras warna",
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
export type FilterOptions = {
  contrast?: number;
  brightness?: number;
  sharpen?: number;
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
export function automaticImageMethods(stats: ImageStats): ImageMethod[] {
  // Two rescue options, generated only if OCR asks for them. Never threshold first.
  if (stats.high - stats.low < 100 || stats.mean < 100 || stats.mean > 215)
    return ["contrast", "grayscale"];
  return stats.edge > 18 ? ["clean", "grayscale"] : ["grayscale", "contrast"];
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
