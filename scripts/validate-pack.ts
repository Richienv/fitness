// Validate a food CSV pack before it can be seeded.
//
//   npx tsx scripts/validate-pack.ts data/pack_jawa.csv [...more]
//
// Nutrition rows are easy to write and hard to write CORRECTLY, and a wrong
// number here becomes a wrong calorie count in someone's day. Every check
// below is deterministic and mechanical — it catches the failure modes that
// actually occur when a pack is authored by hand or generated:
//
//   * energy that contradicts its own macros (Atwater)
//   * macros that exceed 100g per 100g of food
//   * duplicate codes, which silently overwrite on upsert
//   * missing required columns, empty names, unparseable numbers
//   * portions that are absurd for a single serving
//
// Exits non-zero on any error, so it can gate a commit.

import { readFileSync, existsSync } from "node:fs";
import { parseFoodCsv, atwaterCheck } from "./foodCsv.ts";

type Problem = { file: string; code: string; kind: string; detail: string };

const REQUIRED = ["code", "name", "energy_kcal", "protein_g", "fat_g", "carb_g"];

/** Cooked dishes carry water and sauces, so the honest ceiling for a single
 *  serving is generous — this is a nonsense filter, not a nutrition opinion. */
const MAX_PORTION_G = 1500;
const MAX_KCAL_PER_100G = 900; // pure fat is 900; nothing edible exceeds it
/** Atwater must be off by at least this many kcal/100g before it counts as an
 *  error — see the note at the check itself. */
const ATWATER_MIN_ABS_KCAL = 20;

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: validate-pack.ts <csv> [csv...]");
    process.exit(2);
  }

  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const seenGlobal = new Map<string, string>(); // code -> file
  const seenNames = new Map<string, string>();
  let total = 0;

  for (const file of files) {
    if (!existsSync(file)) {
      problems.push({ file, code: "-", kind: "missing-file", detail: "no such file" });
      continue;
    }
    const raw = readFileSync(file, "utf8");
    const header = raw.split(/\r?\n/)[0] ?? "";
    for (const col of REQUIRED) {
      if (!header.split(",").map((h) => h.trim()).includes(col)) {
        problems.push({ file, code: "-", kind: "missing-column", detail: col });
      }
    }

    const rows = parseFoodCsv(raw);
    // Published reference tables are reported but not failed: their energy
    // figures come from the source's own conversion factors and can honestly
    // disagree with Atwater, and some rows omit a macro that was never
    // measured. Guessing a replacement would be worse than showing the gap.
    // Authoring errors in OUR packs still fail the build.
    const official = /tkpi_|usda_/.test(file);
    const bucket = official ? warnings : problems;

    for (const r of rows) {
      total++;
      const at = (k: string) => (r.nutrients as Record<string, number | null>)[k] ?? null;

      if (!r.code || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.code)) {
        problems.push({ file, code: r.code || "(blank)", kind: "bad-code", detail: "letters, digits, dot, underscore and hyphen only" });
      }
      if (!r.name || r.name.trim().length < 2) {
        problems.push({ file, code: r.code, kind: "bad-name", detail: "empty or too short" });
      }

      const prev = seenGlobal.get(r.code);
      if (prev) problems.push({ file, code: r.code, kind: "duplicate-code", detail: `also in ${prev}` });
      else seenGlobal.set(r.code, file);

      const nk = (r.name ?? "").trim().toLowerCase();
      const prevName = seenNames.get(nk);
      if (prevName) warnings.push({ file, code: r.code, kind: "duplicate-name", detail: `same name as a row in ${prevName}` });
      else seenNames.set(nk, file);

      const kcal = at("energy_kcal"), p = at("protein_g"), f = at("fat_g"), c = at("carb_g");
      if (kcal == null) bucket.push({ file, code: r.code, kind: "no-energy", detail: "energy_kcal is required" });
      for (const [k, v] of [["protein_g", p], ["fat_g", f], ["carb_g", c]] as const) {
        if (v == null) bucket.push({ file, code: r.code, kind: "no-macro", detail: `${k} is required` });
        else if (v < 0) bucket.push({ file, code: r.code, kind: "negative", detail: `${k}=${v}` });
        else if (v > 100) bucket.push({ file, code: r.code, kind: "over-100g", detail: `${k}=${v} per 100g` });
      }
      if ((p ?? 0) + (f ?? 0) + (c ?? 0) > 100) {
        bucket.push({ file, code: r.code, kind: "macros-exceed-mass", detail: `P+F+C = ${((p ?? 0) + (f ?? 0) + (c ?? 0)).toFixed(1)}g per 100g` });
      }
      if (kcal != null && (kcal < 0 || kcal > MAX_KCAL_PER_100G)) {
        bucket.push({ file, code: r.code, kind: "kcal-out-of-range", detail: `${kcal} kcal/100g` });
      }

      // The headline check: does the stated energy match its own macros?
      //
      // Relative error ALONE is the wrong test at the bottom of the range: a
      // 4 kcal drink declaring 4 against a computed 3 is "30% off" and
      // completely fine. Require a meaningful absolute gap as well, so the
      // check fires on real mistakes (a mistyped digit, a 10x macro) instead
      // of on rounding in things that barely contain energy.
      const bad = atwaterCheck({ code: r.code, energy_kcal: kcal, protein_g: p, fat_g: f, carb_g: c });
      if (bad && Math.abs(bad.declared - bad.computed) >= ATWATER_MIN_ABS_KCAL) {
        bucket.push({
          file, code: r.code, kind: "atwater",
          detail: `declared ${bad.declared} kcal vs ${bad.computed.toFixed(0)} from macros (${bad.diffPct.toFixed(0)}% off)`,
        });
      }

      const portion = r.portionGCooked;
      if (portion != null && (portion <= 0 || portion > MAX_PORTION_G)) {
        problems.push({ file, code: r.code, kind: "bad-portion", detail: `${portion}g` });
      }
    }
    console.log(`  ${file}: ${rows.length} rows`);
  }

  const byKind = new Map<string, number>();
  for (const p of problems) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);

  console.log(`\n${total} rows checked across ${files.length} file(s)`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 20)) console.log(`  WARN  ${w.file} ${w.code}: ${w.kind} — ${w.detail}`);
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`);
  }
  if (problems.length === 0) {
    console.log("\nOK — no errors.");
    process.exit(0);
  }
  console.log(`\n${problems.length} ERROR(S):`);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("");
  for (const p of problems.slice(0, 40)) console.log(`  ${p.file} ${p.code}: ${p.kind} — ${p.detail}`);
  if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
  process.exit(1);
}

main();
