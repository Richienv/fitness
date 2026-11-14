import { computeDayTargets } from "./energy.ts";
import type { Profile, MacroTarget } from "./settings";
import type { Measurement } from "./measurements";
import type { Character, CompanionGoal } from "./companionProgress";

export type SetupDraft = {
  sex: "male" | "female";
  age: string;
  height: string;
  weight: string;
  measurementDate: string;
  target: string;
  deadline: string;
  goal: Profile["goal"];
  bodyMeasured: "yes" | "later" | "";
  waist: string;
  hip: string;
  shoulder: string;
  activity: string;
  trainingDays: number[];
  sleep: string;
  foodStyle: string;
  allergyMode: "none" | "list" | "";
  allergies: string;
  nutritionMode: "estimate" | "manual";
  gymKcal: string;
  restKcal: string;
  protein: string;
};
export type AccountSetup = {
  version: 1;
  person: Character;
  completedAt: string;
  updatedAt: string;
  draft: SetupDraft;
  profile: Profile;
  measurement: Measurement;
  targetWeightKg: number;
  deadline: string;
  trainingDays: number[];
  sleepHours: number;
  foodStyle: string;
  allergies: string;
  targetsCustom: boolean;
  targets: { gymDay: MacroTarget; restDay: MacroTarget };
  companionGoal: CompanionGoal;
};
export type SetupState = {
  person: Character;
  setup: AccountSetup | null;
  latest: Measurement | null;
};
export const PERSON = {
  richie: { name: "Richie", target: 73, color: "#3e60d5" },
  renita: { name: "Renita", target: 43, color: "#9f344b" },
};
export function newSetupDraft(person: Character, today: string): SetupDraft {
  return {
    sex: person === "richie" ? "male" : "female",
    age: "",
    height: "",
    weight: "",
    measurementDate: today,
    target: String(PERSON[person].target),
    deadline: "2026-12-31",
    goal: "recomp",
    bodyMeasured: "",
    waist: "",
    hip: "",
    shoulder: "",
    activity: "",
    trainingDays: [],
    sleep: "8",
    foodStyle: "",
    allergyMode: "",
    allergies: "",
    nutritionMode: "estimate",
    gymKcal: "",
    restKcal: "",
    protein: "",
  };
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function number(v: unknown) {
  return (typeof v === "string" && v.trim() !== "") || typeof v === "number"
    ? Number(v)
    : NaN;
}
function inRange(v: unknown, min: number, max: number) {
  const n = number(v);
  return Number.isFinite(n) && n >= min && n <= max;
}
export function validateSetupStep(
  d: SetupDraft,
  step: number,
  today: string,
): string | null {
  if (step === 0) {
    if (!["male", "female"].includes(d.sex)) return "Pilih profil tubuh.";
    if (!inRange(d.age, 18, 100) || !Number.isInteger(number(d.age)))
      return "Isi usia 18–100 tahun.";
    if (!inRange(d.height, 100, 230)) return "Isi tinggi badan 100–230 cm.";
    if (!inRange(d.weight, 25, 350))
      return "Isi angka timbangan dalam kg (25–350).";
    if (
      !validDate(d.measurementDate) ||
      d.measurementDate > today ||
      d.measurementDate < "2020-01-01"
    )
      return "Pilih tanggal penimbangan yang sudah dilakukan.";
  }
  if (step === 1) {
    if (!inRange(d.target, 25, 350)) return "Isi target berat dalam kg.";
    if (
      !validDate(d.deadline) ||
      d.deadline < d.measurementDate ||
      d.deadline > "2099-12-31"
    )
      return "Tanggal target harus setelah penimbangan awal.";
    if (!["fat_loss", "recomp", "muscle_gain", "maintain"].includes(d.goal))
      return "Pilih fokusmu.";
    if (!["yes", "later"].includes(d.bodyMeasured))
      return "Pilih isi ukuran tubuh atau belum diukur.";
    if (d.bodyMeasured === "yes") {
      if (!inRange(d.waist, 30, 250))
        return "Isi lingkar pinggang yang sudah diukur (cm).";
      if (
        (d.hip && !inRange(d.hip, 30, 250)) ||
        (d.shoulder && !inRange(d.shoulder, 30, 250))
      )
        return "Periksa ukuran pinggul dan bahu (cm).";
    }
  }
  if (step === 2) {
    if (![1.2, 1.375, 1.55, 1.725].includes(number(d.activity)))
      return "Pilih aktivitas harianmu.";
    if (
      !Array.isArray(d.trainingDays) ||
      d.trainingDays.length > 7 ||
      new Set(d.trainingDays).size !== d.trainingDays.length ||
      d.trainingDays.some((n) => !Number.isInteger(n) || n < 0 || n > 6)
    )
      return "Periksa hari latihan.";
    if (!inRange(d.sleep, 4, 12)) return "Isi target tidur 4–12 jam.";
  }
  if (step === 3) {
    if (!["bebas", "halal", "vegetarian", "pescatarian"].includes(d.foodStyle))
      return "Pilih preferensi makan.";
    if (!["none", "list"].includes(d.allergyMode))
      return "Konfirmasi alergi atau pantangan.";
    if (
      d.allergyMode === "list" &&
      (typeof d.allergies !== "string" ||
        !d.allergies.trim() ||
        d.allergies.length > 500)
    )
      return "Tulis alergi atau pantanganmu (maks. 500 karakter).";
    if (!["estimate", "manual"].includes(d.nutritionMode))
      return "Pilih cara mengatur target makan.";
    if (
      d.nutritionMode === "manual" &&
      (!inRange(d.gymKcal, 1000, 6000) ||
        !inRange(d.restKcal, 1000, 6000) ||
        !inRange(d.protein, 20, 350))
    )
      return "Periksa kalori latihan/istirahat dan protein.";
  }
  return null;
}
export function setupTargets(d: SetupDraft) {
  const estimated = computeDayTargets({
    sex: d.sex,
    age: number(d.age),
    heightCm: number(d.height),
    weightKg: number(d.weight),
    activity: number(d.activity),
    goal: d.goal,
  });
  if (d.nutritionMode !== "manual")
    return { gymDay: estimated.gymDay, restDay: estimated.restDay };
  const protein = Math.round(number(d.protein));
  const target = (kcal: number): MacroTarget => {
    const fat = estimated.gymDay.fat;
    return {
      kcal: Math.round(kcal),
      protein,
      fat,
      carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)),
    };
  };
  return {
    gymDay: target(number(d.gymKcal)),
    restDay: target(number(d.restKcal)),
  };
}
export function buildSetup(
  input: unknown,
  person: Character,
  today: string,
  previous: AccountSetup | null = null,
): AccountSetup {
  if (!input || typeof input !== "object")
    throw new Error("Data belum lengkap.");
  const raw = input as Record<string, unknown>;
  const base = newSetupDraft(person, today);
  const draft = Object.fromEntries(
    Object.keys(base).map((key) => [
      key,
      raw[key] ?? base[key as keyof SetupDraft],
    ]),
  ) as SetupDraft;
  for (let step = 0; step < 4; step++) {
    const error = validateSetupStep(draft, step, today);
    if (error) throw new Error(error);
  }
  const targets = setupTargets(draft);
  if (
    targets.gymDay.kcal < targets.gymDay.protein * 4 + targets.gymDay.fat * 9 ||
    targets.restDay.kcal < targets.restDay.protein * 4 + targets.restDay.fat * 9
  )
    throw new Error(
      "Kalori terlalu kecil untuk target protein dan lemak tersebut.",
    );
  const measurement: Measurement = {
    date: draft.measurementDate,
    weightKg: number(draft.weight),
  };
  if (draft.bodyMeasured === "yes") {
    measurement.waistCm = number(draft.waist);
    if (draft.hip) measurement.hipCm = number(draft.hip);
    if (draft.shoulder) measurement.shoulderCm = number(draft.shoulder);
  }
  const profile: Profile = {
    sex: draft.sex,
    age: number(draft.age),
    heightCm: number(draft.height),
    weightKg: number(draft.weight),
    activity: number(draft.activity),
    goal: draft.goal,
    menstrualTrackingEnabled:
      previous?.profile.menstrualTrackingEnabled ?? false,
    cycleStartDate: previous?.profile.cycleStartDate ?? null,
  };
  return {
    version: 1,
    person,
    completedAt: previous?.completedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft,
    profile,
    measurement,
    targetWeightKg: number(draft.target),
    deadline: draft.deadline,
    trainingDays: [...draft.trainingDays].sort(),
    sleepHours: number(draft.sleep),
    foodStyle: draft.foodStyle,
    allergies: draft.allergyMode === "list" ? draft.allergies.trim() : "",
    targetsCustom: draft.nutritionMode === "manual",
    targets,
    companionGoal: {
      mode: "weight",
      baselineDate: previous?.companionGoal.baselineDate ?? measurement.date,
      baselineWeight:
        previous?.companionGoal.baselineWeight ?? measurement.weightKg!,
      targetWeight: number(draft.target),
      baselineWaist: measurement.waistCm ?? null,
      targetWaist: null,
      exercise: "",
      reps: 8,
      baselineLift: null,
      targetLift: null,
    },
  };
}

export function sameMeasurement(
  a: Measurement | null | undefined,
  b: Measurement,
) {
  return (
    !!a &&
    (["date", "weightKg", "waistCm", "hipCm", "shoulderCm"] as const).every(
      (k) => a[k] === b[k],
    )
  );
}
