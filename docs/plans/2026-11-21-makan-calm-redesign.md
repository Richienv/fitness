# Makan and "Catat makan": one accent, clear hierarchy (21 Nov 2026)

Richie, opening the Makan page: "susah buat di navigasiin, ngga jelas", and on the food sheet: "mata aku baru buka udah pusing, kebanyakan warna, ngga ada accent colour".

## Step 1: user and goal

```
Who:        Richie, 22, recomp, logs every meal on his phone (375 px), often one-handed
Job:        log what he just ate, then see how much kcal and protein is left today
Trigger:    right after a meal, or when planning the next one
Done when:  the food is in the right meal, and he knows "masih kurang 36 g protein"
Knows:      his usual foods; the app's Racik, Scan label and menu cepat
Frequency:  4–8 times a day, so speed beats discoverability
```

## Where it started (layers)

| Symptom | Layer it started in |
|---|---|
| "Pusing, kebanyakan warna" | 6 tokens: three palettes on one screen. `friendly.css` sage green, `companion.css` blue, `meal-entry.css` redefines the accent as black. Plus four pastel category tiles, three pastel macro tiles, a beige breakfast card with an illustration, a sage progress bar. |
| "Ngga ada accent colour" | 6 + 4: the primary is black on Makan and in the sheet, the second sheet tool ("Scan label") is also black, so a secondary tool looks like the main action. |
| "Susah navigasi" | 3 + 4: seven equal ways to start logging on one screen (dock: Cari / Racik / Scan, four big "Catat …" buttons, menu cepat buried at the bottom in a closed disclosure). Protein, his main number, has no target beside it; targets hide behind "Target dan detail nutrisi". The Latihan/Istirahat toggle takes the top spot though he rarely changes it. Each food row shows five numbers. |

## Step 2: flow and clicks

- Log the usual meal: today Home only. Now also one chip on Makan (1 tap).
- Log a saved quick menu: today open the disclosure, then tap (2). Now a chip under the summary (1).
- Search a food: dock "Cari makanan" (1) → tile or search → item → add → save. Unchanged path, the dock button now says which meal it logs to.
- Log into another meal slot: "+ Tambah" on that slot (1).

One primary action per view: on Makan, the dock's "Cari makanan"; in the sheet, "Simpan N makanan".

## Step 3: hierarchy (375 px)

```
Makan                                        [Hari ini ▾]
[ring]  Kalori 1.180 / 2.000 kkal · 820 kkal tersisa
        Protein 72 / 150 g · 78 g lagi
        Karbo 80 g · Lemak 30 g
        Target hari: [Latihan | Istirahat]              (small)
Catat cepat: [Makan malam biasa 615 kkal] [Kreatin 0] [Nasi ayam 760] [Atur]
Hari ini
  Sarapan                                       480 kkal
    Oat + whey   1 porsi · 32 g protein   480 kkal   ×
  …
  Makan malam  · Sekarang                         0 kkal
    Belum ada
    + Tambah ke makan malam
[dock: (Cari makanan · makan malam) (Racik) (Scan label)]
```

Rules applied: one accent (#3e60d5) for the primary action, links, focus and selection. Data colours only inside the ring (kcal blue, protein green), the same as Home. Everything else neutral: white surfaces, one hairline between sections, no tinted cards. Numbers right-aligned. Sentence case.

## Step 4: states

| Region | Empty | Loading | Error | Success |
|---|---|---|---|---|
| Summary | 0 / target, ring empty, "2.000 kkal tersisa" | n/a (local data) | n/a | ring and numbers glide on update |
| Catat cepat | hidden when there is nothing to offer, "Atur menu cepat" link remains | n/a | n/a | celebration sheet (existing) or toast for 0 kcal |
| Slot | "Belum ada" + "+ Tambah ke …" | n/a | n/a | row appears; delete asks first (existing) |
| Sheet categories | existing copy | "Memuat katalog makanan…" (existing) | existing message + "Coba lagi" | — |

## What shipped (21 Nov 2026)

- **One accent system** (`app/calm.css`, loaded last). The app's blue is the only accent: primary buttons, links, focus, selection. The black accent that `meal-entry.css` set for the Makan page, the food sheet and the scan sheet now uses the same tokens. The pastel category tiles, pastel macro tiles, beige breakfast card, sage buttons and sage progress bar are neutral (white, one fill, hairline). "Scan label" in the sheet is no longer black; the only filled button there is "Simpan N makanan". Contrast checked: text 15.5:1, muted 5.4:1, accent on white 5.5:1, white on accent 5.5:1, destructive red 6.5:1.
- **Makan page.** Title and a date chip ("Hari ini ▾"). One summary card with the same ring and legend as Home (kcal and protein against their targets, carbs and fat on one line) and the Latihan/Istirahat target as a small control at its foot. "Catat cepat": the usual meal for the current slot, then the saved quick menus, one tap each, then "Atur". "Hari ini": one surface, a hairline between slots, "Sekarang" on the current one, each food as name, portion and protein, kcal right-aligned, a labelled delete. Each slot ends with "+ Tambah ke …". The dock's main button says which meal it logs to.
- **Removed** the "Catatan harian" eyebrow, the repeated date line, the "Target dan detail nutrisi" disclosure, the decorative breakfast scene, four full-width "Catat …" buttons and the closed "Menu cepat tersimpan" disclosure.
- **Dialogs.** The delete confirmation and both quick-menu sheets ("Atur catat cepat", "Ubah menu cepat") now use the same light style, sentence case, readable sizes, Escape to close, and focus on the safe button.
- **Clean-up.** Unused `SwipeRow`, `segStyle` and their imports removed.

Clicks: the usual meal and every saved quick menu are 1 tap from Makan (quick menus were 2). Searching is unchanged in steps.

Verification: `ui_lint.py` 0 errors (warnings are white surfaces and dismissable backdrops), `npx tsc --noEmit`, `npm test` (361 pass), `npm run build:app`. Screens checked at 375 × 812 and 1280 × 900 with test data: Makan, the food sheet (empty and with one item), delete dialog (Escape closes it), "Atur" and "Ubah".
