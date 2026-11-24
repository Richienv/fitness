# Training adjusts what you can eat, and Home shows today's fat change (24 Nov 2026)

Richie: "Latihan must predict how much it burns and adjust our calorie count" and "make an estimate of how much weight goes down today from food, exercise and normal burn, for Richie and Renita, as the main feature on Home."

## 1. Latihan predicts the burn and adjusts the food target

**Predict.** `plannedWorkoutKcal` (lib/burn.ts) counts every planned set of a session through the same per-set estimate as a finished one. The Gym card shows "≈ N kkal" for the session you are about to do; the logger header shows "Terbakar ≈ done dari ≈ planned kkal", moving towards the plan as sets are logged. With Apple Health, its active energy replaces the estimate (`combineDay`, earlier release).

**Per-set calibration raised.** One gym set (with its rest and changeover) is now 45 s at MET 7 plus 105 s at MET 3, less the resting MET of 1 each: about 10 kcal for a chest set at 75 kg (was 6), ~4 kcal a minute. The old figure counted only 115 s per set and came out well under what a watch reports for a strength session.

**Adjust.** `lib/dayBudget.ts`. The daily targets already carry a typical amount of training (gym day = rest day + ~300 kcal, and both come from BMR × an activity multiplier), so adding the whole burn would count exercise twice. Rule:

```
earned = rest-day target + eatBack × active burn
bonus  = max(0, earned − today's own target), rounded to 10, at most 600 kcal
```

A normal gym day adds nothing; extra burn, or cardio on a rest day, adds up to `eatBack` of it, as carbs (like the existing carb cycle). `eatBack` is 0 / 50 % / 75 % (default 50 %), chosen on Latihan's "Hari ini" card ("Tambahkan kalori latihan ke target"), stored in settings (`exerciseEatBack`). Every screen that read `gymDay ? TARGETS.gymDay : TARGETS.restDay` now reads `dayTarget(date)` (lib/dayBudgetData.ts): Makan (ring, remaining, the food sheet), Home, the three dashboards, the weekly graph, the streak logic, the widget and the native bridge. Makan and Home say "Termasuk +N kkal dari latihan". The workout summary says what was added.

## 2. Home: "Perkiraan hari ini"

User and goal: Richie or Renita opens Home and wants one answer, "am I losing fat today, and why?". Done when the number is on screen without scrolling and the three causes are visible.

```
burn today = normal burn + exercise
fat change = (burn − food) / 7,700 kcal per kg
```

- **Normal burn**: Mifflin-St Jeor BMR (male and female constants, so each account gets its own) × 1.2 without a watch. With Apple Health, BMR plus the watch's active energy (which already includes everyday movement).
- **Exercise**: Latihan's number (Apple Health, or the estimates).
- **Food**: what is logged. Until about 21:36 the rest of the day is assumed eaten at the target ("kalau sisa makan sesuai target"), so the number means "if I stay on plan"; after that it is what was really eaten. "Sampai sekarang" shows the live food and the burn pro-rated to the time of day.
- **Output**: grams of fat (−68 g), the deficit in kcal, the weekly pace if every day were like this, and weeks to the goal weight at that pace (only when the pace points at it).
- The card says it is fat, not scale weight (water and food in the gut move the scale ±1 kg a day) and "Cara menghitung" lists the inputs. Without sex, height and age it asks for them instead of guessing.

States: profile missing, normal deficit, balanced (< 50 kcal: "≈ 0 g · seimbang"), surplus ("+N g · lemak naik"), day closing, past date.

## Verification

`lib/dayBudget.test.ts` (6), `lib/energyBalance.test.ts` (9), `lib/burn.test.ts` updated. On a test account at 375 px: Latihan card with 60 min of hard cycling on a rest day (target 2.000 → 2.420, the 75 % choice capped at +600), the same target on Makan and Home, Home's card with −68 g and the four-row breakdown.

## Limits

- Burn is an estimate (±20–30 %); the app says so. Apple Health makes it much better.
- Activities logged by hand live on the device (earlier decision), so the adjusted target can differ between two devices of the same account.
- Past days use the same rules with the data on this device.
