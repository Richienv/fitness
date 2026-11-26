// Pure per-person target defaults & resolvers (Richie vs Renita).
// Safe on both server routes and client code (zero "use client", zero DB imports).

import type { Measurement } from "./measurements";
import type { Character, CompanionGoal } from "./companionProgress";
import { loginPerson } from "./privateLogin.ts";
import { PERSON, type AccountSetup } from "./setup.ts";

export type PersonUserLike = {
  loginAlias?: string | null;
  sex?: string | null;
  name?: string | null;
  username?: string | null;
  setup?: unknown;
};

export type NutritionTargetPair = {
  kcal: number;
  protein: number;
};

export const DEFAULT_PERSON_TARGETS: Record<
  Character,
  { kcal: number; protein: number; targetWeightKg: number }
> = {
  richie: { kcal: 2200, protein: 150, targetWeightKg: PERSON.richie.target },
  renita: { kcal: 1450, protein: 100, targetWeightKg: PERSON.renita.target },
};

const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

function readSetup(raw: unknown): Partial<AccountSetup> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Partial<AccountSetup>;
}

/** Resolve whether a user row belongs to Richie or Renita using explicit
 *  loginAlias / setup.person / physiology sex before falling back to name. */
export function resolvePersonCharacter(user: PersonUserLike | null | undefined): Character {
  if (!user) return "richie";
  const alias = loginPerson(user.loginAlias);
  if (alias) return alias;

  const setup = readSetup(user.setup);
  if (setup?.person === "renita" || setup?.person === "richie") {
    return setup.person;
  }

  if (user.sex === "female") return "renita";
  if (user.sex === "male") return "richie";

  if (/renita/i.test(`${user.name ?? ""} ${user.username ?? ""}`)) {
    return "renita";
  }
  return "richie";
}

function cstWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay();
}

/** Resolve daily calorie & protein targets for any user, prioritizing:
 *  UserTarget row → User.setup.targets (gymDay/restDay) → person fallback. */
export function resolvePersonNutritionTargets(
  user: PersonUserLike | null | undefined,
  targetRow?: { kcal?: number | null; protein?: number | null } | null,
  dateKey?: string,
): NutritionTargetPair {
  const character = resolvePersonCharacter(user);
  const fallback = DEFAULT_PERSON_TARGETS[character];

  if (targetRow && positive(targetRow.kcal)) {
    return {
      kcal: Math.round(targetRow.kcal),
      protein:
        typeof targetRow.protein === "number" &&
        Number.isFinite(targetRow.protein) &&
        targetRow.protein >= 0
          ? Math.round(targetRow.protein)
          : fallback.protein,
    };
  }

  const setup = readSetup(user?.setup);
  const gym = setup?.targets?.gymDay;
  const rest = setup?.targets?.restDay;
  if (gym && positive(gym.kcal)) {
    const trainingDays = Array.isArray(setup?.trainingDays) ? setup.trainingDays : [];
    const isGym =
      dateKey && trainingDays.length > 0
        ? trainingDays.includes(cstWeekday(dateKey))
        : true;
    const chosen = isGym ? gym : rest && positive(rest.kcal) ? rest : gym;
    return {
      kcal: Math.round(chosen.kcal),
      protein: positive(chosen.protein) ? Math.round(chosen.protein) : fallback.protein,
    };
  }

  return { kcal: fallback.kcal, protein: fallback.protein };
}

/** Resolve target weight in kg: companionGoal.targetWeight → setup.targetWeightKg → person default (73 vs 43). */
export function resolvePersonTargetWeightKg(
  user: PersonUserLike | null | undefined,
): number {
  const character = resolvePersonCharacter(user);
  const setup = readSetup(user?.setup);
  if (
    setup?.companionGoal?.mode === "weight" &&
    positive(setup.companionGoal.targetWeight)
  ) {
    return setup.companionGoal.targetWeight;
  }
  if (positive(setup?.targetWeightKg)) {
    return setup.targetWeightKg;
  }
  if (positive(setup?.companionGoal?.targetWeight)) {
    return setup.companionGoal.targetWeight;
  }
  return DEFAULT_PERSON_TARGETS[character].targetWeightKg;
}

/** Resolve a user's CompanionGoal on the server, falling back cleanly to
 *  their setup targetWeightKg & earliest measurement so both Richie and Renita
 *  have accurate, independent avatar progression even before visiting /companion. */
export function resolvePersonCompanionGoal(
  user: PersonUserLike | null | undefined,
  measRows: Measurement[] = [],
): CompanionGoal {
  const character = resolvePersonCharacter(user);
  const setup = readSetup(user?.setup);
  const existing = setup?.companionGoal;

  const validWeights = measRows
    .filter((m) => positive(m.weightKg))
    .sort((a, b) => a.date.localeCompare(b.date));
  const earliest = validWeights[0] ?? null;
  const fallbackTarget = resolvePersonTargetWeightKg(user);

  if (existing && (existing.mode === "weight" || existing.mode === "recomp")) {
    if (existing.mode === "recomp") {
      return existing;
    }
    return {
      ...existing,
      baselineDate:
        existing.baselineDate ||
        setup?.measurement?.date ||
        earliest?.date ||
        "2026-04-07",
      baselineWeight: positive(existing.baselineWeight)
        ? existing.baselineWeight
        : positive(setup?.measurement?.weightKg)
          ? setup.measurement.weightKg
          : earliest?.weightKg ?? null,
      targetWeight: positive(existing.targetWeight)
        ? existing.targetWeight
        : fallbackTarget,
    };
  }

  return {
    mode: "weight",
    baselineDate: setup?.measurement?.date || earliest?.date || "2026-04-07",
    baselineWeight: positive(setup?.measurement?.weightKg)
      ? setup.measurement.weightKg
      : earliest?.weightKg ?? null,
    targetWeight: fallbackTarget || DEFAULT_PERSON_TARGETS[character].targetWeightKg,
    baselineWaist: setup?.measurement?.waistCm ?? null,
    targetWaist: null,
    exercise: "",
    reps: 8,
    baselineLift: null,
    targetLift: null,
  };
}
