# Spec — Customizable portions & calories (Food Builder + Quick Logs)

## Problem
Users can't set a precise portion. In the Food Builder the quantity only moves in
0.5-unit steps (= 50 g for database foods), so "300 g" is awkward and "30 g" is
impossible. There's no way to **type** an exact gram amount, no way to edit a
serving's calories and have the macros stay consistent, and Quick Logs can't be
scaled by portion at all. Goal: let the user set **any** portion (e.g. 300 g,
30 g, 1.5 butir) or **any** calorie target, and always keep grams ↔ kcal ↔ P/C/F
mathematically consistent from a single source of truth.

## Source of truth: per-100 g (or per-piece) density
Every food already carries a density:
- DB foods: `gramsPerUnit = 100`, and `kcal/protein/fat/carbs` are **per 100 g**.
- Count foods (telur, etc.): `gramsPerUnit = 55`, macros are **per piece**.

Rule for the whole feature: **macros are always derived**, never stored
independently of the portion:

```
factor      = grams / gramsPerUnit          // = "units"
kcal(shown) = density.kcal   * factor
protein     = density.protein * factor
fat         = density.fat     * factor
carbs       = density.carbs   * factor
sugar       = density.sugar   * factor       // when present
```

There is exactly one editable "anchor" at a time (grams **or** kcal); the other
values are recomputed. This is what "still match the calculation" means.

---

## Part A — Food Builder portion (`app/meal/FoodBuilder.tsx`)

### A1. Portion is grams-first and free-typed
- Replace the 0.5-unit stepper as the *only* control. Each selected item gets a
  **numeric portion input**:
  - Gram-based foods (`gramsPerUnit === 100`, unit "100 g"): the field is **grams**,
    integer ≥ 1, accepts any value (30, 137, 300…). Display suffix "g".
  - Count-based foods (unit like "1 butir"): the field is **pieces**, accepts one
    decimal (e.g. 1.5). Display suffix = the unit noun.
- Keep the `+`/`−` buttons for quick nudges but make them **gram-aware**:
  - gram foods: ±10 g (long-press or a second pair ±50 g optional, not required).
  - count foods: ±0.5 piece.
- Remove the hard dependency on `step: 0.5`. Introduce a per-food `stepGrams`
  (default 10 for gram foods) OR keep `step` but interpret the typed field in the
  food's natural unit and convert to `qty` (`qty = grams / gramsPerUnit`). Store
  `qty` rounded to 3 decimals (not 2) so 30 g → 0.3 units survives.
- The existing grams/units display toggle (`toggleGrams`) becomes redundant for the
  typed field; keep it only if it still reads well, otherwise remove.

### A2. Editing calories keeps macros consistent
In the edit sheet (`openEdit`/`editSave`, the `Editing` type), support **typed**
numeric entry (not just +/-), and make two anchors explicit:

1. **Portion (grams / pieces)** — the primary field. Changing it recomputes kcal +
   all macros from density. (Same math as A's `factor`.)
2. **Total calories for this serving** — optional convenience. When the user types a
   kcal target, back-solve the portion at the current density and rescale macros
   with it:
   ```
   grams = kcalTarget / density.kcal * gramsPerUnit    // density.kcal > 0
   ```
   Then recompute P/C/F from the new grams. If `density.kcal === 0` (unknown
   energy), fall back to editing kcal only and leave a note; do not divide by zero.
3. **Per-100 g density fields** — still editable (typed) for foods whose DB numbers
   are wrong or for custom foods. Editing density recomputes the serving from the
   current grams. Keep these clearly separated ("per 100 g") from the serving
   totals so the two don't get confused.

All four numeric inputs accept typed values (min 0), each with small +/- helpers.
Round display to 0.1; keep full precision internally.

### A3. Save path (`saveBuilderMeal`)
- Library ingredient **without** override and a whole-unit qty → keep the compact
  `{ id, qty }` reference (unchanged).
- Any custom portion (typed grams, overridden macros/density) → snapshot as
  `CustomMealItem` with `grams` and the **computed** macros for that portion (the
  code already multiplies by qty; just make sure it uses the new fractional qty).
- Verify the day totals + the meal list render the fractional grams correctly.

---

## Part B — Quick Logs (`lib/quicklog.ts`, `app/meal/MealHome.tsx`)

Quick Logs are fixed macro snapshots today. Add optional portion scaling without
breaking existing entries.

### B1. Data model (`QuickLogEntry`)
Add optional, backward-compatible fields:
```
baseGrams?: number     // the portion the stored macros correspond to (e.g. 250)
// (kcal/protein/carbs/fat stay as the macros AT baseGrams)
```
Entries without `baseGrams` behave exactly as now (fixed macros). Migration: none
needed — treat missing `baseGrams` as "fixed."

### B2. Editor (the `editDraft` sheet)
- Keep the existing typed `NumField`s for kcal/P/C/F.
- Add a **PORSI (g)** field bound to `baseGrams`.
- Add a **"kunci rasio"** (lock ratio) toggle. When on and the user edits either
  `PORSI` or `KKAL`, rescale the other macros proportionally so ratios hold:
  - edit grams → `scale = newGrams / oldGrams`; multiply kcal + P/C/F by `scale`.
  - edit kcal  → `scale = newKcal / oldKcal`; multiply grams + P/C/F by `scale`.
  When off, fields are independent (current behavior).
- Validate: grams ≥ 0, kcal ≥ 0; guard divide-by-zero on empty base.

### B3. Logging a quick entry (`logQuick`)
- Log the entry's current macros as-is (unchanged) and set `grams: e.baseGrams ?? 0`
  in the logged item so the day shows the portion.
- (Optional, nice-to-have) long-press a quick tile → "log with custom grams": prompt
  a grams value, scale macros by `grams / baseGrams`, log the scaled result. Only if
  `baseGrams` is set. Mark clearly as optional in the PR.

---

## Calculations — worked examples (use as test cases)
Assume Ayam Goreng density = 270 kcal / 25 P / 17 F / 12 C per 100 g.
1. Type **300 g** → factor 3.0 → 810 kcal / 75 P / 51 F / 36 C.
2. Type **30 g** → factor 0.3 → 81 kcal / 7.5 P / 5.1 F / 3.6 C. (must be reachable —
   impossible today.)
3. Type **kcal = 400** (lock ratio) → grams = 400/270*100 = 148 g →
   ~37 P / 25.2 F / 17.8 C.
4. Egg (55 g/piece, 78 kcal each): type **1.5** → 117 kcal.
5. Quick Log "Nasi + Ayam" baseGrams 350, 600 kcal; edit grams→400 (lock) →
   scale 1.143 → 686 kcal and macros ×1.143.

## Edge cases
- `density.kcal === 0` or null → disable "edit by kcal"; portion editing still works.
- Empty/NaN input → treat as 0, don't crash; block save of a 0 g / 0 kcal item
  (or drop it, matching current `qty <= 0` skip).
- Very large values → cap at a sane max (e.g. 5000 g) to avoid fat-finger totals.
- Rounding: store 3-dp internally, display 0.1; never let display rounding feed back
  into stored values (avoid drift on repeated edits).
- Count foods: don't show a grams field labeled "g"; use the piece unit.

## Out of scope (call out in PR)
- Barcode / gram scale integration.
- Changing the multi-step builder flow itself.
- Server-side schema changes (Quick Logs are local-first; `CustomMealItem`
  already carries `grams`).

## Acceptance criteria
- [ ] Can type any gram value (incl. 30 g and 300 g) for a DB food and see macros
      scale correctly; day totals update.
- [ ] +/- nudges move by 10 g (gram foods) / 0.5 piece (count foods), not 50 g.
- [ ] Edit sheet: typing kcal (lock on) back-solves grams + macros consistently;
      typing grams recomputes kcal + macros.
- [ ] Quick Log editor has a PORSI field + lock-ratio; editing grams or kcal keeps
      ratios; entries without baseGrams still work.
- [ ] No divide-by-zero; 0-value items can't be saved; `tsc` + tests green.
