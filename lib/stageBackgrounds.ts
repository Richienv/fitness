// Collector trading-card & UNITE holographic stage backgrounds unlocked through
// evidence-based health achievements (NOT body weight). Zero "use client" so server and tests share it cleanly.

export type StageRarity = "rare" | "epic" | "gold" | "legendary";
export type StageFoilStyle = "unite" | "gold" | "holo" | "prism";

export type StageBackgroundId =
  | "clean-studio"
  | "warm-sunset"
  | "sky-breeze"
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
  cardCode: string;
  rarity: StageRarity;
  foilStyle: StageFoilStyle;
  badgeLabel: string;
  foilGradient: string;
};

export const DEFAULT_STAGE_ID: StageBackgroundId = "clean-studio";

export const FREE_STARTER_STAGE_IDS: readonly StageBackgroundId[] = [
  "clean-studio",
  "warm-sunset",
  "sky-breeze",
];

export const RARITY_TAG: Record<StageRarity, string> = {
  rare: "RARE",
  epic: "EPIC",
  gold: "GOLD",
  legendary: "VMAX",
};

export const STAGE_BACKGROUNDS: readonly StageBackgroundMeta[] = [
  {
    id: "clean-studio",
    name: "Unite Cobalt",
    tagline: "Kartu arena biru kobalt bergaya Pokemon UNITE dengan aksen halftone",
    achievementKey: null,
    previewGradient:
      "linear-gradient(135deg, #2563eb 0%, #3b82f6 38%, #38bdf8 72%, #e0f2fe 100%)",
    accent: "#2563eb",
    cardCode: "#01",
    rarity: "rare",
    foilStyle: "unite",
    badgeLabel: "UNITE COBALT",
    foilGradient:
      "linear-gradient(135deg, #1d4ed8 0%, #38bdf8 50%, #93c5fd 100%)",
  },
  {
    id: "warm-sunset",
    name: "Gold Thunder",
    tagline: "Kartu logam emas metalik dengan percikan energi keemasan",
    achievementKey: null,
    previewGradient:
      "linear-gradient(135deg, #b45309 0%, #f59e0b 35%, #fde047 68%, #fef3c7 100%)",
    accent: "#d97706",
    cardCode: "#02",
    rarity: "gold",
    foilStyle: "gold",
    badgeLabel: "GOLD THUNDER",
    foilGradient:
      "linear-gradient(135deg, #92400e 0%, #fbbf24 45%, #fef08a 100%)",
  },
  {
    id: "sky-breeze",
    name: "VMAX Prism",
    tagline: "Foil pelangi VMAX holografik dengan kilau prisma spektrum penuh",
    achievementKey: null,
    previewGradient:
      "linear-gradient(135deg, #f472b6 0%, #fbbf24 25%, #34d399 50%, #38bdf8 75%, #a855f7 100%)",
    accent: "#7c3aed",
    cardCode: "#03",
    rarity: "legendary",
    foilStyle: "prism",
    badgeLabel: "VMAX PRISM",
    foilGradient:
      "linear-gradient(135deg, #ec4899 0%, #f59e0b 28%, #10b981 55%, #3b82f6 78%, #8b5cf6 100%)",
  },
  {
    id: "jade-zen",
    name: "Jade Emerald",
    tagline: "Kartu kolektor zamrud segar bebas lonjakan gula",
    achievementKey: "sugar_3d",
    previewGradient:
      "linear-gradient(135deg, #047857 0%, #10b981 48%, #6ee7b7 100%)",
    accent: "#059669",
    cardCode: "#04",
    rarity: "rare",
    foilStyle: "unite",
    badgeLabel: "JADE EMERALD",
    foilGradient:
      "linear-gradient(135deg, #065f46 0%, #34d399 52%, #a7f3d0 100%)",
  },
  {
    id: "nordic-mist",
    name: "Frost EX",
    tagline: "Kartu kristal es safir jernih & seimbang",
    achievementKey: "fat_5d",
    previewGradient:
      "linear-gradient(135deg, #0369a1 0%, #0ea5e9 48%, #bae6fd 100%)",
    accent: "#0284c7",
    cardCode: "#05",
    rarity: "rare",
    foilStyle: "holo",
    badgeLabel: "FROST EX",
    foilGradient:
      "linear-gradient(135deg, #075985 0%, #38bdf8 50%, #e0f2fe 100%)",
  },
  {
    id: "golden-dawn",
    name: "Solar Gold",
    tagline: "Edisi sampanye emas tempaan penjaga massa otot",
    achievementKey: "protein_3d",
    previewGradient:
      "linear-gradient(135deg, #92400e 0%, #eab308 45%, #fef08a 100%)",
    accent: "#ca8a04",
    cardCode: "#06",
    rarity: "gold",
    foilStyle: "gold",
    badgeLabel: "SOLAR GOLD",
    foilGradient:
      "linear-gradient(135deg, #78350f 0%, #facc15 50%, #fef9c3 100%)",
  },
  {
    id: "ocean-glass",
    name: "Hydro GX",
    tagline: "Kristal samudra aqua holografik bertenaga hidrasi",
    achievementKey: "water_3d",
    previewGradient:
      "linear-gradient(135deg, #0e7490 0%, #06b6d4 45%, #67e8f9 100%)",
    accent: "#0891b2",
    cardCode: "#07",
    rarity: "epic",
    foilStyle: "holo",
    badgeLabel: "HYDRO GX",
    foilGradient:
      "linear-gradient(135deg, #155e75 0%, #22d3ee 50%, #cffafe 100%)",
  },
  {
    id: "ember-forge",
    name: "Magma EX",
    tagline: "Foil bara merah-amber bercahaya penuh energi latihan",
    achievementKey: "workout_3w",
    previewGradient:
      "linear-gradient(135deg, #be123c 0%, #f97316 50%, #fde047 100%)",
    accent: "#e11d48",
    cardCode: "#08",
    rarity: "epic",
    foilStyle: "gold",
    badgeLabel: "MAGMA EX",
    foilGradient:
      "linear-gradient(135deg, #9f1239 0%, #fb923c 50%, #fef08a 100%)",
  },
  {
    id: "aurora-horizon",
    name: "Aurora VMAX",
    tagline: "Prisma aurora kutub disiplin defisit sehat",
    achievementKey: "kcal_5d",
    previewGradient:
      "linear-gradient(135deg, #059669 0%, #38bdf8 48%, #9333ea 100%)",
    accent: "#7c3aed",
    cardCode: "#09",
    rarity: "legendary",
    foilStyle: "prism",
    badgeLabel: "AURORA VMAX",
    foilGradient:
      "linear-gradient(135deg, #10b981 0%, #38bdf8 48%, #c084fc 100%)",
  },
  {
    id: "starlight-peak",
    name: "Cosmic GX",
    tagline: "Foil kosmik nila-magenta 7 hari streak tak terputus",
    achievementKey: "streak_7d",
    previewGradient:
      "linear-gradient(135deg, #312e81 0%, #6366f1 48%, #ec4899 100%)",
    accent: "#4f46e5",
    cardCode: "#10",
    rarity: "legendary",
    foilStyle: "holo",
    badgeLabel: "COSMIC GX",
    foilGradient:
      "linear-gradient(135deg, #3730a3 0%, #818cf8 48%, #f472b6 100%)",
  },
  {
    id: "sakura-loft",
    name: "Sakura Foil",
    tagline: "Foil mutiara rose-gold kompak berdua setiap hari",
    achievementKey: "couple_energy",
    previewGradient:
      "linear-gradient(135deg, #be185d 0%, #f472b6 50%, #fde68a 100%)",
    accent: "#db2777",
    cardCode: "#11",
    rarity: "epic",
    foilStyle: "prism",
    badgeLabel: "SAKURA FOIL",
    foilGradient:
      "linear-gradient(135deg, #9d174d 0%, #f9a8d4 52%, #fef08a 100%)",
  },
];

const BY_ID = new Map(STAGE_BACKGROUNDS.map((s) => [s.id, s]));

export function isStageBackgroundId(v: unknown): v is StageBackgroundId {
  return typeof v === "string" && BY_ID.has(v as StageBackgroundId);
}

export function getStageBackground(id: unknown): StageBackgroundMeta {
  return (isStageBackgroundId(id) ? BY_ID.get(id) : undefined) ?? STAGE_BACKGROUNDS[0];
}
