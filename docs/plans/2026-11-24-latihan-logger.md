# Latihan: the set logger, and why switching tabs felt slow (24 Nov 2026)

Richie: "the training part needs lots of improvement, a lot of bugs and wrong UI … switching between home / meal / training / progress feels super slow … make the meal UI the standard and prioritise one click to get more."

Makan is the standard: one accent (#3e60d5), white surfaces, hairline borders, sentence case, one primary per view. The set logger was the opposite: a dark orange "fire" theme, tiny uppercase mono labels, English words, all inline styles.

## 1. Switching tabs: 1.6 s → about 10 ms

Measured on a production build behind a proxy that adds 350 ms per request (to imitate Hangzhou → Vercel), six switches in a row between the four tabs:

| | Before | After |
|---|---|---|
| Tap → new screen | 1.6 s every time (4.4 s the first) | 5–14 ms |

Two causes, both fixed in the navigation, not in the screens:

1. **A view transition around every navigation** (`lib/navigate.ts`, used by the tab bar). `document.startViewTransition(() => router.push(href))` returns before the new screen exists, so the browser froze the page for a cross-fade of a screen that had not arrived. That alone was about 1 s. Without it the same switch took 0.6 s. The tab bar and `useVTNavigate` now call `router.push` directly.
2. **Every page is dynamic** (the root layout reads the session), and Next.js does not prefetch a dynamic page that has no `loading.js`, so each tap waited for the server (see `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`, "Prefetching static vs. dynamic routes"). The four tab pages are client components that read their data from the device, so their server payload is tiny and safe to keep. `BottomNav` now prefetches all four tabs (`<Link prefetch>` plus `router.prefetch` on load, when the app comes back to the front, and every 4 minutes, so a prefetch never expires under a tap).

Also: a tapped tab is shown as selected at once (the URL only changes when the next screen is ready), and the tab bar is hidden while logging sets, so the thumb has one bar to reach.

Not changed: `npm run dev` uses webpack and compiles each route on its first visit, so a local dev session still pauses on the first visit to each tab. Check speed on `npm run build:app && npm start`, or the deployed app.

## 2. The logger: user and goal

```
Who:        Richie at the gym, one hand, sweaty, phone in a pocket between sets
Job:        log each set fast, see what is next, rest, finish, see what it burned
Done when:  every set is logged, one tap on "Selesai dan lihat ringkasan"
Frequency:  3–4 sessions a week, 15–25 sets each
```

Click budget: the common set is **one tap** ("Catat set N"): weight and reps are already filled from the last set today, else from last time. Changing a value is ± (the exercise's own step) or typing. A mistake is one tap on "Urungkan" (the set you just logged) or on the set's chip (edit or delete).

## 3. Layout (375 px)

```
‹ Latihan                                   [Selesai]
Besarin dada
4 dari 19 set · 2.063 kg · ≈ 23 kkal
▬▬▬▬▬░░░░░░░░
┌ Sekarang · latihan 1 dari 6          Cara  Ganti ┐
│ Bench Press                                      │
│ Dada · target 4 set × 8–10                       │
│ Terakhir 62,5 kg × 8 · 6 hari lalu               │
│ [ Coba 62,5 kg × 9  kejar target rep ]           │
│ [Set 1 62,5×9] [Set 2 …] [Set 3 berikutnya] …    │
└──────────────────────────────────────────────────┘
Berikutnya   Incline DB Press · 3 set × 10   Mulai
Selesai      …                                ✓
[ + Tambah latihan ]
─────────────── dock (fixed, thumb reach) ──────────
00:59 ▬▬▬▬▬▬▬▬  [+15 dtk] [Lewati]      ← only while resting
Set 3 tercatat · rekor baru               Urungkan
Beban (kg) [− 62,5 +]      Reps [− 8 +]
[            Catat set 4            ]  ← the one primary
```

The suggestion chip uses double progression from last time: add weight once the target reps are cleared by two, add a rep once they are met, else chase the target. "Rekor baru" only appears when a set beats the best of every earlier session and of the sets already logged today (first time ever is not a record).

## 4. States

| Region | Empty / first time | Normal | Done |
|---|---|---|---|
| Last time | "Belum pernah dicatat. Mulai dari beban yang nyaman." | "Terakhir 62,5 kg × 8 · 6 hari lalu" | same |
| Dock | steppers at 0 kg × target reps | steppers prefilled; rest strip after a set | "Selesai dan lihat ringkasan" + "Tambah latihan" |
| Selesai (top) | sheet "Belum ada set tercatat": Lanjut latihan / Keluar dulu | sheet "Akhiri latihan sekarang?" when sets remain | goes straight to the summary |
| Set chip | "belum" / "berikutnya" | tap → "Ubah set N": Simpan / Hapus set | same |
| Swap | "Belum ada pengganti yang kami kenal" | list of stand-ins with "Pakai" | |
| Missing session | "Sesi tidak ditemukan" + back button | | |

## Bugs fixed

- **REPS card was cut off at the right edge** at 375 px (the two steppers did not fit). Two equal columns now.
- **A session could be finished with no sets**, and its summary celebrated nothing. Finishing with 0 sets now asks; the summary handles empty sessions separately.
- **A logged set could not be changed or removed**, only added. Tap it to edit or delete (later sets are renumbered); "Urungkan" removes the set just logged.
- **"REKOR · LAMPAUI!" showed before you lifted anything**, on every exercise that had history, and "REKOR BELUM ADA" on the rest. Now "Terakhir …" is plain information, and a record is only claimed after a set really beats the best.
- **"Last time" echoed today's own sets.** `lastPerformance` included the session being logged, and ignored swaps. It now excludes the open session and matches the exercise actually done (`lib/exerciseHistory.ts`, 5 tests).
- **Swapping was a hidden long-press** ("TAHAN / GANTI MESIN"). A visible "Ganti" button opens a list (it used to be a swipe carousel).
- **The order was a queue that hid the exercise you were on** below finished ones. The focused exercise is always first; "Berikutnya" and "Selesai" follow, and any row can be picked (a finished one can take extra sets).
- Small text (7–11 px mono caps), English labels, orange/red gradients and glows, glyph icons (✓ ⓘ ＋ ←) are gone. Every target is 44 px or more, every sheet is a labelled dialog with Escape and a focus trap, reduced motion is honoured.
- The old detail sheet (OTOT TARGET / TIPS FORM / MINDSET) is replaced by the shared "Cara" guide used on Latihan, so there is one how-to, not two. `BodyDiagram.tsx` is no longer used by the logger.

## Verification

Phone width, test account: logged sets (prefill, rest timer, "tercatat · Urungkan", record flag), edited one, auto-advance after the 4th set, undo returning to the first exercise, swap sheet, add sheet with search ("dada" → 6 results in Bahasa), early-finish sheet, all-done state, "Cara". `tsc` clean, `ui_lint` 0 errors, all text pairs ≥ 4.5:1.
