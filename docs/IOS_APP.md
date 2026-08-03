# R2·FIT di iPhone — dari repo ke TestFlight

Semua yang bisa dikerjain di repo udah beres. Yang tersisa cuma langkah yang
**wajib jalan di Mac** (Xcode, signing, upload) — itu nggak bisa dikerjain dari
container Linux, jadi ini panduannya.

Target rilis: **TestFlight internal testing**. Maksimal 100 orang, nggak lewat
App Review, undangan via email. Build kedaluwarsa tiap **90 hari** — tinggal
upload build baru.

---

## 0. Bentuk aplikasinya

Ini **bukan** rewrite. Aplikasinya tetap web app yang sekarang; yang ditambah:

```
iPhone
 ├── R2·FIT.app          ← WKWebView nunjuk ke https://r2-fit.vercel.app
 │     └── R2WidgetBridge  (Swift) → nulis token ke App Group
 └── R2FitWidget           ← WidgetKit, baca App Group, panggil /api/widget/today
```

Konsekuensi yang perlu kamu tau:

- **Deploy ke Vercel = update ke semua HP.** Nggak perlu upload build baru buat
  ganti UI, nambah makanan, apa pun. Build baru cuma perlu kalau kode Swift-nya
  berubah atau build-nya expired.
- **Butuh internet.** Ada halaman offline, tapi datanya di server.
- Kalau nanti mau masuk App Store beneran (bukan TestFlight), Apple bakal
  nilai ini di bawah **Guideline 4.2 (Minimum Functionality)**. Widget, quick
  action, dan haptics native itu yang bikin lolos. Buat TestFlight internal
  nggak ada review sama sekali.

---

## 1. Yang dibutuhin

| Item | Catatan |
|---|---|
| Mac + Xcode 15+ | Xcode 16 ke atas lebih enak buat widget |
| Apple Developer Program | **$99/tahun** — nggak bisa dihindarin, akun gratis nggak bisa TestFlight |
| CocoaPods | `sudo gem install cocoapods` atau `brew install cocoapods` |
| Node 20+ | buat `npx cap` |

Bundle ID yang dipakai di repo: `com.richienv.r2fit`
App Group: `group.com.richienv.r2fit`

Kalau mau ganti, ganti di **empat** tempat sekaligus:
`capacitor.config.ts`, `ios/App/App/App.entitlements`,
`ios/App/R2FitWidget/R2FitWidget.entitlements`, dan konstanta `appGroup` di
`ios/App/App/R2WidgetBridge.swift` + `ios/App/R2FitWidget/R2FitStore.swift`.

---

## 2. Siapin project (Mac, terminal)

```bash
git clone <repo> && cd fitness
npm install
npx cap sync ios      # copy web fallback + jalanin pod install
npx cap open ios      # buka ios/App/App.xcworkspace di Xcode
```

`npx cap sync ios` **harus** jalan di Mac minimal sekali — itu yang bikin
`ios/App/Pods` dan `App.xcworkspace` beneran kepakai. Selalu buka
`.xcworkspace`, jangan `.xcodeproj`.

---

## 3. Signing app utama (Xcode)

1. Pilih target **App** → tab **Signing & Capabilities**.
2. Centang **Automatically manage signing**, pilih **Team** kamu.
3. Bundle Identifier: `com.richienv.r2fit`.
4. Klik **+ Capability** → **App Groups** → centang / tambahin
   `group.com.richienv.r2fit`.

Langkah 4 penting: bukan cuma nulis entitlement, tapi juga **daftarin App Group
itu ke akun developer kamu**. File `App.entitlements` udah ada di repo dan udah
ke-link ke target, tapi grup-nya tetep harus di-register lewat UI ini.

Coba **Run** ke iPhone kamu sekarang. Kalau aplikasi kebuka dan nampilin R2·FIT
seperti di browser — shell-nya udah beres.

---

## 4. Bikin target widget (Xcode)

Source Swift-nya udah ditulis dan ada di `ios/App/R2FitWidget/`. Yang belum:
target-nya sendiri. Target extension itu punya build phase, embed phase, dan
entitlement sendiri — bikin itu lewat wizard Xcode jauh lebih aman daripada
nyunting `project.pbxproj` dari luar, makanya sengaja nggak digenerate.

1. **File → New → Target… → Widget Extension**.
2. Product Name: **`R2FitWidget`** (persis, biar folder-nya nyambung).
   - **Uncheck** "Include Live Activity"
   - **Uncheck** "Include Configuration App Intent" (widget-nya static)
3. Xcode nanya "Activate scheme?" → **Activate**.
4. Xcode bikin file template (`R2FitWidget.swift`, `R2FitWidgetBundle.swift`,
   dll) di folder baru. **Hapus semua file .swift template itu**
   (Move to Trash).
5. Klik kanan grup `R2FitWidget` → **Add Files to "App"…** → pilih
   `ios/App/R2FitWidget/R2FitWidget.swift` dan `R2FitStore.swift` →
   pastikan **Target membership: R2FitWidget** dicentang (dan App **tidak**).
6. Target **R2FitWidget** → **Signing & Capabilities**:
   - Team yang sama
   - Bundle ID: `com.richienv.r2fit.R2FitWidget`
   - **+ Capability → App Groups** → centang `group.com.richienv.r2fit`
7. Target **R2FitWidget** → **Build Settings**:
   - `iOS Deployment Target` = **17.0**
     (`.contentMarginsDisabled()` butuh iOS 17)
   - `Info.plist File` = `R2FitWidget/Info.plist`
     (kalau Xcode udah nunjuk ke Info.plist buatannya sendiri, arahin ke yang
     di repo — yang itu `CFBundleDisplayName`-nya udah "R2·FIT")

Kalau ada error `Multiple commands produce Info.plist`, set
`GENERATE_INFOPLIST_FILE = NO` di target widget.

---

## 5. Coba widget-nya

1. Run ke iPhone beneran (widget nggak jalan bener di Simulator kalau
   networknya perlu).
2. Login di app.
3. Keluar ke home screen → tahan → **+** → cari **R2·FIT** → tambah widget
   kecil.

Widget harus langsung nampilin kalori hari ini.

**Kalau tulisannya "Belum tersambung":** token belum nyampe App Group. Berarti
App Group belum sama persis di dua target, atau salah satu belum di-register.
Buka app → **Settings → iPhone Widget → SAMBUNGKAN ULANG**, terus cek lagi.

**Kalau "Nggak ada koneksi":** endpoint-nya nggak kejangkau. Tes manual:

```bash
curl "https://r2-fit.vercel.app/api/widget/today?token=<token>"
```

Token-nya bisa diambil dari kartu "URL DATA" di halaman
**Settings → iPhone Widget**.

### Kapan widget-nya update

iOS yang nentuin, bukan kita. Timeline minta refresh tiap 15 menit dan iOS
sering ngasih lebih jarang. Yang bikin langsung update adalah
`reloadAllTimelines()` yang dipanggil tiap app nge-push token — dan app
nge-push token **tiap kali kamu keluar dari app**. Jadi alur normalnya:
catat makan → balik ke home screen → angkanya udah baru.

---

## 6. Upload ke TestFlight

1. **App Store Connect** → My Apps → **+** → New App
   - Platform iOS, Bundle ID `com.richienv.r2fit`
   - SKU bebas, mis. `r2fit`
2. Di Xcode: pilih device **Any iOS Device (arm64)**
3. **Product → Archive**
4. Di Organizer: **Distribute App → TestFlight (Internal Only)** → Upload
5. Tunggu ±10 menit sampai "Processing" selesai
6. App Store Connect → app kamu → **TestFlight** → **Internal Testing** →
   bikin grup → **+** tambah tester lewat email

Tester install **TestFlight** dari App Store, buka undangan di email, tap
Install. Kelar.

### Buat build berikutnya

Naikin `CURRENT_PROJECT_VERSION` (build number) di target App **dan**
R2FitWidget — dua-duanya harus sama. Archive lagi, upload lagi.
`MARKETING_VERSION` cuma perlu naik kalau mau nandain rilis baru.

**Internal testing nggak lewat App Review sama sekali.** Yang ada cuma
proses otomatis ±10 menit.

---

## 7. Kalau nanti mau monetize

Belum ada apa pun soal ini di kode — memang sengaja, kamu bilang gratis dulu.
Waktu nanti mau:

- **Langganan / one-time purchase**: butuh StoreKit 2 + produk di App Store
  Connect + server-side receipt validation. Apple ambil 15% (di bawah $1jt/tahun).
  Ini yang **wajib** dipakai kalau yang dijual adalah fitur di dalam app.
- **Bayar di luar app** (mis. transfer, langganan lewat web): boleh, tapi app
  **nggak boleh** nunjuk ke situ (Guideline 3.1.3). Aturannya lagi berubah-ubah
  di beberapa negara — cek lagi pas waktunya.
- Begitu ada pembayaran, app-nya **harus** lewat App Review beneran, dan
  Guideline 4.2 jadi relevan. Widget + quick action yang udah ada sekarang itu
  modal buat argumen "ini bukan sekadar bungkus website".

---

## Peta file

| File | Isinya |
|---|---|
| `capacitor.config.ts` | app id, nama, URL server |
| `native/www/index.html` | layar fallback kalau server nggak kejangkau pas launch |
| `ios/App/App/AppDelegate.swift` | quick action + deep link `r2fit://` |
| `ios/App/App/R2WidgetBridge.swift` | plugin Capacitor → App Group |
| `ios/App/R2FitWidget/R2FitStore.swift` | baca App Group, panggil API |
| `ios/App/R2FitWidget/R2FitWidget.swift` | tampilan widget (SwiftUI) |
| `lib/native.ts` | sisi web dari bridge (nggak import @capacitor/*) |
| `app/NativeBridge.tsx` | push token pas launch & pas app ditutup |
| `app/manifest.ts` | manifest PWA (buat Add to Home Screen di browser) |
| `public/sw.js` | service worker: aset offline + halaman offline |

## Yang di-skip, dan kenapa

- **Push notification** — butuh APNs key, entitlement, dan UI izin. Nggak ada
  di scope ini. Kalau nanti mau reminder "belum catat makan malam", ini
  langkah berikutnya yang paling masuk akal.
- **HealthKit** — bisa nulis kalori/berat ke Apple Health. Nambah nilai buat
  Guideline 4.2 kalau nanti masuk App Store beneran.
- **Android** — `npx cap add android` jalan dengan config yang sama. Widget-nya
  harus ditulis ulang (Glance/RemoteViews), tapi shell-nya gratis.
