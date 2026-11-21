# R2·FIT: a Home worth opening first (20 Nov 2026)

Richie's goal, in his words: R2·FIT should be the first thing he wants to open each morning. He should see clearly where he is, his goals and his progress, using the animations the app already has.

This applies the motivation design that shipped in Yulu the same day (`r2-learn-chinese/docs/plans/2026-11-20-duo-practice-design.md`) to R2·FIT, without changing its data model or API. The brief came from the Yulu session with approval to build; pushing to `main` still waits for Richie.

## What he sees today (375 × 812, test data)

1. A large avatar, then three numbers: weight trend, kcal logged, protein logged. None has a target next to it, so 480 kcal could be good or bad.
2. Two filled buttons of equal weight ("Catat makan", "Mulai latihan") and a third link ("Catat berat"). Nothing says which matters now.
3. Streaks exist (`/api/streak`, Hermes briefings) but never appear in the app.
4. Logging a meal closes the sheet and the totals change. Finishing a workout shows a dark summary with confetti, but nothing says what the session moved: the week, the streak, a badge.
5. Badges are defined (`lib/badges.ts`) but no code writes `UserBadge` rows, so their progress is always 0.

## Layer 1: the psychology

| Need | Mechanism | Where it shows |
| --- | --- | --- |
| Start without friction | One filled button that names the next step | Home "next action" |
| See where you are | Today's kcal and protein against targets, as rings | Home HUD |
| Goal gradient | "118 g lagi", "2 dari 3 latihan", rings and bars that fill | HUD, week strip, next action hint |
| Daily cue, kind | Streaks counted from records; an empty today never breaks them; no guilt copy | HUD chips |
| Rest days are training | Workouts are counted in weeks, not days | HUD chip, celebration |
| Peak-end | After a log, a sheet counts up exactly what changed | Celebration sheet |
| Long arc | The avatar level, with a bar toward the target he chose | Avatar card |

## Layer 2: honesty rules

- Every number comes from records on the device (meals, workouts, measurements), the same data Home already reads. Server data reaches the device through `ServerSync`.
- Streak rules mirror `computeStreak` in `lib/hermes.ts`: a day counts when it has logged kcal (meals) or a weight (weigh-ins). Today can be empty without breaking the streak.
- Workouts count only completed sessions (the server receives only those). The workout streak counts **weeks** with at least one completed session, so a planned rest day never resets it. This is a display rule; `/api/streak` is untouched.
- Badge progress is shown only where the badge's own definition can be computed from records: KONSISTEN (meal streak / 30), PROTEIN KING (days at the protein target / 50), CENTURY (completed sessions / 100), IRON (sessions with a weighted set / 200). Runner, Marathon, Sunrise and Clean Eater are never shown as moving.
- Protein-target days use today's target settings for past days, since targets are not stored per day.
- The celebration shows a before and after computed from the stored records right before and right after the save (not from the page's state, which background sync can leave behind). Nothing is shown as changed unless it changed; a log that moves nothing (water, creatine at 0 kcal) gets the plain feedback instead of a sheet.
- "Latihan minggu ini" counts days with a completed session, the same unit as the week strip and the planned training days. CENTURY and IRON still count sessions.

## Layer 3: what we build

### 1. Home HUD

- **Streak chips:** catat makan (days), latihan (weeks), timbang (days). Each chip says whether today (or this week) is already covered: "aman hari ini" or "catat hari ini → 12". A zero reads "mulai hari ini".
- **Today rings:** one concentric ring, kcal outside and protein inside, with the numbers and what is left beside it. Target comes from the same place the Makan page uses (`getDaily(today).gymDay` and `TARGETS`).
- **Week strip:** Monday to Sunday. Each day's circle fills with that day's protein progress and shows a check when the target was met. A dot below marks a completed workout; a hollow dot marks a planned training day still open. No red marks for missed days.

### 2. Celebration after a log

A light bottom sheet (`ProgressCelebration`) after:

- saving food from the builder, racik or label scan, or a quick-log tap on the Makan page (today only; editing a past day keeps the existing toast);
- finishing a workout (it opens over the session summary, only right after "Selesai", never when viewing an old session).

It counts up, from before to after: protein and kcal (ring and "g lagi"), the streak that moved ("11 → 12 hari"), this week's workouts ("2 → 3 dari 3"), and the badge bars that moved. A check pops in; numbers use the existing `useAnimatedNumber` (now with an optional starting value).

### 3. One next action

A pure function picks a single filled button, in this order:

1. A workout in progress → **Lanjut latihan**.
2. Between 04:00 and 11:00 with no weight today, for someone who weighs in (a weight goal, or a weigh-in in the last 14 days) → **Timbang pagi ini** (feeds the weight trend and the avatar level).
3. The current main meal slot is empty → **Catat sarapan / makan siang / makan malam**. A snack is optional, so an empty snack slot never outranks the training day.
4. A training day without a completed workout → **Mulai latihan**.
5. Protein still short → **Catat makan**, with "N g protein lagi".
6. Otherwise → **Lihat progres** ("Hari ini lengkap").

Its hint is always a goal gradient: the streak it continues, the week count, or the protein left. Quiet text links below keep the other actions one tap away.

### Avatar

The level stays. A thin bar under it shows how far the chosen goal has come (`companionProgress().fraction`), with the weight trend and target when the goal is weight.

## Layer 4: motion

Transforms, opacity and SVG stroke offsets only, 160–700 ms, using the existing tokens (`--ease-out`, `--ease-spring`, `--dur-ring`). Rings fill from empty on Home and from the old value in the celebration. Everything sits behind `prefers-reduced-motion: no-preference`; with reduced motion the numbers appear at their final values and the sheet appears without sliding. Haptics stay as they are (`haptic("success")` on save; `haptic` already respects reduced motion).

## Data safety

- No storage key, record shape, Prisma model or API route changes.
- The only new storage is one `sessionStorage` entry that carries the "before" numbers from the workout logger to the summary page; it is deleted on the first read and ignored after two minutes, and it is not written when a session is finished a second time.
- `lib/store.ts` gains one read-only helper, `gymDayReader()`, which answers `getDaily(date).gymDay` for many dates from a single storage read.

## Verification plan

- Unit tests for the pure motivation module: streak rules (today empty, gaps, weeks), week strip, badge mapping, the before/after diff and the next action order.
- Existing test suite, typecheck and production build (`build:app`).
- Phone-width walkthrough on a local origin with test data only: Home in the morning and with everything done, logging a meal, finishing a workout, reduced motion.

## Not in this release

- Writing badge progress to the server (`UserBadge` rows), so friends see it.
- Restyling the dark workout summary to the light theme.
- A celebration after a weigh-in.
- Notifications or reminders.

## What shipped (20 Nov 2026)

- **Home HUD.** Three streak chips (catat makan in days, latihan in weeks, timbang in days). A chip's icon lights once today (or this week) is covered; otherwise it reads "catat → 12". Below them, one concentric ring (kcal outside, protein inside) with "N g protein lagi" in the middle, and a Monday-to-Sunday strip where each day's circle fills with protein and a dot marks a completed workout.
- **One next action.** A single filled button chosen by `nextAction()`: resume a workout, weigh in before 11:00, log the current meal slot, start the training day, close the protein gap, or "Lihat progres" when the day is complete. Its hint is always a goal gradient ("Catat makan beruntun jadi 12 hari", "Latihan ke-3 dari 3 minggu ini", "53 g protein lagi hari ini"). The other actions stay as quiet text links.
- **Avatar goal.** Under the level, a bar toward the chosen target, with the weight trend and target for a weight goal.
- **Celebration.** A light sheet after builder, racik, label and quick-log saves (today only) and right after "Selesai" in the workout logger. A check pops with a short spark burst; the rings fill from the old value; protein, kcal left, the streak (+1 when it moved), this week's workouts and any badge that moved count up. The log's own streak is always shown, static when unchanged.
- **Shared pieces.** `lib/motivation.ts` (pure, 19 tests), `lib/motivationData.ts` (reads the stores), `TodayRings`, `ProgressCelebration`, `HomeHud`, `NextActionCard`, `app/motivation.css`, four new line icons (flame, scale, check, medal). `useAnimatedNumber` gained an optional starting value and now always lands on the real number even when the page is hidden (it used to stay at the start value if frames stopped).
- **Small fixes on the way.** The English "Workout complete" toast is gone (the celebration replaces it). The Makan page and Home now share one meal-slot rule. Saving a workout never depends on the celebration snapshot.
- **After code review.** "Before" now comes from storage at save time (the food builder passes it up), so meals merged by background sync are never counted as part of this log. A 0 kcal log shows no sheet. The "Hari ini sudah aman" row appears only when today really counts. The week counts days, not sessions. No weigh-in prompt between midnight and 04:00. An empty snack slot no longer outranks the workout. A finished summary reopened later, or a session finished twice, never celebrates. Day flags are read once per snapshot. Hermes sessions with only a total volume count toward IRON. The sheet keeps focus on "Lanjut" and returns it on close, and its row delays now sit behind the reduced-motion check.

Verification: 27 new tests and the full suite (340 pass), typecheck, and `npm run build:app`. Walkthrough at 375 × 812 on a separate localhost origin with a test account and test data only: Home in the morning (weigh-in first), an open evening, logging a quick meal (streak 11 → 12, KONSISTEN 12/30), a builder save, crossing the protein target (PROTEIN KING 12/50), finishing a workout (2 → 3 of 3 this week, CENTURY 8/100; IRON did not move because the set had no weight), reopening that summary later (no celebration), and the completed day. A stylesheet check confirmed every new animation sits inside `prefers-reduced-motion: no-preference`.

## Follow-ups

- The morning action "Timbang pagi ini" opens the older English measurements page. A short Indonesian weigh-in sheet on Home, with the weigh-in streak in the same celebration, would make the first action of the day one tap.
- The dark workout summary still shows "MINGGU 47 / 12" (it uses the calendar week from `lib/workouts.ts`), and has not moved to the light theme.
- Badge progress is computed on the device only; nothing writes `UserBadge` rows, so friends still see 0.
