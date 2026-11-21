# Food search: understand the query, group by meaning, say "mentah" (21 Nov 2026)

Richie: "ayam air fryer ngga muncul apa apa dan ayam langsung muncul banyak gini aku bingung … ada ayam mentah tulisannya cuman dada ayam … search resultnya butuh super advanced technique of retrieving yang lebih akurat dan learn and keep score sama yang sering dipilih."

## What was wrong (measured on the full 4,575-food pool, `scripts/searchPool.ts`)

| Query | Before | Cause |
|---|---|---|
| ayam air fryer | 0 results | Every word must match (AND), and no food is named after an air fryer. |
| ayam | 400 results, one flat list: raw cuts, dishes and "contains chicken" (mie, soto, bubur, telur) interleaved, two "Ayam bakar" rows | No structure on top of the ranking. |
| ayam mentah | 1. Telur Ayam Mentah, 2. Bayam Mentah | "ayam" also matched inside "b-ayam" (substring tier). |
| (the raw breast) | shown as "Dada ayam" only | Raw or cooked was never shown. |

The learning already existed and stays as it is: `lib/foodAffinity.ts` (decayed pick counts, time-of-day slot, what is on the plate, "shown and ignored" suppression) applied inside the ranker, capped at +40%.

## What changed

- **Query understanding** (`lib/foodQuery.ts`, pure). `parseFoodQuery` takes cooking methods that no food is named after out of the words ("air fryer", "airfryer", "oven", "grill", with "pakai/di/dengan" before them) and reads "mentah"/"raw" as a wish for ingredients. Words that are in dish names ("goreng", "bakar", "rebus") stay. "air kelapa" stays a drink.
- **No dead ends.** When nothing matches every word, `relaxQuery` searches the longest leading part that finds something (Indonesian names put the food first) and the sheet says "Tidak ada yang cocok dengan semua kata. Menampilkan “ayam kremes”."
- **A real word means that word** (`lib/foodSearch.ts`). When the typed word exists in the catalogue as a whole word, it no longer matches inside other words or by typo. "ayam" stops returning spinach; "ayem" and half-typed "aya" still find chicken because they are not words.
- **Groups by meaning** for one-word queries (`groupResults`): **Sering kamu pilih** (affinity ≥ 0.25, up to 3, never repeated below), **Bahan ayam** (the food plus only plain words like dada, paha, fillet, segar, or raw), **Masakan ayam** (the food as head with a dish word: goreng, bakar, koloke…, plus dish names that put it second: opor, gulai, sate, rendang…), **Mengandung ayam** (everything else: mie ayam, soto ayam, telur ayam). Rank order is kept inside each group; duplicate names are dropped; four per group with "Lihat semua N". Asking for raw or an air fryer leads with Bahan.
- **Hints.** Air fryer: "Air fryer tidak menambah minyak. Pilih bahannya, lalu isi berat sebelum dimasak." (Air-frying adds no fat, so the raw weight's nutrition is the honest number.) Oven/grill: "pilih bahannya, atau masakan panggang".
- **"mentah" tag** on raw items whose name does not already say so. Raw or cooked is read from the food (`foodState`: explicit state, then "mentah/raw" in name, unit or aliases, then dish words). The curated chicken breast is marked raw: 110 kkal and 21 g protein per 100 g is raw breast, not cooked.
- The server search receives the parsed words too.

## Verification

- `lib/foodQuery.test.ts` (10 tests) and two updated/added ranker tests; full suite 372 pass.
- Golden ranking set (`scripts/searchEval.ts`, 21 cases): MRR 0.819, NDCG@10 0.682, Clean@10 95%, Top-1 76%, unchanged from before the whole-word rule.
- Probe on the full pool: "ayam" → Bahan ayam 9 (Ayam, Chicken thigh, Chicken breast, Daging Ayam, Ayam giling mentah…), Masakan ayam 155, Mengandung ayam 222; "telur", "nasi", "ikan" group the same way; "ayam mentah" no longer shows spinach.
- Sheet at 375 px with test data (local server has no database, so only the curated staples): "ayam" grouped with "Dada ayam · mentah" first; "ayam air fryer" shows the hint and raw cuts first.

## Not in this release

- Remembering which food was picked for which query ("ayam" → Dada ayam) on top of the general affinity.
- Golden-set cases for the new query layer (the harness scores the raw ranker).

## Follow-up the same day: search first, one tap, an editable tray

Richie: "pilih jenis makanan juga aku nggak mau … kita rely heavily di search … habis di search, di tap, … bisa kita udah masukin apa aja dengan gampang dan clear, terus bisa diedit dengan gampang dan clear."

- The "Pilih jenis makanan" category tiles are gone from the sheet. What remains with no query: his personal quick picks ("Pilihan cepat"), the catalogue status, and "Pilihan lain". With no quick picks yet, one line says what to type.
- **One tap adds.** Tapping a search result or a quick pick puts it on the tray at his usual portion (the median of his own logs, else the food's default), through the same `commitFood` path as before, so learning and arithmetic are unchanged. A food already on the tray opens its portion sheet instead of being added twice.
- **The tray says what is chosen and lets it change.** Each item shows its Indonesian name, kcal and protein, then − amount + (a quarter of the usual portion in grams, or the food's own step for counted foods; tapping the amount opens the full portion sheet), × to remove, and "Edit nilai gizi" for gram-based foods. Counting words are Indonesian ("1 butir", "2 sdm"). While searching, a bar says "Sudah dipilih 3 · 475 kkal" and "Lihat" returns to the tray.
- **Errors in plain words.** The catalogue never shows the server's message (it could be a database stack trace, as on the local server); it says "Katalog lengkap belum bisa dimuat. Makanan dasar tetap bisa dicari." and keeps "Coba muat lagi".

Verified at 375 px with test data: empty sheet, "ayam" → tap "Dada ayam" (250 g), "+" → 315 g, the bar while searching, three foods on the tray, one blue "Simpan 3 makanan · 475 kkal". Tests 372 pass, typecheck and build pass.
