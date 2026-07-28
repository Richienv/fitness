// TAMBAHAN — the add-ons offered in the portion sheet.
//
// Each carries a FLAT macro delta applied once per tray entry, not scaled by
// portion: asking for extra sambal adds one spoon of sambal whether you're
// eating half a plate or three. Ordering a dish "dibakar bukan goreng" is the
// same idea in reverse, so deltas can be negative.
//
// `when` decides which add-ons a food is even offered — you don't put kerupuk
// in a coffee, and "tanpa gula" is meaningless on rendang.

export type FoodModCat = "protein" | "carb" | "vegetable" | "extra" | "drink" | string;

export type FoodMod = {
  key: string;
  label: string;
  /** Short "+90 kkal" / "−80 kkal" caption shown under the label. */
  note: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Which food categories this add-on makes sense for. */
  when: (cat: FoodModCat) => boolean;
};

const notDrink = (cat: FoodModCat) => cat !== "drink";
const isDrink = (cat: FoodModCat) => cat === "drink";
const isProtein = (cat: FoodModCat) => cat === "protein";

export const FOOD_MODS: FoodMod[] = [
  // ── additions ──
  { key: "minyak",       label: "Extra minyak",         note: "+90 kkal",  kcal: 90,  p: 0,  c: 0,   f: 10, when: notDrink },
  { key: "sambal",       label: "Extra sambal",         note: "+35 kkal",  kcal: 35,  p: 1,  c: 3,   f: 2,  when: notDrink },
  { key: "telur",        label: "Extra telur",          note: "+78 kkal",  kcal: 78,  p: 6,  c: 1,   f: 5,  when: notDrink },
  { key: "keju",         label: "Extra keju",           note: "+110 kkal", kcal: 110, p: 7,  c: 1,   f: 9,  when: notDrink },
  { key: "kuah",         label: "Pakai kuah",           note: "+45 kkal",  kcal: 45,  p: 2,  c: 3,   f: 3,  when: notDrink },
  { key: "kerupuk",      label: "Pakai kerupuk",        note: "+60 kkal",  kcal: 60,  p: 1,  c: 8,   f: 3,  when: notDrink },
  { key: "sayur",        label: "Extra sayur",          note: "+25 kkal",  kcal: 25,  p: 2,  c: 4,   f: 0,  when: notDrink },
  { key: "mayo",         label: "Saus mayo",            note: "+95 kkal",  kcal: 95,  p: 0,  c: 1,   f: 10, when: notDrink },
  { key: "saustomat",    label: "Saus tomat",           note: "+20 kkal",  kcal: 20,  p: 0,  c: 5,   f: 0,  when: notDrink },
  { key: "saustiram",    label: "Saus tiram",           note: "+30 kkal",  kcal: 30,  p: 1,  c: 6,   f: 0,  when: notDrink },
  { key: "kecap",        label: "Extra kecap",          note: "+35 kkal",  kcal: 35,  p: 0,  c: 9,   f: 0,  when: notDrink },
  { key: "bawang",       label: "Bawang goreng",        note: "+50 kkal",  kcal: 50,  p: 1,  c: 4,   f: 4,  when: notDrink },
  { key: "matah",        label: "Sambal matah",         note: "+70 kkal",  kcal: 70,  p: 1,  c: 3,   f: 7,  when: notDrink },
  { key: "mentega",      label: "Extra mentega",        note: "+75 kkal",  kcal: 75,  p: 0,  c: 0,   f: 8,  when: notDrink },
  { key: "garam",        label: "Extra garam",          note: "0 kkal",    kcal: 0,   p: 0,  c: 0,   f: 0,  when: notDrink },

  // ── how it's cooked / what's left out ──
  { key: "bakar",        label: "Dibakar, bukan goreng", note: "−80 kkal", kcal: -80, p: 0,  c: 0,   f: -9, when: isProtein },
  { key: "nokulit",      label: "Tanpa kulit",          note: "−45 kkal",  kcal: -45, p: 0,  c: 0,   f: -6, when: isProtein },
  { key: "nosantan",     label: "Tanpa santan",         note: "−70 kkal",  kcal: -70, p: 0,  c: -2,  f: -7, when: notDrink },
  { key: "sedikitminyak",label: "Minyak sedikit",       note: "−50 kkal",  kcal: -50, p: 0,  c: 0,   f: -6, when: notDrink },
  { key: "nomayo",       label: "Tanpa mayo",           note: "−95 kkal",  kcal: -95, p: 0,  c: -1,  f: -10, when: notDrink },
  { key: "nogaram",      label: "Tanpa garam",          note: "0 kkal",    kcal: 0,   p: 0,  c: 0,   f: 0,  when: notDrink },
  { key: "nosaus",       label: "Tanpa saus",           note: "−25 kkal",  kcal: -25, p: 0,  c: -5,  f: -1, when: notDrink },

  // ── drinks ──
  { key: "nogula",       label: "Tanpa gula",           note: "−60 kkal",  kcal: -60, p: 0,  c: -15, f: 0,  when: isDrink },
  { key: "sepgula",      label: "Gula setengah",        note: "−30 kkal",  kcal: -30, p: 0,  c: -8,  f: 0,  when: isDrink },
  { key: "nosusu",       label: "Tanpa susu",           note: "−45 kkal",  kcal: -45, p: -2, c: -5,  f: -2, when: isDrink },
  { key: "esbatu",       label: "Extra es",             note: "0 kkal",    kcal: 0,   p: 0,  c: 0,   f: 0,  when: isDrink },
];

export const MOD_BY_KEY: Record<string, FoodMod> = Object.fromEntries(
  FOOD_MODS.map((m) => [m.key, m])
);

/** The add-ons worth offering for a food of this category. */
export function modsFor(cat: FoodModCat): FoodMod[] {
  return FOOD_MODS.filter((m) => m.when(cat));
}

export type MacroDelta = { kcal: number; p: number; c: number; f: number };

export const NO_DELTA: MacroDelta = { kcal: 0, p: 0, c: 0, f: 0 };

/** Sum the chosen add-ons. Unknown keys are ignored rather than throwing, so a
 *  tray entry saved before a key was renamed still loads. */
export function modDelta(keys: readonly string[]): MacroDelta {
  return keys.reduce<MacroDelta>((a, k) => {
    const m = MOD_BY_KEY[k];
    if (!m) return a;
    return { kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f };
  }, { ...NO_DELTA });
}

/** "Ayam goreng · extra minyak, tanpa kulit" — the tray row's second line.
 *  Returns an empty string when nothing was added. */
export function modSummary(keys: readonly string[]): string {
  return keys
    .map((k) => MOD_BY_KEY[k]?.label.toLowerCase())
    .filter((l): l is string => !!l)
    .join(", ");
}
