# Richie Fitness Interactive App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file interactive fitness companion app with daily tracking, workout logging with rest timer, journal, and meal editing — all persisted in localStorage with JSON export/import.

**Architecture:** Single `richie-app.html` file. All CSS inline in `<style>`, all JS inline in `<script>`. No frameworks, no build tools, no external JS dependencies. Google Fonts for typography. Dark theme matching existing design.

**Tech Stack:** Vanilla HTML5, CSS3, JavaScript (ES6+). localStorage for persistence. Web Audio API for timer beep.

---

### Task 1: Scaffold — Base HTML structure + CSS + Data Layer

**Files:**
- Create: `richie-app.html`

Build the complete file skeleton: all CSS (existing + new), updated nav with new tabs, hero with week indicator, empty tab containers, footer, and the entire data layer (localStorage read/write, default meal data, export/import functions).

- [ ] **Step 1:** Create `richie-app.html` with full `<head>`, CSS variables, all existing styles from `richie-3month-plan.html`, plus new styles for: tracker checklist, meal cards, workout inputs, rest timer, journal calendar strip, settings panel, modal overlays, mobile responsive breakpoints.

- [ ] **Step 2:** Add hero section with dynamic week indicator (WK X / 12), updated nav bar with new tabs (Tracker, Workout, Journal first, then existing tabs, Settings gear icon last).

- [ ] **Step 3:** Add empty `<div>` containers for each tab content section.

- [ ] **Step 4:** Add the `<script>` block with the complete data layer:
  - `DB` object: `load(key)`, `save(key, data)`, `exportAll()`, `importAll(json)`, `clearAll()`
  - Default meal plan constants (breakfast, lunch, whey, dinner, postDinner with kcal/protein/carbs/fat)
  - Default gym split constants (all 5 days with exercises, target sets, target rep ranges)
  - `getToday()` date helper, `getWeekNumber(startDate)` helper
  - `showTab(id)` function (updated from original)
  - App init function that loads settings and renders the default tab

- [ ] **Step 5:** Add all existing tab HTML content (Daily Blueprint, Gym Split, Nutrition, Month 1-3, Rules, What To Expect) — copied directly from `richie-3month-plan.html`.

- [ ] **Step 6:** Open in browser, verify: nav works, all existing tabs render correctly, week indicator shows, dark theme intact.

---

### Task 2: Tracker Tab — Daily Dashboard

**Files:**
- Modify: `richie-app.html` (tracker tab HTML + tracker JS section)

- [ ] **Step 1:** Build the Tracker tab HTML inside its container:
  - Top bar: date display + Gym Day / Rest Day toggle switch
  - Daily checklist section: 7 checkbox items (eggs, creatine, water, protein, gym, whey, sleep) — gym/whey items get `data-gymonly` attribute
  - Completion progress bar
  - Meal tracker section: 5 meal cards (each with name, items description, macro summary, check-off button, edit icon) — whey/postDinner get `data-gymonly`
  - Running macro totals bar: 4 progress bars (calories, protein, carbs, fat) with current/target labels

- [ ] **Step 2:** Write Tracker JS:
  - `renderTracker()`: reads today's tracker data from localStorage (or creates fresh), renders checklist state, meal eaten state, updates macro bars
  - `toggleGymDay()`: flips gym/rest day, shows/hides gym-only elements, updates macro targets (2200 vs 1650 kcal), saves state
  - `toggleChecklist(key)`: toggles a checklist item, updates progress bar, saves
  - `toggleMealEaten(mealKey)`: marks meal eaten/uneaten, recalculates running totals, animates macro bars, saves
  - `updateMacroBars()`: calculates sum of eaten meals' macros, updates bar widths and labels
  - `updateCompletionBar()`: calculates % of checked items, updates progress bar

- [ ] **Step 3:** Wire up event listeners, test in browser: toggle gym/rest day, check items, mark meals eaten, verify macro bars update live, verify data persists on page reload.

---

### Task 3: Meal Editor Modal

**Files:**
- Modify: `richie-app.html` (modal HTML + meal editor JS)

- [ ] **Step 1:** Build a reusable modal overlay component (HTML + CSS):
  - Dark semi-transparent backdrop
  - Centered card with title, content area, action buttons
  - Close on backdrop click or X button
  - `openModal(title, contentHtml, onSave)` and `closeModal()` JS functions

- [ ] **Step 2:** Build meal editor form:
  - `openMealEditor(mealKey)`: populates modal with current meal data (name, items, kcal, protein, carbs, fat) in input fields
  - Save button: validates numbers, updates `richie_meals` in localStorage, re-renders tracker
  - Reset button per meal: restores that meal to hardcoded default
  - "Reset All Meals" button in settings

- [ ] **Step 3:** Test: edit a meal's calories, save, verify tracker shows new values, reload page and verify persistence. Reset and verify defaults restore.

---

### Task 4: Workout Tab — Split Selection + Exercise Logging

**Files:**
- Modify: `richie-app.html` (workout tab HTML + workout JS)

- [ ] **Step 1:** Build workout tab HTML:
  - Split selection screen: 5 large buttons (Push A, Pull A, Legs, Push B, Pull B) with suggested next day highlighted
  - Active workout screen (hidden initially): rest timer bar pinned at top, exercise list below
  - Per exercise: name + target, previous session data column, PR badge, set input rows (weight kg + reps fields, pre-sized for mobile), notes toggle, progressive overload nudge area
  - Session summary card (hidden until workout complete): volume, PRs, exercise count, finish button

- [ ] **Step 2:** Write workout data/state JS:
  - `GYM_SPLITS` constant: all 5 days with exercise names, target sets, target rep ranges
  - `getLastWorkout(splitDay)`: finds most recent workout for that split from `richie_workouts`
  - `getPR(exerciseName)`: reads from `richie_prs`
  - `updatePR(exerciseName, weight, reps)`: updates PR if new best (weight comparison, then reps if equal weight)
  - `getSuggestedSplit()`: looks at last workout date/split, returns next in rotation

- [ ] **Step 3:** Write workout UI JS:
  - `startWorkout(splitDay)`: hides split selection, shows active workout, renders exercise list with previous data + PRs, creates empty set input rows
  - `renderExercise(exercise, index)`: builds the exercise card HTML with set rows pre-filled from previous session
  - `logSet(exerciseIndex, setIndex)`: reads weight/reps from inputs, saves to current workout state, checks for PR, triggers rest timer, updates set row styling (completed), saves to localStorage
  - `checkOverloadNudge(exerciseIndex)`: checks if all sets hit top of rep range, shows green nudge message
  - `finishWorkout()`: calculates summary stats, shows summary card, saves completed workout to history, updates PRs

- [ ] **Step 4:** Test full flow: select Push A, log sets for bench press with weight/reps, verify previous session shows on second workout, verify PR detection works, verify overload nudge appears when hitting top rep range.

---

### Task 5: Rest Timer

**Files:**
- Modify: `richie-app.html` (timer HTML + timer JS)

- [ ] **Step 1:** Build timer HTML:
  - Pinned bar at top of workout tab (position sticky, high z-index)
  - Countdown display: large seconds number + visual progress bar that shrinks
  - Quick-switch buttons: 60s / 90s / custom (input field)
  - Skip button (ends timer early)
  - Mute toggle icon
  - Hidden by default, shown when timer starts

- [ ] **Step 2:** Write timer JS:
  - `startTimer(seconds)`: shows timer bar, starts countdown using `setInterval(1000ms)`, updates display + progress bar each tick
  - `onTimerComplete()`: plays beep sound (Web Audio API oscillator — no external audio file needed), flashes timer bar, auto-hides after 3 seconds
  - `skipTimer()`: clears interval, hides timer
  - `setTimerDuration(seconds)`: updates default, restarts if currently running
  - `toggleMute()`: toggles beep on/off, saves preference
  - `createBeep()`: generates a short 800Hz tone using AudioContext + OscillatorNode

- [ ] **Step 3:** Integrate with `logSet()`: after a set is logged, auto-call `startTimer(currentDuration)`. Timer stays visible while user scrolls through exercises.

- [ ] **Step 4:** Test: log a set, verify timer starts at 60s, counts down, beeps at 0. Switch to 90s, verify. Tap skip, verify. Mute and verify no sound. Scroll down while timer runs, verify it stays visible.

---

### Task 6: Journal Tab

**Files:**
- Modify: `richie-app.html` (journal tab HTML + journal JS)

- [ ] **Step 1:** Build journal tab HTML:
  - Calendar strip: horizontal scrollable row of date cells (show ~14 days centered on today), today highlighted with accent color, days with entries get a dot indicator
  - Entry form below: checklist checkboxes (same 7 items), weight input (number, step 0.1), energy/mood selector (5 tappable numbers 1-5), freeform notes textarea
  - Sunday auto-summary card (hidden unless viewing a Sunday)

- [ ] **Step 2:** Write journal JS:
  - `renderJournal()`: builds calendar strip for current date range, loads selected date's entry, populates form
  - `selectJournalDate(dateStr)`: loads entry for that date, updates form, highlights selected date in strip
  - `saveJournalEntry()`: reads form values, saves to `richie_journal[dateStr]`, updates calendar dot
  - Auto-populate checklist from tracker data: if `richie_tracker[dateStr]` exists, pre-check matching items
  - `renderWeekSummary(sundayDate)`: calculates Mon-Sun stats (gym count, avg protein from eaten meals, checklist %, weight trend), renders summary card
  - Calendar strip navigation: left/right arrows to shift the visible date range by 7 days
  - Auto-save on any input change (debounced 500ms)

- [ ] **Step 3:** Test: write a journal entry for today, reload page, verify it persists. Navigate to different dates, verify independent entries. Check Sunday summary with some tracker data filled in.

---

### Task 7: Settings Panel + Export/Import

**Files:**
- Modify: `richie-app.html` (settings HTML + settings JS)

- [ ] **Step 1:** Build settings panel HTML:
  - Program start date: date input, defaults to 2026-04-07
  - Default rest timer duration: number input (seconds)
  - Export button: "Export All Data"
  - Import button: file input styled as button, accepts .json
  - Clear data button: red, requires typing "DELETE" in a confirmation input
  - Reset meal plan button

- [ ] **Step 2:** Write settings JS:
  - `renderSettings()`: loads current settings, populates inputs
  - `saveSettings()`: saves program start date + timer duration, recalculates week indicator
  - `exportData()`: calls `DB.exportAll()`, creates a Blob, triggers download as `richie-backup-YYYY-MM-DD.json`
  - `importData(file)`: reads file, parses JSON, validates structure (checks for expected keys), confirms with user via modal ("This will replace all data. Continue?"), calls `DB.importAll()`, re-renders current tab
  - `clearAllData()`: checks confirmation input === "DELETE", calls `DB.clearAll()`, reloads page
  - `resetMeals()`: removes `richie_meals` from localStorage (defaults will be used), re-renders tracker

- [ ] **Step 3:** Test: change start date, verify week indicator updates. Export data, clear all data, import the exported file, verify everything restores correctly.

---

### Task 8: Polish + Mobile Responsive

**Files:**
- Modify: `richie-app.html` (CSS media queries + UX polish)

- [ ] **Step 1:** Add mobile-specific CSS:
  - `@media (max-width: 600px)`: stack tracker elements vertically, full-width meal cards, larger touch targets on workout inputs (min 44x44px), single-column layouts, smaller hero text, horizontal scroll on nav with momentum scrolling
  - Workout set inputs: number type with inputmode="decimal" for numeric keyboard on mobile
  - Timer bar: full width on mobile, condensed on desktop

- [ ] **Step 2:** UX polish:
  - Smooth transitions on tab switches (fade or slide)
  - Macro bar fill animations (CSS transition already exists, verify it works with JS updates)
  - Checklist items: subtle background highlight when checked
  - Workout set rows: green left border when completed
  - Active tab in nav: smooth underline transition
  - Toast notifications for saves ("Data exported", "Meal updated", etc.) — small popup that auto-dismisses after 2 seconds

- [ ] **Step 3:** Test on mobile viewport (Chrome DevTools device mode): verify all touch targets are usable, inputs trigger numeric keyboard, scrolling is smooth, timer is visible during workout, no horizontal overflow issues.

---

### Task 9: Final Integration Test

- [ ] **Step 1:** Full flow test:
  1. Open fresh (no localStorage) — verify defaults load, Tracker tab shows, week indicator correct
  2. Toggle to Gym Day, check off eggs + creatine, mark breakfast + lunch eaten, verify macro bars
  3. Go to Workout tab, select Push A, log 3 sets of bench press with weight/reps, verify rest timer auto-starts each time, verify PR is set
  4. Finish workout, verify summary
  5. Go to Journal, write today's entry, verify checklist auto-populated from tracker
  6. Go to Settings, export data
  7. Clear all data, verify fresh state
  8. Import the backup, verify all data restored
  9. Edit lunch macros, verify tracker reflects changes
  10. Reload page — verify all state persists

- [ ] **Step 2:** Verify all existing reference tabs (Daily Blueprint through What To Expect) still render correctly with no visual regressions.
