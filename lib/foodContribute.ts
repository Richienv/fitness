"use client";

export type ContributePer100g = {
  kcal: number;
  protein?: number;
  fat?: number;
  carbs?: number;
};

/** Share a user-created food into the community catalogue so everyone can find
 *  it in search. Fire-and-forget (idempotent upsert by name server-side); a
 *  flaky call just means the food stays local until the next contribution. */
export function contributeFood(
  name: string,
  per100g: ContributePer100g,
  portionGrams?: number
): void {
  if (typeof window === "undefined") return;
  const clean = name.trim();
  if (!clean || !(per100g.kcal > 0)) return;
  fetch("/api/foods/contribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: clean, per100g, portionGrams }),
    keepalive: true,
  }).catch(() => {});
}
