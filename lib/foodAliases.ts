// Search alias map for the food catalogue. Keys and values are already in the
// normalized form the search route uses (lowercase, diacritics stripped,
// hyphens generally omitted — Indonesian users tend to type "gado gado", not
// "gado-gado"). When a normalized query matches a key exactly, its canonical
// forms are added as extra terms so trigram/prefix search can find the entry.
//
// This is intentionally a plain object of string[] so it stays trivially
// editable and testable without a DB.

export const FOOD_ALIASES: Record<string, string[]> = {
  // steamed fish/tofu dumpling
  siomay: ["siomay", "somay", "siomai"],
  somay: ["siomay", "somay", "siomai"],
  siomai: ["siomay", "somay", "siomai"],
  // grilled skewers
  sate: ["sate", "satay", "satai"],
  satay: ["sate", "satay", "satai"],
  satai: ["sate", "satay", "satai"],
  // peanut-sauce veggie salad
  "gado gado": ["gado gado", "gado-gado", "gadogado"],
  "gado-gado": ["gado gado", "gado-gado", "gadogado"],
  gadogado: ["gado gado", "gado-gado", "gadogado"],
  // hamburger steak / minced-beef patty
  "hamburg steak": ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  "salad hambug": ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  hambug: ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  // fried rice
  "nasi goreng": ["nasi goreng", "nasgor"],
  nasgor: ["nasi goreng", "nasgor"],
  // meatball soup
  bakso: ["bakso", "baso"],
  baso: ["bakso", "baso"],
};

/**
 * Expand a normalized query into itself plus any alias canonical forms.
 * Always includes the original query first. De-duplicates.
 */
export function expandAliases(normalizedQuery: string): string[] {
  const terms = new Set<string>([normalizedQuery]);
  const aliases = FOOD_ALIASES[normalizedQuery];
  if (aliases) for (const a of aliases) terms.add(a);
  return [...terms];
}
