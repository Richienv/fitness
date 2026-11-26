// Evolving streak tiers that reward multi-day / multi-week consistency with
// escalating flame, lightning, golden crown, and godfire aesthetics. Pure module.

export type StreakTierId =
  | "dormant"
  | "ember"
  | "blaze"
  | "blue_flame"
  | "lightning"
  | "golden"
  | "godfire";

export type StreakTierMeta = {
  id: StreakTierId;
  min: number;
  title: string;
  shortLabel: string;
  accent: string;
  glow: string;
  pillBg: string;
  pillBorder: string;
};

export const STREAK_TIERS: readonly StreakTierMeta[] = [
  {
    id: "dormant",
    min: 0,
    title: "Belum Nyala",
    shortLabel: "Mulai",
    accent: "#94a3b8",
    glow: "rgba(148, 163, 184, 0)",
    pillBg: "rgba(241, 245, 249, 0.8)",
    pillBorder: "rgba(148, 163, 184, 0.25)",
  },
  {
    id: "ember",
    min: 1,
    title: "Api Awal",
    shortLabel: "Api Awal",
    accent: "#f97316",
    glow: "rgba(249, 115, 22, 0.24)",
    pillBg: "rgba(255, 247, 237, 0.96)",
    pillBorder: "rgba(249, 115, 22, 0.3)",
  },
  {
    id: "blaze",
    min: 3,
    title: "Api Membara",
    shortLabel: "Membara",
    accent: "#ef4444",
    glow: "rgba(239, 68, 68, 0.3)",
    pillBg: "rgba(254, 242, 242, 0.96)",
    pillBorder: "rgba(239, 68, 68, 0.34)",
  },
  {
    id: "blue_flame",
    min: 4,
    title: "Api Biru",
    shortLabel: "Api Biru",
    accent: "#0284c7",
    glow: "rgba(14, 165, 233, 0.34)",
    pillBg: "rgba(240, 249, 255, 0.96)",
    pillBorder: "rgba(14, 165, 233, 0.38)",
  },
  {
    id: "lightning",
    min: 5,
    title: "Petir Ungu",
    shortLabel: "Petir",
    accent: "#7c3aed",
    glow: "rgba(124, 58, 237, 0.36)",
    pillBg: "rgba(245, 243, 255, 0.96)",
    pillBorder: "rgba(124, 58, 237, 0.38)",
  },
  {
    id: "golden",
    min: 7,
    title: "Api Emas",
    shortLabel: "Emas",
    accent: "#d97706",
    glow: "rgba(245, 158, 11, 0.4)",
    pillBg: "rgba(255, 251, 235, 0.98)",
    pillBorder: "rgba(245, 158, 11, 0.45)",
  },
  {
    id: "godfire",
    min: 14,
    title: "Tingkat Dewa",
    shortLabel: "Dewa",
    accent: "#db2777",
    glow: "rgba(219, 39, 119, 0.42)",
    pillBg: "linear-gradient(135deg, rgba(255,251,235,0.98), rgba(253,242,248,0.98))",
    pillBorder: "rgba(219, 39, 119, 0.42)",
  },
];

export function getStreakTier(rawCount: number): StreakTierMeta {
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
  let picked = STREAK_TIERS[0];
  for (const tier of STREAK_TIERS) {
    if (count >= tier.min) picked = tier;
  }
  return picked;
}

export function nextStreakMilestone(rawCount: number): {
  nextAt: number;
  nextTitle: string;
  remaining: number;
} | null {
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
  for (const tier of STREAK_TIERS) {
    if (tier.min > count) {
      return {
        nextAt: tier.min,
        nextTitle: tier.title,
        remaining: tier.min - count,
      };
    }
  }
  return null;
}
