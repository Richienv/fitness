# Richie Fitness Interactive App — Design Spec

## Overview

Transform the existing static `richie-3month-plan.html` into an interactive daily-use fitness companion app. Single self-contained HTML file, no dependencies, no build tools. Runs from USB drive in any browser.

**Target devices:** Mobile (gym use) + Desktop (home/school). Mobile-first responsive.  
**Data persistence:** localStorage for daily use + JSON export/import for backup and device transfer.  
**Architecture:** Single HTML file with all CSS and JS inline, organized with clear section markers.

---

## Existing Content (Unchanged)

All current tabs remain exactly as-is — they serve as the plan reference:

- Daily Blueprint (gym day + rest day schedules)
- Gym Split (5-day PPL split + progressive overload targets)
- Nutrition (macro targets, meal structure, supplements)
- Month 1 / Month 2 / Month 3 (weekly breakdown + goals)
- Do / Don't (discipline rules)
- What To Expect (progress timeline)

---

## New Features

### 1. Tracker Tab (Daily Dashboard) — Default Landing Page

The first thing Richie sees when opening the app.

**Top bar:**
- Gym Day / Rest Day toggle — switches macro targets and shows/hides gym-day-only items (whey shake, post-dinner bananas)
- Today's date + current week number (e.g., "Mon 7 Apr — WK 1 / 12")
- Week number auto-calculated from a configurable program start date

**Daily Checklist (non-negotiables):**
Tap-to-check boxes derived from the DO list:
- 3 eggs breakfast
- Creatine 10g
- 3L+ water
- Hit protein target (155g)
- Gym session (gym days only)
- Whey shake (gym days only)
- 7+ hours sleep (self-reported)

Visual completion indicator (progress bar or ring).

**Meal Tracker:**
5 meals listed: Breakfast (~250 kcal / 21g P), Lunch (~575 kcal / 67g P), Whey Shake (~120 kcal / 25g P, gym days only), Dinner (~650 kcal / 61g P), Post-dinner bananas (~180 kcal / 2g P, gym days only).

- Tap a meal to mark it eaten
- Running totals update live: calories / protein / carbs / fat vs daily target
- Macro progress bars fill in real-time
- Rest day: targets switch to 1,600-1,700 kcal, whey and bananas hidden

**Meal Editing:**
Tap an edit icon on any meal to adjust: change food items, portions, macros. Changes persist as the customized plan going forward.

**Data auto-saves** to localStorage whenever state changes.

---

### 2. Workout Tab (Active Gym Session)

Designed for speed — big tap targets, minimal typing, phone-friendly.

**Step 1 — Pick today's split:**
5 large buttons: Push A (Chest) / Pull A (Back Width) / Legs + Abs / Push B (Shoulder) / Pull B (Back Thickness).

App suggests the next split day in rotation based on last logged session.

**Step 2 — Exercise list loads:**
All exercises for the selected day appear in order with target sets x reps.

**Per exercise display:**
- Exercise name + prescribed sets/reps (e.g., "Bench Press — 4x8-10")
- Previous session column: last logged weight/reps shown grayed out for reference
- PR badge: all-time best weight x reps for that exercise
- Set input rows: large fields for weight (kg) + reps per set. Pre-filled with previous session values for quick editing.
- Optional notes field per exercise (collapse by default, tap to expand)

**Rest Timer (auto-start on set completion):**
- Triggers automatically when a set is logged (weight + reps saved)
- Pinned at top of screen, visible while scrolling
- Default: 60 second countdown with visual progress bar
- Quick-switch buttons: 60s / 90s / custom duration
- Audio beep on completion (with mute toggle)
- Tap to skip early
- Timer does NOT block interaction — can browse exercises while counting

**Progressive Overload Nudge:**
When all sets of an exercise hit the top of the rep range, display a green message: "All sets at target — add weight next session." If stuck 2+ sessions on same weight, suggest: "Consider deloading 10% and rebuilding."

**Session Summary (after completing all exercises):**
- Total volume (sets x reps x weight)
- Number of PRs hit this session
- Exercises completed count
- Auto-saves to workout history

**Workout History:**
Stored per split day, per date. Used to populate "previous session" and "PR" data. Accessible for review.

---

### 3. Journal Tab

Daily entries designed to take under 60 seconds.

**Date Navigation:**
Horizontal scrollable calendar strip at top. Today highlighted. Days with entries marked with a dot. Tap any date to view/edit.

**Entry Structure:**
- **Daily checklist** — auto-populated from Tracker data if used that day, otherwise manual checkboxes (same items as Tracker checklist)
- **Body weight** — number input, optional. Nudge to fill on Sundays per the weekly weigh-in rule.
- **Energy / Mood** — 1 to 5 scale, tap a number. Simple, fast.
- **Freeform notes** — text area for anything: workout thoughts, how meals went, what to adjust, motivation, etc.

**Weekly Auto-Summary (Sundays):**
When viewing a Sunday entry, auto-generated stats for that week:
- Gym sessions completed (x / 5)
- Average daily protein
- Checklist completion rate (%)
- Weight trend (if logged)
- Journal streak

---

### 4. Meal Plan Editor

Accessible from Tracker (per-meal edit) or from a dedicated settings area.

**Per meal, editable fields:**
- Meal name
- Food items (text)
- Calories (number)
- Protein grams (number)
- Carbs grams (number)
- Fat grams (number)

Changes update the base meal plan stored in localStorage. The Tracker tab reflects updated values. Macro targets (daily totals) recalculate automatically.

**Reset option:** Restore original meal plan from the hardcoded defaults.

---

### 5. Data Management & Settings

Located in a settings/gear section (bottom of page or dedicated panel).

**Program Start Date:**
Date picker. Used to auto-calculate current week (WK 1-12). Defaults to April 7, 2026.

**Export Data:**
Downloads a single JSON file containing: all journal entries, workout history, custom meal plan, checklist history, settings (start date, etc.).

**Import Data:**
Upload a JSON file. Merges or replaces data with confirmation prompt. Used for transferring between phone and laptop browsers.

**Clear All Data:**
Requires confirmation ("Type DELETE to confirm"). Resets localStorage to fresh state.

---

## UI/UX Constraints

- **Mobile-first:** All tap targets minimum 44x44px. Large input fields for gym use.
- **Dark theme:** Keep the existing dark aesthetic (--bg: #0a0a0a, accent colors).
- **Same fonts:** Bebas Neue, DM Sans, DM Mono — loaded from Google Fonts (with offline fallbacks).
- **Sticky nav:** Tab bar stays pinned at top on scroll.
- **No external dependencies:** No React, no framework, no CDN JS libraries. Pure vanilla HTML/CSS/JS.
- **Offline-capable:** Everything works without internet after fonts are cached.

---

## Data Schema (localStorage)

```
richie_settings: {
  programStartDate: "2026-04-07",
  defaultRestTimer: 60
}

richie_meals: {
  breakfast: { name, items, kcal, protein, carbs, fat },
  lunch: { ... },
  whey: { ... },
  dinner: { ... },
  postDinner: { ... }
}

richie_tracker: {
  "2026-04-07": {
    isGymDay: true,
    checklist: { eggs: true, creatine: true, ... },
    mealsEaten: { breakfast: true, lunch: true, ... }
  }
}

richie_workouts: {
  "2026-04-07": {
    splitDay: "push_a",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { weight: 60, reps: 8, notes: "" },
          ...
        ]
      }
    ],
    completedAt: "2026-04-07T18:45:00"
  }
}

richie_journal: {
  "2026-04-07": {
    checklist: { ... },
    weight: 72.5,
    energy: 4,
    notes: "Felt strong on bench today..."
  }
}

richie_prs: {
  "Bench Press": { weight: 80, reps: 6, date: "2026-06-15" },
  ...
}
```

---

## Navigation Structure

```
Tab bar (sticky):
[Tracker*] [Workout] [Journal] [Daily] [Split] [Nutrition] [M1] [M2] [M3] [Rules] [Expect] [Settings]

* Tracker is default landing tab
* Settings could be a gear icon instead of a text tab
```

Interactive tabs (Tracker, Workout, Journal) come first since they're daily-use. Reference tabs follow. Settings as a gear icon to save space.

---

## File Structure

Single file: `richie-app.html`

Internal organization:
```
<!-- ========== STYLES ========== -->
<style>
  /* Existing styles preserved */
  /* New interactive feature styles appended */
</style>

<!-- ========== HERO + NAV ========== -->
<!-- ========== TRACKER TAB ========== -->
<!-- ========== WORKOUT TAB ========== -->
<!-- ========== JOURNAL TAB ========== -->
<!-- ========== EXISTING TABS (unchanged) ========== -->
<!-- ========== SETTINGS PANEL ========== -->
<!-- ========== FOOTER ========== -->

<!-- ========== JAVASCRIPT ========== -->
<script>
  // --- DATA LAYER ---
  // --- TRACKER LOGIC ---
  // --- WORKOUT LOGIC ---
  // --- REST TIMER ---
  // --- JOURNAL LOGIC ---
  // --- MEAL EDITOR ---
  // --- EXPORT / IMPORT ---
  // --- INIT ---
</script>
```

The original `richie-3month-plan.html` is preserved as-is for reference. The new file `richie-app.html` contains everything.
