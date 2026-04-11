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

export const MUSCLE_GROUP_COLOR: Record<MuscleColorGroup, string> = {
  chest: "#e8ff47",
  back: "#47ffb8",
  shoulders: "#ffffff",
  arms: "#8b47ff",
  legs: "#ff6b35",
  abs: "#ff4747",
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
