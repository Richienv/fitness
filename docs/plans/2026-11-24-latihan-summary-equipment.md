# Latihan: session summary, equipment list and gym setup, in the calm style (24 Nov 2026)

Richie: the training part has many bugs and wrong UI; make the Makan UI the standard and put one-click first. These three screens still had the dark/orange "fire" look, English words, tiny uppercase mono labels and a celebration for an empty session.

## Step 1: user and goal

```
Who:        Richie, 22, recomp, in the gym with an iPhone (375 px), one hand free
Jobs:       (summary) see what the session did, then leave in one tap
            (list)    stand at a machine, find it, start logging in one tap, or read how to use it
            (setup)   say once which machines his gym has
Done when:  summary: "Selesai" back on Latihan. List: the logger is open on that machine.
            Setup: the count is right and it is saved.
Knows:      machine names in English and on the Chinese stickers, muscle names in Bahasa
Frequency:  summary 3-4x a week, list 3-4x a week, setup once
```

## Where it went wrong (layers)

| Symptom | Layer |
|---|---|
| Empty session shows "Sesi selesai" with zeros, "MINGGU 48 / 12" | 5 and 8: no empty state, a counter that assumes a 12-week block started in April |
| Orange gradient buttons, 8-10 px uppercase mono labels, English chips | 6 and 8: old tokens and copy |
| "CARA" is a 9 px pink-on-white pill | 10: contrast and touch size |
| Equipment list: `Catat` and `Cara` look like one blob, search scrolls away | 3 and 4 |
| Setup page is not linked from anywhere | 2 |
| Rows dimmed to 50 % after logging a single machine (hydration also differs from the server) | 5: state derived from localStorage during render |

## Step 2: flow and clicks

- Summary: arrive after "Selesai" in the logger. Leave = 1 tap ("Selesai"). Share = 1 tap. Save as a reusable session = type a name (prefilled) + 1 tap.
- Equipment: open (from Latihan "Alat gym"), type or pick a category, tap "Catat" = 1 tap to start logging (unchanged: quick exercise, then the logger). "Cara" = 1 tap, a sheet with a "Catat alat ini" button.
- Setup: reached from the equipment list ("Atur alat gym-ku"); tap machines or "Pilih semua", "Simpan" = 1 tap.

## Step 3: hierarchy (375 px)

```
Summary
[x]                                      Sesi selesai (check + word)
Besarin dada
Selasa, 24 November 2026
[ Durasi 52 mnt | Total volume 4.280 kg ]
[ Set selesai 14 | Rekor baru 2         ]
Rincian latihan
  Bench Press                    ≈ 12 kkal
  4 set × 60 kg × 8
  Rekor baru: 65 kg × 8 (sebelumnya 60 kg × 8)
  ...
  Kalori aktif terbakar     ≈ 40 kkal   (+ how it is estimated)
Otot yang dilatih (bars)
Simpan jadi sesi (name + secondary button)
[ Selesai ]  <- the one primary
[ Bagikan progres ]

Equipment list
< Latihan
Alat gym                       Atur alat gym-ku
(sticky) [ Cari alat atau otot       (x) ]
(sticky) Semua Mesin Kabel Barbel Dumbel Berat badan Kardio
12 alat cocok dengan "dada"
Chest Press Machine                      [ Catat ]
Dada · Mesin                              Cara
胸部推举器 · xiōngbù tuījǔ qì

Setup
< Alat gym
Alat gym-ku
Pilih alat yang ada di gym-mu. Alat lainnya ditandai di daftar alat.
Mesin  3 dari 29                       [Pilih semua]
[ Chest Press Machine  Dada        [v] ]  (56 px rows)
(sticky above the nav) Dipilih 12 dari 49        [ Simpan ]
```

## Step 4: states

| Region | Empty | Loading | Error | Success |
|---|---|---|---|---|
| Summary | 0 sets: "Belum ada set tercatat", no stats, no celebration; button "Lanjutkan sesi" if still open, else "Kembali ke Latihan" | "Memuat ringkasan…" | "Sesi tidak ditemukan" + back button; share failure shows a toast | stats, rows, "Rekor baru" only when a set beat the last session of the same kind |
| Equipment list | no match: the reason + one action ("Hapus pencarian" or "Cari di semua kategori") | local data, instant | n/a | "Catat" shows "Membuka…" once, then the logger opens |
| Guide sheet | n/a | n/a | n/a | opens on "Cara", Escape or Tutup closes, focus returns to "Cara" |
| Setup | nothing chosen: "Dipilih 0 dari 49", Simpan stays active | n/a | n/a | "Simpan" marks the gym as set and returns to the list |

## What changed

See the commit; the notable decisions are:
- Own CSS only: `app/workout/summary-calm.css` (`lt-sum-*`) and `app/workout/equipment-calm.css` (`lt-eq-*`), built on the global `--calm-*` tokens and not on load order.
- The week counter is gone from the page. The share image (`lib/shareCards.ts`, not touched) still prints "WK n / 12", so it now receives the week of the 12-week block clamped to 1..12.
- The share image said "N EXERCISES COMPLETED" with the planned number; it now gets the number actually logged.
- A record needs a real previous session of the same kind; bodyweight sets (0 kg) compare by reps instead of never counting.
- The equipment guide has its own sheet (same `mk-sheet` classes as `ExerciseGuide`) because only 4 of 49 machines exist in `lib/exerciseData.ts`; the how-to text is translated into Bahasa in `app/workout/equipment/howto-id.ts`.
