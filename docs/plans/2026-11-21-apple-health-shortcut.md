# Apple Health into Latihan through an iPhone Shortcut (21 Nov 2026)

Richie: "aku bisa tahu kalau misalnya hari ini aku jalan berapa, kan data diambil dari Apple Watch." Latihan's "Hari ini" card only knew what he typed in. This release brings in what the Watch measured: steps, active energy and, when sent, walking distance.

## Route: a Shortcut, not HealthKit

R2·FIT runs on his iPhone as a home-screen web app (PWA). A web app cannot read HealthKit. The options were:

| Route | Cost | Verdict |
|---|---|---|
| HealthKit plugin in the Capacitor iOS app | Xcode (not installed), Apple Developer Program ($99/yr), a device build, the Health entitlement | Later, if the native app ships |
| Export the Health XML by hand | Free, but a 100+ MB zip, manual, never daily | No |
| **iPhone Shortcut ("Pintasan") posts the day's numbers** | Free, built into iOS, can run on a timer | **Chosen** (Richie picked "Pintasan, gratis") |

The Shortcut reads today's Steps and Active Energy from Health, sums each, and POSTs them as JSON to R2·FIT. An Automation runs it every evening without a tap.

## Step 1: user and goal

```
Who:        Richie, wears an Apple Watch, logs food and gym in R2·FIT on his phone
Job:        see today's real steps and active calories in Latihan without typing them
Done when:  after the evening Shortcut runs, "Hari ini" shows Apple Health's numbers,
            and nothing he also logged by hand is counted twice
Frequency:  set up once; data arrives daily
```

## Step 2: flow and clicks

- Setup (once, about 5 minutes): Latihan → "Hubungkan Apple Health" → "Buat token" → copy URL and token → build the Shortcut from the numbered steps → add a 21.00 Automation with "Jalankan Langsung".
- Daily: 0 taps. The Shortcut posts; the app pulls on open or when it comes back to the front.
- Check: the card's footer says "Apple Health diperbarui hari ini 21.00 · Atur".

## Step 3: hierarchy (375 px)

```
[Hari ini]            dari Apple Health        ← or "perkiraan"
≈ 521 kkal aktif terbakar
Apple Health   8.400 langkah · 6,1 km    521 kkal
Sepeda         30 menit · sedang          sudah termasuk   [×]
Langkah        6.200 langkah              sudah termasuk   [×]
[+ Catat aktivitas]
Total memakai kalori aktif dari Apple Health …
Apple Health diperbarui hari ini 23.50 · Atur
```

The setup page (`/settings/health`) is one column: a status line, then three numbered cards (1 Salin alamat dan token, 2 Buat pintasan, 3 Kirim otomatis setiap malam), then "Kembali ke Latihan". The bottom bar highlights Latihan there, because that is where it is opened from.

## Step 4: states

| Region | No data | Steps only | Steps + energy |
|---|---|---|---|
| Hari ini total | sum of estimates, "perkiraan" | estimates + Health steps estimate; hand-logged steps "diganti Apple Health" | Health active energy, "dari Apple Health"; every other row "sudah termasuk" |
| Footer link | "Hubungkan Apple Health (langkah dan kalori dari Apple Watch)" | "Apple Health diperbarui … · Atur" | same |
| Setup status | hidden | "Terakhir diterima hari ini 21.00: 9.100 langkah." | "… : 8.400 langkah · 521 kkal aktif." Older: "Terakhir diterima kemarin 21.00. Hari ini belum ada data." |
| Setup token | "Buat token" | token field + "Salin" | same |
| Errors | "Token belum bisa dibuat. Periksa koneksi lalu coba lagi." | the Shortcut shows the server's Bahasa message (bad token, bad date, numbers out of range) | |

## How it works

**Token (`lib/widgetToken.ts`).** `signHealthToken(userId)` is the same HMAC token as the home-screen widget's, plus a purpose field `p: "health"`, valid for a year. `verifyHealthToken` accepts only `p === "health"`; `verifyWidgetToken` now accepts only tokens without `p`. So the read-only widget token cannot post health data, and the send-only health token cannot read the widget's summary. `GET /api/widget/health-token` mints one for the signed-in user.

**Ingest (`app/api/widget/health/route.ts`).** `POST` with `Authorization: Bearer <token>` (or `?token=`). The body is parsed by `parseHealthPayload` (`lib/healthImport.ts`):
- keys in English or Bahasa: `steps`/`langkah`, `activeKcal`/`kalori_aktif`/`energi_aktif`, `distanceKm`/`jarak_km`, `date`/`tanggal` (default: today, China Standard Time);
- numbers as numbers or text in either locale: "6.200" and "6,200" are 6200, "410,5 kkal" is 410.5 (one separator followed by exactly three digits is a thousands separator);
- refused with a Bahasa reason: no steps and no energy, a date not in YYYY-MM-DD, a future date, steps over 200.000, energy over 10.000 kkal, distance over 300 km.

The day is stored in the existing `ActivityLog` table (`action "health.day"`, `entityId` = date, JSON payload with `receivedAt`). No schema change, and the Vercel build (`build:app`) runs no `prisma db push`. A resend for the same date replaces that row. The reply's `message` ("Terkirim ke R2·FIT: 6.200 langkah · 411 kkal aktif") is what the Shortcut's optional notification shows.

`GET /api/widget/health?from=` (session cookie) returns the newest value per date. `ServerSync` pulls it with the other data, `lib/health.ts` keeps the days per user in `richie.health.v1`, and Latihan re-reads on the soft-refresh event.

**One total, nothing counted twice (`combineDay`).**
- Health active energy present: it **is** the total. The Watch already saw the gym session and the walk, so the estimates stay visible as "sudah termasuk" but are not added.
- Health steps only: they replace the hand-logged steps ("diganti Apple Health"); the gym and other activities still add up.
- No Health data: the estimates add up, as before.

As before, this burn is shown on its own and is not added to "kkal tersisa".

## Also fixed on the way

- **Fresh data did not appear until a second open.** In development React runs ServerSync's effect twice; the first, cancelled run saved the new records but skipped the refresh, and the re-run found nothing new. The refresh now fires whenever records were saved. Production ran the effect once, so it was mostly a dev problem, but the fix also covers any future re-run.
- Amounts like "6.200 langkah" and "6,1 km" no longer break across lines, and "diganti Apple Health" wraps in its own column instead of running into the activity name.

## Verification

- `lib/healthImport.test.ts` (6 tests: number formats, English and Bahasa keys, refusals, the three merge rules) and `lib/widgetToken.test.ts` (3 tests: health and widget tokens refuse each other, tampering, expiry). Full suite 386 pass, `tsc --noEmit` clean, `npm run build:app` passes, `ui_lint.py` 0 errors on the changed screens.
- End to end against a throwaway local Postgres:
  - POST "6.200" / "410,5" stores 6200 / 410.5 and replies in Bahasa.
  - A widget token gets 401.
  - "21/11/2026" gets "Tanggal harus berformat YYYY-MM-DD."
  - A resend with Bahasa keys replaces the same row.
  - The token made by the setup page's "Buat token" posts with no cookie.
- At 375 px:
  - Energy + steps: 521 kkal "dari Apple Health", with the logged rows "sudah termasuk".
  - Steps only: 9.100 langkah ≈ 269 kkal + cycling 220 = 489, with the logged steps "diganti Apple Health".
  - New data appears on open and when the app returns to the front.
  - The setup page shows status, token and instructions.

The Shortcut itself was not run on an iPhone from here. The action names in the instructions follow iOS's English labels with the Indonesian ones first; they may differ slightly by iOS version.

## Limits and next steps

- **Workouts are not imported yet** (type, duration, heart rate). The Shortcut can read "Find Workouts"; a later version could post them as activities.
- **Revoking a token** means rotating `AUTH_SECRET`, which also signs out sessions and widget tokens. A per-token list would need a table.
- Hand-logged activities are still stored on the device only; Health days sync through the server.
- Until the evening run, today's card shows only the hand-logged estimates. Running the Shortcut more often, or by hand, is fine: the newest send for a date wins.
