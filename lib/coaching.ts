// lib/coaching.ts — recommendations content rules (female-aware)
// Pure logic module. No React, no DOM, no DB.

import type { Goal } from "@/lib/settings";

// ── Supplements ─────────────────────────────────────────────────────────────

export type SuppVerdict = "recommended" | "conditional" | "waste";

export type Supplement = {
  id: string;
  name: string;
  verdict: SuppVerdict;
  note: string;
};

export const SUPPLEMENT_WHITELIST: Supplement[] = [
  {
    id: "whey",
    name: "Whey / Protein",
    verdict: "recommended",
    note: "Pelengkap kalau protein harian kurang — bukan wajib kalau makan sudah cukup.",
  },
  {
    id: "creatine",
    name: "Creatine",
    verdict: "recommended",
    note: "3–5 g/hari — air masuk ke otot, bukan bikin muka bengkak.",
  },
  {
    id: "vitaminD",
    name: "Vitamin D",
    verdict: "recommended",
    note: "Berguna kalau jarang kena matahari — bantu tulang & imun.",
  },
  {
    id: "iron",
    name: "Iron / Zat Besi",
    verdict: "conditional",
    note: "Hanya kalau defisiensi / haid berat — cek darah dulu, jangan asal.",
  },
  {
    id: "caffeine",
    name: "Caffeine (pre-workout)",
    verdict: "conditional",
    note: "Opsional — bantu fokus & tenaga latihan. Secukupnya, jangan tiap saat.",
  },
];

export const SUPPLEMENT_BLOCKLIST: Supplement[] = [
  {
    id: "fatBurner",
    name: "Fat Burner",
    verdict: "waste",
    note: "Buang-buang duit — nggak ada yang bakar lemak selain defisit kalori.",
  },
  {
    id: "bcaa",
    name: "BCAA",
    verdict: "waste",
    note: "Buang-buang duit kalau protein sudah cukup — sudah ada di whey/makanan.",
  },
  {
    id: "slimmingTea",
    name: "Teh Pelangsing",
    verdict: "waste",
    note: "Buang-buang duit — cuma efek pencahar, bukan turun lemak.",
  },
  {
    id: "detox",
    name: "Produk Detox",
    verdict: "waste",
    note: "Buang-buang duit — hati & ginjal sudah 'detox' gratis tiap hari.",
  },
  {
    id: "collagenDiet",
    name: "Collagen (buat diet)",
    verdict: "waste",
    note: "Buang-buang duit buat turun berat — bukan alat pelangsing.",
  },
];

/**
 * Case-insensitive lookup across both lists. Matches when the query equals the
 * id or appears as a substring of the id or name (or vice-versa). Returns the
 * first match, or null.
 */
export function supplementVerdict(nameOrId: string): Supplement | null {
  const q = nameOrId?.trim().toLowerCase();
  if (!q) return null;
  const all = [...SUPPLEMENT_WHITELIST, ...SUPPLEMENT_BLOCKLIST];
  for (const s of all) {
    const id = s.id.toLowerCase();
    const name = s.name.toLowerCase();
    if (
      id === q ||
      name === q ||
      id.includes(q) ||
      name.includes(q) ||
      q.includes(id) ||
      q.includes(name)
    ) {
      return s;
    }
  }
  return null;
}

// ── Coaching guardrails ─────────────────────────────────────────────────────

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export const MIN_CALORIES = 1400;

/** True when a calorie target dips below the safe floor. */
export function belowCalorieFloor(kcal: number): boolean {
  return kcal < MIN_CALORIES;
}

export const PROGRAM_LOCK_WEEKS = 8;

/**
 * Whole weeks elapsed since a program start date (YYYY-MM-DD or ISO / Date).
 * Returns 0 on invalid input or future start dates.
 */
export function weeksOnProgram(
  startISO: string,
  on: Date | string = new Date(),
): number {
  const start = new Date(startISO).getTime();
  const now = on instanceof Date ? on.getTime() : new Date(on).getTime();
  if (Number.isNaN(start) || Number.isNaN(now)) return 0;
  const weeks = Math.floor((now - start) / MS_PER_WEEK);
  return weeks > 0 ? weeks : 0;
}

/** Programs are locked for the first 8 weeks; only switchable at >= 8 weeks. */
export function canSwitchProgram(
  startISO: string,
  on: Date | string = new Date(),
): boolean {
  return weeksOnProgram(startISO, on) >= PROGRAM_LOCK_WEEKS;
}

/** Bahasa copy for the program-lock progress. */
export function programLockNote(weeks: number): string {
  const clamped = weeks < 0 ? 0 : weeks;
  if (clamped >= PROGRAM_LOCK_WEEKS) {
    return `Minggu ${clamped}/${PROGRAM_LOCK_WEEKS} — boleh ganti program sekarang.`;
  }
  return `Minggu ${clamped}/${PROGRAM_LOCK_WEEKS} — tahan dulu, jangan gonta-ganti program.`;
}

/**
 * Cardio cap: when chasing muscle gain / recomp, more than 4 cardio sessions
 * in a week starts eating into recovery.
 */
export function cardioCapExceeded(
  sessionsThisWeek: number,
  goal: Goal,
): boolean {
  const capped = goal === "muscle_gain" || goal === "recomp";
  return capped && sessionsThisWeek > 4;
}

export const DONTS: string[] = [
  "Nggak ada 'olahraga ngecilin lengan' — lemak turun dari defisit total.",
  "Angkat berat ≠ jadi gede/bulky buat cewek — justru itu yang bikin kencang.",
  "Jangan makan di bawah 1400 kkal — bukan cepat, tapi ngerusak metabolisme.",
  "Jangan gonta-ganti program tiap minggu — kasih waktu minimal 8 minggu.",
];

/** Deterministic pick from DONTS (no Math.random). */
export function randomDont(seed: number): string {
  const n = DONTS.length;
  const idx = ((Math.trunc(seed) % n) + n) % n;
  return DONTS[idx];
}
