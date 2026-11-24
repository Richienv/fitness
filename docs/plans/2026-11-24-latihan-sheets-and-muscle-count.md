# Latihan: calm sheets for "Catat bebas" and "Buat sesi sendiri", and an honest muscle count (24 Nov 2026)

Richie: the training part has many bugs and wrong UI; make the Makan UI the standard and put one-click first. Latihan's home was already calm; the two sheets opened from it ("Catat bebas", "Buat sesi sendiri") were still the old dark "fire" theme with tiny mono caps, and the muscle bars could show 0 sets for a session that was really done.

## Step 1: user and goal

```
Who:        Richie, 22, recomp, trains 3-4x a week at a gym in Hangzhou, iPhone, one hand, between sets
Jobs:       (1) "Catat bebas": log one machine right now, without a program
            (2) "Buat sesi sendiri": build a session once (muscles, exercises, sets, reps, rest)
                and start it
            (3) see which muscles he really trained in the last 7 days
Trigger:    (1) he is standing at a machine; (2) planning a day that is not in the split;
            (3) opening Latihan to decide what to train next
Done when:  (1) the logger is open on that machine; (2) the session is saved and running;
            (3) the bars match what he logged
Knows:      machine names in English, body parts in Indonesian; not the app's catalogue
Frequency:  (1) several times a week, (2) now and then, (3) every visit
```

## Where it went wrong (layers)

| Symptom | Layer it started in |
|---|---|
| Both sheets look like another app (dark, orange, 9 px mono caps, "MULAI", "＋ CATAT") | 6 tokens: the sheets still used `modal`, `wo-modal`, inline "fire" styles |
| "Buat sesi sendiri" has no way to change the weight step, and nothing says why Save is off | 5 states: missing editor and missing disabled reason |
| Sheet closes on a stray tap after five minutes of building | 3 flow: no guard on a destructive close |
| OHP counted as chest, a swapped exercise counted for the wrong muscle, a session with unfinished sets counted in full | 1/2 data: `lib/todayVolume.ts` looked each logged exercise up by name only |
| "Bahu" in the session builder hides OHP and shoulder presses | 2: front delt was filed under the chest colour group |
| A session left open last week hides today's "Mulai latihan" | 3: the in-progress check ignored the date |
| After midnight (or a Makan day picker on yesterday) Latihan still says "hari ini" for the wrong day | 3: the page followed the global active day, not today in China time |

## Step 2: flow and clicks

- Log a machine: Latihan, "Catat bebas" (1), tap the machine (2). Before: type, tap "＋ CATAT" (3+). A machine used before is on the empty screen ("Sering dipakai"), so no typing.
- Own session: "Buat sesi sendiri" (1), tap muscles (n), tap exercises (n), "Simpan dan mulai" (1). Sets, reps, weight step and rest start at the program's own values and are edited only when they are wrong.
- Muscle bars: no clicks; they update when the page is shown.

Budget: one primary per view. "Catat bebas": none (every row starts). "Buat sesi sendiri": "Simpan dan mulai".

## Step 3: hierarchy (375 px)

```
Catat bebas                                     [x]
Ketuk alatnya untuk langsung mulai mencatat.
[ (search) Cari alat, mis. "dada" atau "press"   x ]
Sering dipakai                       (empty field only)
  Chest Press Machine   Dada · Mesin                 Catat
Cari per otot
  [Dada] [Punggung] [Bahu] [Lengan] [Paha] [Betis] [Perut] [Bokong]
Alat (3)                             (when typing)
  Chest Press Machine   Dada · Mesin                 Catat
Sesi
  Besarin dada          Dada · Pria                  Mulai

Buat sesi sendiri                               [x]
1  Otot yang dilatih    [Dada] [Punggung] [Bahu] [Lengan] [Kaki] [Perut]
2  Tambah gerakan       [ (search) Cari gerakan atau alat ]
                        Squat  Paha depan                     + Tambah
3  Sesi kamu (2 gerakan)
   Bench Press  4 set × 8-10 · istirahat 60 dtk   Atur
     Set [-] 4 [+]  Repetisi [-] 9 [+]  Langkah beban [-] 2,5 kg [+]  Istirahat [-] 60 dtk [+]
   Nama sesi  [ Dada + Bahu ]
-----------------------------------------------------------------
Tambahkan minimal 1 gerakan untuk menyimpan.   (or "2 gerakan · 7 set")
[ Simpan dan mulai ]
```

One accent (#3e60d5) for the primary, links, selected chip and focus. White surface, one neutral fill, hairline borders. Sentence case, 14 px and up, every target 44 px and up.

## Step 4: states

| Region | Empty | Loading | Error | Success / other |
|---|---|---|---|---|
| Catat bebas, no query | picks + muscle chips; with no picks, chips and one sentence | n/a (local) | n/a | joins the running session when one is open (said in words) |
| Catat bebas, query | `Tidak ada alat "x". Coba kata lain, mis. dada, paha atau bahu.` | instant | n/a | the row starts the logger |
| Muscle chips | none selected: suggestions hidden, hint in words | n/a | n/a | selected = accent outline and `aria-pressed` |
| Suggestions | all of them added: "Semua gerakan untuk otot ini sudah ditambahkan." | n/a | n/a | an added row leaves the list |
| Sesi kamu | "Belum ada gerakan. Ketuk gerakan di atas untuk menambah." | n/a | n/a | row with summary; editor opens in place |
| Save | disabled, with the reason in words above it | n/a | n/a | toast "Sesi ... disimpan", logger opens |
| Close with work in it | closes | n/a | n/a | asks "Buang sesi ini?" first (Escape, back and the x ask; a stray tap on the backdrop does nothing) |
| Sesi saya | hidden | n/a | n/a | rename and delete use sheets of their own, not `window.prompt` |
| Otot 7 hari terakhir | six bars at 0 and "Belum ada set tercatat" | n/a | n/a | bars by group |

## What was built

- `app/workout/SheetFrame.tsx`: one portal, backdrop and `role="dialog"` frame for sheets and centred dialogs (labelled, Escape, focus moved in and given back, Tab kept inside, sized to the part of the screen the iOS keyboard leaves free).
- `app/workout/FreeLogSheet.tsx` ("Catat bebas") and `app/workout/CustomSessionSheet.tsx` ("Buat sesi sendiri"), with `app/workout/sheets-calm.css` (prefix `lt-sh-` / `lt-tpl-`, only `--calm-*` tokens plus one red). Both keep `useSheetBack`; the builder asks before it throws work away.
- `app/workout/WorkoutHome.tsx`: Gym card first (so Mulai is on screen at 375 x 812), "Hari ini" second, "Sesi saya" third. The Gym card says what the shown session should burn ("≈ 171 kkal (perkiraan)", through `plannedWorkoutKcal`) and, once done, the real number ("≈ 30 kkal terbakar"). "Sesi saya" is rebuilt, with rename and delete dialogs instead of `window.prompt` and an unconfirmed delete.
- `lib/trainingLoad.ts` (pure): resolve each logged exercise like `workoutBurn` (position, then name), the swapped-to muscle, skipped and empty sets ignored, date windows by key. `lib/todayVolume.ts` now only adds the storage side. `lib/sessionDraft.ts` (pure): defaults, steppers, auto name, save rule, catalogue search. Tests: `lib/todayVolume.test.ts` (9), `lib/sessionDraft.test.ts` (9).

## Bugs fixed on the way

- "Otot 7 hari terakhir" (was "Otot minggu ini", but it is the last 7 days): looked each exercise up by name only; ignored swaps, skips and empty sets; filed OHP and shoulder presses under Dada. Now resolved like `workoutBurn`, and front delt counts as Bahu.
- The builder's "Bahu" chip hid OHP and every front-delt exercise (same colour-group mapping). Added exercises took 3 x 10 and a 2,5 kg step whatever the program said; now they start from the program's own values. The weight step could not be edited. Cardio machines, which cannot be logged as sets, are not offered.
- "Perlu coach" missed "Flat Bench Press" (the list knows its id, not its name).
- Week state used the phone's clock and start time; now it follows today in China time by date keys. Resuming the phone's app the next day kept yesterday as "hari ini"; it now re-reads on return. The page no longer follows a past day picked on Makan: it is always today.
- "Selesai" was per session type: a session that appears twice in a week showed done twice. Matched slot by slot now. A day that passed without its session says "Terlewat", not "Belum".
- A session left open on an earlier day hid today's Mulai and was resumed by its type on the next week's same day. It is no longer "now", and a session with sets that stopped being the open one (replaced by starting another) gets a "Belum selesai ... Lanjutkan" line so there is a way back.
- "Catat bebas" during a running program session started a second session and left the first with no way back; the machine now joins the running session. A second tap while the next screen loads started a second session; guarded.
- The machine search floated the machines you use for any text ("xyzzy" returned your favourite); matches only now. (The cause is in `searchEquipment`; see the report.)
- The custom session's name in the Gym card was lower-cased ("Dada + bahu"); it keeps what was typed.

## Verification (24 Nov 2026)

`npx tsc --noEmit` clean, `npm test` 424 pass, `ui_lint.py` 0 errors (one warning: the dialog container, which is not a control, has no ring; every control has one). At 375 x 812 with the test user: Catat bebas (empty, typed "dada" with machines and a session, no result, joining a running session by one tap, the machine appearing as the running session's last exercise), Buat sesi sendiri (empty, muscles chosen, suggestions, exercises added, editor open with all four steppers, discard confirmation by Escape and by the back button, a tap on the backdrop ignored, save and start), rename with a long name, delete, rest day, a selected future day with its estimate, a finished day with the real number. Tab order and the accent focus ring; no horizontal overflow on the page or in the sheets. Not tried on a real iPhone keyboard.
