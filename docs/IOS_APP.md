# R2·FIT di iPhone

Ada dua jalan. Yang pertama **gratis dan udah jalan sekarang** — itu yang
dipakai. Yang kedua butuh bayar Apple $99/tahun, dan kodenya udah disiapin di
repo buat kapan pun mau dipakai.

| | Gratis (PWA) | Bayar ($99/th) |
|---|---|---|
| Ikon di home screen | ✅ | ✅ |
| Full screen, tanpa browser | ✅ | ✅ |
| Temen bisa pasang sendiri | ✅ lewat link | ⚠️ maks 100 orang, diundang satu-satu |
| Widget kalori di home screen | ✅ lewat Scriptable | ✅ bawaan |
| Long-press ikon → shortcut | ❌ | ✅ |
| Kedaluwarsa | ❌ nggak pernah | ⚠️ tiap 90 hari, harus upload ulang |
| Muncul di App Store | ❌ | ❌ (TestFlight ≠ App Store) |
| Biaya | **Rp 0** | ~Rp 1,6jt/tahun |

Perhatiin baris terakhir sebelum biaya: **TestFlight juga nggak bikin app-nya
muncul di App Store.** Jadi yang kamu "beli" dengan $99 itu cuma widget bawaan
dan quick action. Sisanya udah kamu punya gratis.

---

# BAGIAN 1 — Cara gratis (dipakai sekarang)

## Buat kamu dan temen-temen

Kirim satu link:

```
https://r2-fit.vercel.app/install
```

Halaman itu ngedeteksi HP-nya sendiri dan nampilin langkah yang bener buat
device itu doang. Di iPhone: **Share → Add to Home Screen → Add**. Tiga tap,
selesai. Ikon R2·FIT nongol di home screen, kebuka full screen, nggak ada
address bar Safari.

Di dalam app, link-nya juga ada di **Settings → Pasang di home screen**, dan
ada bar kecil yang muncul sendiri sekali buat orang yang belum pasang.

### Yang perlu kamu tau (biar nggak dikira bug)

- **Harus Safari.** Di iPhone cuma Safari yang bisa bikin app home screen
  beneran. Chrome iOS cuma bikin bookmark. Halaman `/install` udah ngasih tau
  ini otomatis kalau kebuka di Chrome.
- **Login sekali lagi.** iOS misahin penyimpanan app home screen dari Safari,
  jadi habis dipasang kamu perlu login lagi di dalam app-nya. Cuma sekali.
- **Update otomatis.** Tiap deploy ke Vercel langsung kepakai di semua HP.
  Nggak ada yang perlu install ulang apa pun, selamanya.
- **Offline.** Ada layar offline yang bener (bukan dinosaurus Safari), tapi
  datanya tetep di server — butuh internet buat nyatet.

## Widget kalori (juga gratis)

WidgetKit — widget "beneran" bawaan iOS — cuma bisa dari app native, jadi itu
masuk Bagian 2. Tapi ada jalan gratis yang hasilnya sama-sama widget di home
screen:

1. Install **Scriptable** dari App Store (gratis).
2. Di R2·FIT: **Settings → iPhone Widget** → **SALIN SCRIPT**.
3. Buka Scriptable → **+** → hapus isinya → tempel → simpan (nama: `R2FIT`).
4. Home screen → tahan → **+** → cari Scriptable → tambah widget kecil.
5. Tahan widget itu → **Edit Widget** → **Script: R2FIT**.

Hasilnya: kalori, sisa kalori, progress bar, dan makro hari ini di home screen.
Tap widget-nya → langsung buka layar catat makan.

Token-nya cuma buat akun kamu dan berlaku ±180 hari. **Jangan dibagiin** —
siapa pun yang punya token itu bisa lihat ringkasan kalorimu.

## Yang nggak bisa gratis

- **Long-press ikon → quick action.** Manifest PWA punya `shortcuts` dan
  Android nurut, tapi iOS nggak baca itu sama sekali.
- **Widget bawaan** (tanpa Scriptable).
- **Push notification.** iOS 16.4+ sebenernya udah support web push buat app
  home screen — ini yang paling masuk akal ditambah nanti, dan tetep gratis.

---

# BAGIAN 2 — Cara bayar (kodenya udah siap, belum dipakai)

Semua kode native-nya udah ada di repo. **Nggak perlu diapa-apain sekarang** —
nggak ganggu apa pun, nggak nambah beban ke web app, dan nggak akan jalan
sampai ada yang buka Xcode. Bagian ini catetan buat kamu-yang-nanti.

## Yang dibutuhin

| Item | Catatan |
|---|---|
| **Apple Developer Program** | **$99/tahun.** Nggak bisa dihindarin. |
| Mac + Xcode 15+ | Xcode 16 ke atas lebih enak buat widget |
| CocoaPods | `brew install cocoapods` |

**Akun Apple gratis nggak cukup**, dan bukan cuma karena TestFlight. Free
provisioning nggak ngasih **App Groups** — dan App Group itu satu-satunya cara
widget baca data dari app. Jadi tanpa bayar, widget native-nya nggak bakal
jalan sama sekali. Ditambah app-nya expired tiap **7 hari** dan tiap HP harus
dicolok ke Mac. Buat dibagi ke temen: nggak mungkin.

## Bentuknya

```
iPhone
 ├── R2·FIT.app          WKWebView → https://r2-fit.vercel.app
 │     └── R2WidgetBridge  (Swift) nulis token ke App Group
 └── R2FitWidget           WidgetKit, baca App Group, panggil /api/widget/today
```

Ini **bukan** rewrite — web app yang sekarang dibungkus. Konsekuensinya sama
kayak PWA: deploy ke Vercel = update ke semua HP. Build baru cuma perlu kalau
kode Swift berubah atau kena expiry 90 hari.

Bundle ID: `com.richienv.r2fit` · App Group: `group.com.richienv.r2fit`

Kalau mau ganti, ganti di **lima** tempat: `capacitor.config.ts`,
`ios/App/App/App.entitlements`, `ios/App/R2FitWidget/R2FitWidget.entitlements`,
dan konstanta `appGroup` di `R2WidgetBridge.swift` + `R2FitStore.swift`.

## Langkah-langkahnya

### 1. Siapin project

```bash
npm install
npx cap sync ios      # copy fallback + pod install
npx cap open ios      # buka App.xcworkspace
```

`npx cap sync ios` harus jalan di Mac minimal sekali. Selalu buka
`.xcworkspace`, jangan `.xcodeproj`.

### 2. Signing app utama

Target **App** → **Signing & Capabilities**:
- Centang **Automatically manage signing**, pilih Team
- Bundle ID: `com.richienv.r2fit`
- **+ Capability → App Groups** → `group.com.richienv.r2fit`

Langkah terakhir bukan formalitas: file `App.entitlements` udah ada dan udah
ke-link ke target, tapi grup-nya tetep harus **di-register ke akun developer**
lewat UI ini.

Coba **Run** ke iPhone. Kalau kebuka dan nampilin R2·FIT — shell-nya beres.

### 3. Bikin target widget

Source Swift-nya udah ditulis dan ada di `ios/App/R2FitWidget/`. Yang belum:
target-nya. Target extension punya build phase, embed phase, dan entitlement
sendiri — bikin lewat wizard Xcode jauh lebih aman daripada nyunting
`project.pbxproj` dari luar, makanya sengaja nggak digenerate.

1. **File → New → Target… → Widget Extension**
2. Product Name: **`R2FitWidget`** (persis)
   - **Uncheck** "Include Live Activity"
   - **Uncheck** "Include Configuration App Intent"
3. "Activate scheme?" → **Activate**
4. **Hapus semua file .swift template** yang dibikin Xcode (Move to Trash) —
   kalau nggak, bakal ada dua `@main` dan gagal compile
5. Klik kanan grup `R2FitWidget` → **Add Files to "App"…** → pilih
   `R2FitWidget.swift` dan `R2FitStore.swift` dari `ios/App/R2FitWidget/` →
   **Target membership: R2FitWidget** dicentang, **App** nggak
6. **Signing & Capabilities**: Team sama, Bundle ID
   `com.richienv.r2fit.R2FitWidget`, **+ Capability → App Groups** →
   `group.com.richienv.r2fit`
7. **Build Settings**:
   - `iOS Deployment Target` = **17.0** (`.contentMarginsDisabled()` butuh 17)
   - `Info.plist File` = `R2FitWidget/Info.plist`
   - kalau error `Multiple commands produce Info.plist`:
     `GENERATE_INFOPLIST_FILE = NO`

### 4. Tes widget-nya

Run ke iPhone beneran (bukan Simulator). Login. Keluar ke home screen → tahan
→ **+** → cari **R2·FIT** → tambah widget kecil.

- **"Belum tersambung"** → token belum nyampe App Group. Berarti App Group-nya
  beda antara dua target, atau belum di-register. Buka app →
  **Settings → iPhone Widget → SAMBUNGKAN ULANG**.
- **"Nggak ada koneksi"** → endpoint nggak kejangkau. Tes:
  `curl "https://r2-fit.vercel.app/api/widget/today?token=<token>"`
  (token-nya ada di kartu "URL DATA" di halaman iPhone Widget).

**Kapan widget update:** iOS yang nentuin. Timeline minta tiap 15 menit dan iOS
sering ngasih lebih jarang. Yang bikin langsung update itu
`reloadAllTimelines()` yang dipanggil tiap app nge-push token — dan app
nge-push **tiap kali kamu keluar dari app**. Jadi: catat makan → balik ke home
screen → angkanya udah baru.

### 5. TestFlight

1. **App Store Connect** → My Apps → **+** → New App, Bundle ID
   `com.richienv.r2fit`
2. Xcode: device **Any iOS Device (arm64)** → **Product → Archive**
3. Organizer → **Distribute App → TestFlight (Internal Only)** → Upload
4. Tunggu ±10 menit processing
5. App Store Connect → **TestFlight → Internal Testing** → bikin grup →
   tambah tester lewat email

Tester install **TestFlight** dari App Store, buka undangan, tap Install.

Buat build berikutnya: naikin `CURRENT_PROJECT_VERSION` di **dua** target
(App dan R2FitWidget, harus sama), archive, upload. Internal testing nggak
lewat App Review sama sekali.

## Kalau nanti mau monetize

Belum ada apa pun soal ini di kode — sengaja.

- **Langganan / IAP**: StoreKit 2 + produk di App Store Connect + validasi
  receipt. Apple ambil 15% (di bawah $1jt/tahun). Wajib pakai ini kalau yang
  dijual fitur di dalam app.
- **Bayar di luar app**: boleh, tapi app **nggak boleh** nunjuk ke situ
  (Guideline 3.1.3). Aturannya lagi berubah-ubah — cek lagi pas waktunya.
- Begitu ada pembayaran, app-nya **wajib** lewat App Review beneran, dan
  **Guideline 4.2 (Minimum Functionality)** jadi relevan: Apple nolak app yang
  cuma bungkus website. Widget + quick action yang udah ada itu modal buat
  argumen sebaliknya.

---

## Peta file

| File | Isinya | Kepakai kapan |
|---|---|---|
| `app/install/page.tsx` | halaman `/install` yang dikirim ke temen | **sekarang** |
| `app/InstallPrompt.tsx` | bar nudge di dalam app | **sekarang** |
| `lib/install.ts` | deteksi platform + memori dismiss | **sekarang** |
| `app/manifest.ts` | manifest PWA | **sekarang** |
| `public/sw.js` | service worker: aset offline + halaman offline | **sekarang** |
| `app/widget/page.tsx` | setup widget Scriptable | **sekarang** |
| `capacitor.config.ts` | app id, nama, URL server | Bagian 2 |
| `native/www/index.html` | layar fallback shell | Bagian 2 |
| `ios/App/App/AppDelegate.swift` | quick action + deep link `r2fit://` | Bagian 2 |
| `ios/App/App/R2WidgetBridge.swift` | plugin Capacitor → App Group | Bagian 2 |
| `ios/App/R2FitWidget/*.swift` | widget WidgetKit | Bagian 2 |
| `lib/native.ts` | sisi web dari bridge (no-op di browser) | Bagian 2 |
| `app/NativeBridge.tsx` | push token pas launch & pas app ditutup | Bagian 2 |

Semua yang "Bagian 2" itu **mati total** di browser: `lib/native.ts` nggak
import `@capacitor/*` sama sekali, dia cuma baca global `window.Capacitor` yang
cuma ada di dalam shell. Bundle web-nya nggak berubah seiota.

## Yang di-skip

- **Push notification** — butuh APNs key + UI izin. Buat PWA iOS 16.4+
  sebenernya bisa gratis via Web Push; ini kandidat paling kuat berikutnya
  (mis. reminder "belum catat makan malam").
- **HealthKit** — nulis kalori/berat ke Apple Health. Nambah nilai buat
  Guideline 4.2 kalau nanti masuk App Store beneran.
- **Android** — `npx cap add android` jalan dengan config yang sama. Tapi PWA
  di Android udah bagus banget (`beforeinstallprompt` bikin install satu tap),
  jadi kemungkinan besar nggak perlu.
