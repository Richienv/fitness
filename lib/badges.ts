// Earned achievements. The ladder is the point: locked badges show progress
// toward the milestone, so there is always a visible next rung.
//
// `tier` selects the metal treatment in the UI (see the handoff's "Metal
// system"): gold / silver / bronze / fire / green, dim gunmetal when locked.

export type BadgeTier = "gold" | "silver" | "bronze" | "fire" | "green";

export type BadgeDef = {
  key: string;
  label: string;
  tier: BadgeTier;
  /** What the number in `progress` counts. */
  unit: string;
  target: number;
  /** Shown under the badge in the profile. */
  milestone: string;
};

export const BADGES: BadgeDef[] = [
  { key: "clean_eater", label: "CLEAN EATER", tier: "green",  unit: "hari",  target: 30,  milestone: "Gula < 25g selama 30 hari" },
  { key: "runner",      label: "RUNNER",      tier: "fire",   unit: "km",    target: 100, milestone: "Total lari 100 km" },
  { key: "iron",        label: "IRON",        tier: "silver", unit: "sesi",  target: 200, milestone: "200 sesi angkat beban" },
  { key: "marathon",    label: "MARATHON",    tier: "gold",   unit: "km",    target: 42,  milestone: "42 km dalam satu sesi" },
  { key: "sunrise",     label: "SUNRISE",     tier: "bronze", unit: "sesi",  target: 50,  milestone: "50 sesi sebelum jam 7 pagi" },
  { key: "consistent",  label: "KONSISTEN",   tier: "fire",   unit: "hari",  target: 30,  milestone: "Catat makan 30 hari beruntun" },
  { key: "protein",     label: "PROTEIN KING",tier: "silver", unit: "hari",  target: 50,  milestone: "Target protein tercapai 50 hari" },
  { key: "century",     label: "CENTURY",     tier: "gold",   unit: "sesi",  target: 100, milestone: "100 workout total" },
];

export const BADGE_BY_KEY: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.key, b])
);

export type EarnedBadge = {
  key: string;
  label: string;
  tier: BadgeTier;
  milestone: string;
  progress: number;
  target: number;
  unit: string;
  earned: boolean;
};

/** Merge stored progress rows onto the full catalogue so locked badges still
 *  render with their ladder position. */
export function mergeBadges(
  rows: { key: string; progress: number; earnedAt: Date | null }[]
): EarnedBadge[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return BADGES.map((b) => {
    const row = byKey.get(b.key);
    const progress = row?.progress ?? 0;
    return {
      key: b.key,
      label: b.label,
      tier: b.tier,
      milestone: b.milestone,
      progress,
      target: b.target,
      unit: b.unit,
      earned: !!row?.earnedAt || progress >= b.target,
    };
  });
}
