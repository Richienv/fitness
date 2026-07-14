# UX Audit — Navigation, Back Button & Layouts (Jul 2026)

## What was broken (now fixed in this PR)

### 1. Hardware/browser back exited the page instead of closing overlays ✅ FIXED
No `popstate` handling existed anywhere. On a phone, pressing back with any
sheet open (Food Builder, quick-log editor, date picker, measurement sheet,
swap-exercise sheet…) left the entire page — the single biggest mobile-nav
complaint. Fixed with `lib/backSheet.ts` (`useSheetBack`), wired into:

| Surface | Overlays now back-closable |
| --- | --- |
| Food Builder | whole wizard: inner edit/new-group sheet → previous step → close |
| Makan home | date picker, quick-log manage sheet, entry editor, meal picker |
| Meal builder (legacy) | food modal |
| Latihan home | custom-session modal |
| Session logger | swap-exercise + exercise-detail sheets |
| Tidur | log sheet |
| Progress | measurement sheet |

Nested sheets close top-first (entry editor closes before the manage sheet).
Inside the Food Builder, back steps the wizard backwards before exiting —
mirroring the on-screen ← button.

### 2. Back-link labels were inconsistent ✅ FIXED
Mixed English/Indonesian and mixed conventions ("← Back", "← Kembali",
"← HOME", "← WORKOUT"). Now every back link says **where it goes**, in
Bahasa, matching the bottom-nav names: `← BERANDA`, `← MAKAN`, `← LATIHAN`,
`← STATS`.

## Current navigation map

```
BottomNav (always visible): BERANDA · TIDUR · [OS] · STATS · SET
BERANDA ──▶ /workout (card)   ──▶ session/[id] ──▶ complete
        └─▶ /meal (card)      ──▶ FoodBuilder overlay / meal/[type] / confirm
STATS   ──▶ today · week · gym · progress · checklist
```

## Findings & recommendations (not yet implemented)

### A. MAKAN and LATIHAN are missing from the bottom nav — HIGH impact
The two most-used sections are reachable **only** via Beranda cards. From
Stats or Tidur you must go Home first (2–3 taps to log a meal). Options:

1. **(Recommended)** `BERANDA · MAKAN · [OS] · LATIHAN · STATS`, moving
   TIDUR and SET onto Beranda (sleep card + gear icon in the header).
   4 tabs = comfortable tap targets, and the daily loop (eat/train/check)
   is always one tap away.
2. Keep 4 current tabs, squeeze to 6 (`BERANDA·MAKAN·TIDUR·[OS]·LATIHAN·STATS·SET`
   is 6+OS = too cramped at ~55 px/tab on a 390 px phone; not recommended).

Blocked on a product call — Beranda currently has **no** sleep/settings
links, so those entry points must be added before removing the tabs.

### B. Session logger exit is risky — MEDIUM
`← KEMBALI` during a live workout leaves the session with no confirmation.
The session survives (resume pill on Latihan home), but users don't know
that. Recommend: a tiny "Sesi tersimpan — lanjutkan kapan saja" toast on
leave, or an explicit pause/exit affordance.

### C. Long single-column scrolls on data pages — MEDIUM
`STATS → today/week/progress` are tall single columns; key numbers sit below
the fold on small phones. Recommend: 2-col stat tiles for the summary row
(as gym page already does) and collapse-by-default for历史 sections.

### D. Food Builder step bar isn't tappable — LOW
The 5-segment progress bar at the top looks interactive but isn't; users try
to tap segments to jump steps. Recommend making each segment a button
(`goStep(i)`) — selections already persist across steps.

### E. Double back-affordance on sub-pages — LOW
Sub-pages show both a `← STATS` link (top-left) and the highlighted STATS
tab (bottom). Harmless, but the top link could become a page title breadcrumb
("STATS / MINGGU") to reclaim vertical space.

### F. `/meal` has no top back link — by design, fine
Makan is a hub reached from Beranda; bottom nav covers escape. No change.

## Design conventions going forward
- Every dismissable overlay must call `useSheetBack(open, close)`.
- Back links: `← <DESTINATION>` in Bahasa, `back-link`/`sub-back` class.
- Full-screen flows (builder, logger) own their internal back stack;
  hardware back must never skip more than one level.
