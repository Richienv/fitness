// The example plates shown on the empty RACIK screen.
//
// They live here, not inline in the component, because an example that does
// not work is worse than no example — it teaches the user the feature is
// broken. scripts/racikExamples.test.ts runs every one of these through the
// real parser against the real catalogue and fails if any stops producing a
// RACIK card.
//
// That test has already earned its place: the first example written here was
// "mie kuning ikan cakalang sambal", which scores 0.56 confidence — under the
// 0.6 gate, so no card at all — and parses "kuning" as "Kuning Telur Rebus",
// egg yolk. It looked perfectly reasonable in the diff.
//
// Note for anyone adding one: a plate the catalogue already has as a SINGLE
// row is not a valid example. "mie cakalang" is a real food here, so the
// parser correctly refuses to split it and no card appears. Pick combinations
// that genuinely have no row of their own.
export const RACIK_EXAMPLES = [
  "nasi ayam goreng sambal",
  "roti telur keju",
  "nasi telur dadar",
] as const;
