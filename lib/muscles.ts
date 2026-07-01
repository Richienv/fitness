export type MuscleKey =
  | "chest"
  | "frontDelt"
  | "sideDelt"
  | "rearDelt"
  | "tricep"
  | "bicep"
  | "lats"
  | "midBack"
  | "traps"
  | "quad"
  | "hamstring"
  | "glute"
  | "calf"
  | "abs";

export type MuscleColorGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "abs";

// Fire-aligned muscle palette (weuseai per-theme colors, mockup MCOLOR).
export const MUSCLE_GROUP_COLOR: Record<MuscleColorGroup, string> = {
  chest: "#ff6a4c",
  back: "#229ed9",
  shoulders: "#ff8a3d",
  arms: "#8b6ef0",
  legs: "#eab308",
  abs: "#ff8a72",
};

export const MUSCLE_TO_GROUP: Record<MuscleKey, MuscleColorGroup> = {
  chest: "chest",
  frontDelt: "chest",
  sideDelt: "shoulders",
  rearDelt: "shoulders",
  tricep: "arms",
  bicep: "arms",
  lats: "back",
  midBack: "back",
  traps: "back",
  quad: "legs",
  hamstring: "legs",
  glute: "legs",
  calf: "legs",
  abs: "abs",
};

export const MUSCLE_LABEL: Record<MuscleKey, string> = {
  chest: "Chest",
  frontDelt: "Front Delt",
  sideDelt: "Side Delt",
  rearDelt: "Rear Delt",
  tricep: "Tricep",
  bicep: "Bicep",
  lats: "Lats",
  midBack: "Mid Back",
  traps: "Traps",
  quad: "Quad",
  hamstring: "Hamstring",
  glute: "Glute",
  calf: "Calf",
  abs: "Abs",
};

export function muscleColor(m: MuscleKey): string {
  return MUSCLE_GROUP_COLOR[MUSCLE_TO_GROUP[m]];
}
