// Bahasa Indonesia names for the equipment and muscle data, which is stored in
// English. Sentence case, for screens that follow the calm style.
import type { MuscleKey } from "./muscles";

export const CATEGORY_ID: Record<string, string> = {
  MACHINE: "Mesin",
  CABLE: "Kabel",
  BARBELL: "Barbel",
  DUMBBELL: "Dumbel",
  BODYWEIGHT: "Berat badan",
  CARDIO: "Kardio",
};

/** Equipment.muscleGroup ("UPPER CHEST", "HAMSTRINGS") in Bahasa. */
export const MUSCLE_GROUP_ID: Record<string, string> = {
  CHEST: "Dada",
  "UPPER CHEST": "Dada atas",
  LATS: "Punggung lebar",
  "MIDDLE BACK": "Punggung tengah",
  "LOWER BACK": "Punggung bawah",
  "SIDE DELT": "Bahu samping",
  "REAR DELT": "Bahu belakang",
  "FRONT DELT": "Bahu depan",
  BICEPS: "Bisep",
  TRICEPS: "Trisep",
  QUADS: "Paha depan",
  HAMSTRINGS: "Paha belakang",
  GLUTES: "Bokong",
  CALVES: "Betis",
  "INNER THIGH": "Paha dalam",
  ABS: "Perut",
  "LOWER ABS": "Perut bawah",
  CARDIO: "Kardio",
};

/** MuscleKey (an exercise's main muscle) in Bahasa. */
export const MUSCLE_KEY_ID: Record<MuscleKey, string> = {
  chest: "Dada",
  frontDelt: "Bahu depan",
  sideDelt: "Bahu samping",
  rearDelt: "Bahu belakang",
  tricep: "Trisep",
  bicep: "Bisep",
  lats: "Punggung",
  midBack: "Punggung tengah",
  traps: "Trapezius",
  quad: "Paha depan",
  hamstring: "Paha belakang",
  glute: "Bokong",
  calf: "Betis",
  abs: "Perut",
};

export const categoryLabel = (c: string) => CATEGORY_ID[c] ?? c;
export const muscleGroupLabel = (g: string) =>
  MUSCLE_GROUP_ID[g] ?? g.charAt(0) + g.slice(1).toLowerCase();
