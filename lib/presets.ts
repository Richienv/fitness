export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export type MealPreset = {
  id: string;
  label: string;
  mealType: MealType;
  items: { id: string; qty: number }[];
};

export const PRESETS: MealPreset[] = [
  {
    id: "standard-breakfast",
    label: "🌅 Standard Breakfast",
    mealType: "breakfast",
    items: [
      { id: "egg", qty: 3 },
      { id: "oats", qty: 1 },
      { id: "creatine", qty: 1 },
    ],
  },
  {
    id: "campus-lunch",
    label: "🏫 Campus Lunch",
    mealType: "lunch",
    items: [
      { id: "purple-rice", qty: 1 },
      { id: "chicken-breast", qty: 1 },
      { id: "broccoli", qty: 1 },
      { id: "spinach", qty: 1 },
    ],
  },
  {
    id: "home-lunch",
    label: "🏠 Home Lunch",
    mealType: "lunch",
    items: [
      { id: "chicken-breast", qty: 1 },
      { id: "egg", qty: 3 },
      { id: "beef-slice", qty: 4 },
      { id: "enoki", qty: 1 },
      { id: "tomato", qty: 1 },
      { id: "eggplant", qty: 1 },
    ],
  },
  {
    id: "big-lunch",
    label: "💪 Big Lunch",
    mealType: "lunch",
    items: [
      { id: "chicken-breast", qty: 1 },
      { id: "chicken-thigh", qty: 1 },
      { id: "whey", qty: 1 },
      { id: "oats", qty: 1.5 },
    ],
  },
  {
    id: "whey-snack",
    label: "🥛 Whey + Banana",
    mealType: "snack",
    items: [
      { id: "whey", qty: 1 },
      { id: "banana", qty: 1 },
    ],
  },
  {
    id: "home-dinner",
    label: "🌙 Home Dinner",
    mealType: "dinner",
    items: [
      { id: "chicken-thigh", qty: 2 },
      { id: "egg", qty: 3 },
      { id: "enoki", qty: 1 },
      { id: "tomato", qty: 1 },
      { id: "eggplant", qty: 1 },
    ],
  },
];

export function presetsFor(mealType: MealType): MealPreset[] {
  return PRESETS.filter((p) => p.mealType === mealType);
}
