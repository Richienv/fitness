// Clean, luminous stage backgrounds unlocked through evidence-based health
// achievements (NOT body weight). Zero "use client" so server and tests share it cleanly.

export type StageBackgroundId =
  | "clean-studio"
  | "jade-zen"
  | "nordic-mist"
  | "golden-dawn"
  | "ocean-glass"
  | "ember-forge"
  | "aurora-horizon"
  | "starlight-peak"
  | "sakura-loft";

export type StageBackgroundMeta = {
  id: StageBackgroundId;
  name: string;
  tagline: string;
  achievementKey: string | null;
  previewGradient: string;
  accent: string;
};

export const DEFAULT_STAGE_ID: StageBackgroundId = "clean-studio";

export const STAGE_BACKGROUNDS: readonly StageBackgroundMeta[] = [
  {
    id: "clean-studio",
    name: "Studio Bersih",
    tagline: "Putih-biru minimalis & selalu bersih",
    achievementKey: null,
    previewGradient: "linear-gradient(155deg, #eef3ff 0%, #f6f7fc 48%, #fdf7f2 100%)",
    accent: "#3e60d5",
  },
  {
    id: "jade-zen",
    name: "Jade Zen",
    tagline: "Atmosfer hijau tenang bebas lonjakan gula",
    achievementKey: "sugar_3d",
    previewGradient: "linear-gradient(155deg, #e7fbf3 0%, #f3fcf8 52%, #e8f5ff 100%)",
    accent: "#0d9488",
  },
  {
    id: "nordic-mist",
    name: "Nordic Mist",
    tagline: "Kabut biru Skandinavia ringan & seimbang",
    achievementKey: "fat_5d",
    previewGradient: "linear-gradient(155deg, #e8f1ff 0%, #f2f6ff 50%, #eef2f6 100%)",
    accent: "#0284c7",
  },
  {
    id: "golden-dawn",
    name: "Golden Dawn",
    tagline: "Kilau pagi hangat penjaga massa otot",
    achievementKey: "protein_3d",
    previewGradient: "linear-gradient(155deg, #fff5dc 0%, #fffaf0 52%, #ffeede 100%)",
    accent: "#d97706",
  },
  {
    id: "ocean-glass",
    name: "Ocean Glass",
    tagline: "Refleksi air jernih bertenaga hidrasi",
    achievementKey: "water_3d",
    previewGradient: "linear-gradient(155deg, #e0f7ff 0%, #f0fbff 52%, #e6f2ff 100%)",
    accent: "#0ea5e9",
  },
  {
    id: "ember-forge",
    name: "Ember Forge",
    tagline: "Sorot hangat energi latihan konsisten",
    achievementKey: "workout_3w",
    previewGradient: "linear-gradient(155deg, #ffece5 0%, #fff6f2 52%, #fff2df 100%)",
    accent: "#e11d48",
  },
  {
    id: "aurora-horizon",
    name: "Aurora Horizon",
    tagline: "Gradasi kutub disiplin defisit sehat",
    achievementKey: "kcal_5d",
    previewGradient: "linear-gradient(155deg, #e6faf6 0%, #eef2ff 50%, #f5ebff 100%)",
    accent: "#7c3aed",
  },
  {
    id: "starlight-peak",
    name: "Starlight Peak",
    tagline: "Langit biru-violet bersih 7 hari konsisten",
    achievementKey: "streak_7d",
    previewGradient: "linear-gradient(155deg, #e8e9ff 0%, #f4f5ff 50%, #fdf2f8 100%)",
    accent: "#4f46e5",
  },
  {
    id: "sakura-loft",
    name: "Sakura Loft",
    tagline: "Nuansa sakura hangat kompak berdua",
    achievementKey: "couple_energy",
    previewGradient: "linear-gradient(155deg, #ffeaf2 0%, #fff5f8 52%, #fef3eb 100%)",
    accent: "#db2777",
  },
];

const BY_ID = new Map(STAGE_BACKGROUNDS.map((s) => [s.id, s]));

export function isStageBackgroundId(v: unknown): v is StageBackgroundId {
  return typeof v === "string" && BY_ID.has(v as StageBackgroundId);
}

export function getStageBackground(id: unknown): StageBackgroundMeta {
  return (isStageBackgroundId(id) ? BY_ID.get(id) : undefined) ?? STAGE_BACKGROUNDS[0];
}
