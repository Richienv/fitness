# Latihan: a clear gym flow, how-tos, and what each activity burns (21 Nov 2026)

Richie: "aku nggak tahu kalau udah diklik, contohnya besarin dada … hari ini aku mau nge-gym pencet apa … tujuannya aku bisa tahu hari ini jalan berapa (Apple Watch) … kalau nge-gym push dada atau bagian apapun, dulu ada … tutorialnya juga dulu ada … 3 bicep curl bakar berapa kalori, perhitungannya jelas di akhir, dimasukin totalnya … sepeda berapa, langkah berapa, push up berapa, harus bisa dicatat dengan gampang."

## Step 1: user and goal

```
Who:        Richie, recomp, trains Mon/Wed/Fri plus walking and cycling; phone at the gym
Jobs:       (1) start today's gym session without thinking; (2) log steps, cycling, push-ups
            in seconds; (3) know roughly what today burned, per activity and in total;
            (4) see which muscles he trained this week and how to do an exercise
Done when:  he taps one obvious button to train, and the day's burn has a believable number
Frequency:  daily (activity), 3–4x a week (gym)
```

## Where it went wrong (layers)

| Symptom | Layer |
|---|---|
| "Pencet apa?" | 3 + 4: the day chips, a statement card, a "MULAI" button inside it, a "MINGGU INI" list, a "CATAT BEBAS / CARI / ALAT" line and "SESI SAYA" all compete. On a rest day there is no start at all. |
| "Nggak tahu kalau udah diklik" | 5 + 8: done sessions are grey uppercase text with a small ✓; selected and done look alike; no words for state. |
| Muscle map and how-to "hilang" | 2: `WorkoutCalendar`, `SessionSilhouette` and the sets-per-muscle logic still exist but nothing renders them; the how-to lives behind a small "ⓘ CARA" chip inside the logger. |
| No burn, no steps, no cycling | 1: the app has no activity record and no expenditure estimate at all. |

## Step 2: flow and clicks

- Start today's gym: 1 tap ("Mulai latihan: Besarin dada"). Rest day: "Tetap mau latihan?" lists the sessions, 2 taps.
- Log steps / cycling / push-ups: "+ Catat aktivitas" → pick the kind → type the number → Simpan (3 taps and one number); the estimate shows before saving.
- How-to for an exercise: "Cara" next to it on Latihan (1 tap).

## Step 3: hierarchy (375 px)

```
Latihan
[Hari ini]   ≈ 420 kkal terbakar (perkiraan)
             Gym · Besarin dada 6 latihan · ≈ 210 kkal
             Langkah 6.200 · ≈ 270 kkal
             Sepeda 30 menit · ≈ 190 kkal          [×]
             [+ Catat aktivitas]
[Gym]        Hari ini: Besarin dada   (Senin · 6 latihan)
             [ Mulai latihan ]                      ← the one primary
             Bench Press · 4 set               Cara
             …
             Minggu ini: Sen Besarin dada  Selesai ✓ / Rab Lebarin punggung  Belum / …
             Otot minggu ini: Dada 13 set ▇▇▇  Punggung 9 ▇▇ …
[Sesi saya]  (unchanged)   · Catat bebas · Cari alat
```

## Step 4: states

| Region | Empty | Done | In progress |
|---|---|---|---|
| Hari ini | "Belum ada aktivitas. Catat langkah, sepeda atau push-up." | rows with kcal each | gym in progress shows "Sedang berlangsung" |
| Gym today | rest day: "Hari istirahat" + "Tetap mau latihan?" | "Selesai ✓" + "Lihat ringkasan" + "Ulangi" | "Lanjutkan latihan" as the primary |
| Week list | "Atur hari latihan di Pengaturan" | "Selesai" with ✓ and the date | "Hari ini" pill |

## The burn estimate (lib/burn.ts)

All numbers are estimates and say so ("perkiraan"). They are **active** calories, like Apple Watch's "Active Energy": what the body burns on top of resting, because the daily target already counts resting energy (a first version used gross numbers; switched before shipping). Body weight: the latest logged weight, else the profile, else 70 kg.

- **Minutes-based** ((MET − 1) × kg × hours, Compendium of Physical Activities): jalan 3.0 / 3.8 / 5.0, lari 7.0 / 9.8 / 11.5, sepeda 4.0 / 6.8 / 10.0, renang 5.8 / 8.3 / 9.8, plank 3.8 (santai / sedang / berat).
- **Steps**: 0.00039 active kcal per step per kg (≈ 0.03 kcal per step at 73 kg; 0.04 gross).
- **Reps**: push-up 0.0065, sit-up 0.0045, squat 0.0055, pull-up 0.012, burpee 0.015 kcal per rep per kg.
- **Gym sets**: one set ≈ 40 s of work at MET 6 plus 75 s of rest at MET 2 (each less the resting MET 1), times body weight, scaled by the main muscle: legs 1.3, chest/back 1.0, shoulders 0.9, arms/calves/abs 0.7. At 75 kg a chest set is ≈ 6 kkal; 3 sets of bicep curls ≈ 12 kkal. Only sets with reps count.

The daily targets already include a typical activity level, so this burn is shown on its own and is **not** added to "kkal tersisa".

## What shipped (21 Nov 2026)

- **"Hari ini" card** (`app/workout/TodayBurn.tsx`): "≈ N kkal aktif terbakar" with every source listed and its own estimate: today's gym sessions (from their logged sets) and each logged activity, each removable. "+ Catat aktivitas" opens a sheet (`ActivitySheet.tsx`): pick Langkah, Jalan kaki, Lari, Sepeda, Renang, Plank, Push-up, Sit-up, Squat, Pull-up or Burpee; type the number or tap a preset (10.000 langkah, 30 menit, 20 kali); pick santai / sedang / berat for timed ones; the estimate shows live before saving. Stored on the device (`lib/activity.ts`, key `richie.activity.v1`); not synced to the server yet.
- **"Gym" card**: today's session with its exercises and one obvious primary ("Mulai latihan", or "Lanjutkan latihan" when one is open). A finished session says "Selesai minggu ini" with "Lihat ringkasan" and "Ulangi". A rest day says so and points to the week list. "Minggu ini" lists the training days with their state in words (Selesai ✓ / Hari ini / Belum); tapping one selects it (accent outline, `aria-pressed`) and the card switches to it with "Mulai {sesi}". "Otot minggu ini" shows sets per muscle group over 7 days as bars (the existing `setsByMuscleThisWeek`, which nothing rendered any more). "Catat bebas", "Buat sesi sendiri" and "Alat gym" stay as quiet links.
- **"Cara" on every exercise** (`ExerciseGuide.tsx`): the demo frames, the main and supporting muscles, where to feel it, the form steps, the common mistakes, and a video search. These came from `lib/exerciseData.ts` and used to be reachable only from the logger.
- **Session summary**: "Kalori aktif terbakar ≈ N kkal" with one line per exercise ("Squat · 1 set ≈ 8 kkal") and how it was estimated.
- **Bug fixed: modals on Latihan and in the logger opened below the screen.** `.page-rise` kept its entrance animation filling (`both`); a filling transform animation makes the element a containing block for fixed children even when the value is `none`. "Buat sesi sendiri" opened at 889–1669 px on an 812 px screen. The rule now fills `backwards` only, which releases the page after the 0.24 s entrance; the new sheets also render into `<body>`.

Verification: `lib/burn.test.ts` (5 tests), full suite 377 pass, typecheck, `npm run build:app`, `ui_lint.py` 0 errors on the new files. At 375 px with test data: an empty day, logging 30 min cycling (≈ 220 kkal) and 6.200 steps (≈ 183 kkal), selecting Senin, opening "Cara" for Bench Press, "Buat sesi sendiri" now on screen, and the summary breakdown.

## Not in this release

- **Apple Health / Apple Watch import** (steps, active energy, workouts). Needs a HealthKit plugin in the iOS (Capacitor) app, the Health entitlement and a device build; it would write into the same activity list. *Update, same day:* steps and active energy now arrive through an iPhone Shortcut instead; see `2026-11-21-apple-health-shortcut.md`. Workouts are still not imported.
- Syncing activities to the server (needs a model and an API).
- Restyling the dark "Buat sesi sendiri" modal, the logger and the summary to the light theme; the summary still says "MINGGU 47 / 12".
- Burn per set inside the logger while training (the summary has it).
