# Panduan Deployment — Dash Food POS (Apps Script + Google Sheets + PWA GitHub Pages)

> **Update ke v1.5 (tema warna + APK):** alamat disarankan: GitHub Organization `dashfood-pos.github.io` atau domain sendiri (§10). tempel ulang `App.html, Styles.html, Index.html` → **New version**. Backend & schema tidak berubah. APK: bagian 11.
>
> **Update ke v1.4 (anti-slop, mode gelap, navigasi instan):** tempel ulang `App.html, Styles.html, Index.html` → **New version**. Backend & schema tidak berubah. Detail: `UPDATE_v1.4.md`.
>
> **Update ke v1.3 (UI oranye + PWA):** tempel ulang `Api.gs, App.html, Styles.html, Index.html` → **Deploy → Manage deployments → Edit → New version** (URL `/exec` tetap). Tidak ada perubahan schema. Untuk versi yang bisa di-install di HP, ikuti bagian 10.

Waktu yang dibutuhkan: ±20 menit. Tidak butuh coding.

> **Update ke v1.2:** tempel ulang `Config.gs, Db.gs, Products.gs, Orders.gs, Payments.gs, Media.gs, Settings.gs, Api.gs, Index.html, App.html, Styles.html` → jalankan `setupDashFood()` (menambah kolom `ORDERS.receipt_logo_url`, `ORDERS.revision`, sheet `ORDER_EVENTS`) → `checkInstall()` → **Deploy → Manage deployments → Edit → New version**. Rollback: pilih versi deployment sebelumnya. Lihat `UPDATE_sprint2.md` §8 untuk checklist uji.

## 1. Siapkan spreadsheet & proyek Apps Script

1. Buat Google Spreadsheet baru, beri nama misalnya **Dash Food — Database**.
2. Menu **Extensions → Apps Script**. Proyek Apps Script terikat ke spreadsheet ini.
3. Di editor Apps Script, buka ⚙️ **Project Settings**:
   - Centang **Show "appsscript.json" manifest file in editor**.
   - Pastikan **Time zone** = `(GMT+08:00) Makassar` / `Asia/Makassar`.

## 2. Salin file dari folder `src/`

Buat file dengan nama **persis sama** (Apps Script menambahkan ekstensi otomatis):

| File di paket | Jenis di editor | Nama di editor |
|---|---|---|
| `appsscript.json` | (sudah ada) | ganti isinya |
| `Config.gs`, `Utils.gs`, `Db.gs`, `Setup.gs`, `Auth.gs`, `Settings.gs`, `Products.gs`, `Inventory.gs`, `Orders.gs`, `Payments.gs`, `Expenses.gs`, `Reports.gs`, `Media.gs`, `Api.gs` | Script (+ → Script) | `Config`, `Utils`, … |
| `Index.html`, `Styles.html`, `Icons.html`, `App.html` | HTML (+ → HTML) | `Index`, `Styles`, `Icons`, `App` |

Hapus `Code.gs` bawaan bila kosong. Urutan file tidak berpengaruh (sudah diuji dengan urutan terbalik).

> Alternatif untuk developer: `clasp create --type sheets` lalu `clasp push` dari folder `src/`.

## 3. Buat struktur sheet

1. Di editor, pilih fungsi **`setupDashFood`** → **Run**. Izinkan akses saat diminta (Spreadsheet).
2. Kembali ke spreadsheet: akan muncul 16 sheet (`SETTINGS`, `CATEGORIES`, `PRODUCTS`, … `USERS`).
3. Fungsi ini aman dijalankan ulang; hanya menambah yang belum ada.

## 3b. Izin Google Drive (upload foto)

Jalankan **`authorizeMedia`** → setujui izin Drive. Lalu jalankan **`checkInstall`** — harus "Semua file .gs lengkap".

## 4. Buat admin pertama (password tidak ditulis di kode)

1. ⚙️ **Project Settings → Script Properties → Add script property**:
   - `INIT_ADMIN_USERNAME` = mis. `admin`
   - `INIT_ADMIN_PASSWORD` = password minimal 8 karakter
   - `INIT_ADMIN_NAME` = mis. `Dion` (opsional)
2. Jalankan fungsi **`setupInitialAdmin`**. Property password otomatis dihapus setelah akun dibuat.

## 5. Data: demo atau asli

- **Uji coba:** jalankan `seedDemoData` → 3 produk & 3 topping sesuai PRD §7, `data_mode = DEMO`, aplikasi menampilkan label **DEMO**.
- **Produksi:** jangan jalankan `seedDemoData`. Masukkan produk, harga, dan stok asli lewat aplikasi (Lainnya → Kelola Produk / Harga Produk / Produksi).
- Bila sempat memakai data demo lalu beralih ke data asli: buat spreadsheet baru (paling bersih), atau ganti semua harga/stok lalu jalankan `setDataModeProduction`.

## 6. Deploy Web App

1. **Deploy → New deployment → Select type: Web app**.
2. **Execute as:** *Me*. **Who has access:** *Anyone* (login aplikasi tetap wajib).
3. **Deploy** → salin URL `…/exec`.
4. Buka URL di Chrome Android → menu ⋮ → **Add to Home screen**.

Setiap kali kode diubah: **Deploy → Manage deployments → Edit → Version: New version** (URL tetap sama).

## 7. Checklist uji setelah deploy (wajib di perangkat nyata)

Hal di bawah **tidak bisa diuji di lingkungan pengembangan** dan harus dicek di akun Google Anda:

- [ ] Ponsel Android: aplikasi memenuhi lebar layar, tidak ada kolom sempit/sidebar hitam.
- [ ] Chrome Android dengan **Desktop site** dicentang: tampilan tetap seperti ponsel (di-zoom otomatis).
- [ ] Penjualan cash Offline → struk → **Cetak** (dialog print Android / printer Bluetooth).
- [ ] **Download PDF** di struk. Jika diblokir sandbox iframe, gunakan Cetak → *Simpan sebagai PDF* dan laporkan.
- [ ] **Bagikan** membuka share sheet Android.
- [ ] Tombol **Kembali** Android: menutup sheet / kembali satu layar, tidak keluar dari aplikasi.
- [ ] Dua HP menekan **Selesaikan Transaksi** untuk produk dengan stok terakhir pada waktu bersamaan → hanya satu yang berhasil.
- [ ] **Backup Data** membuat spreadsheet baru di Drive.
- [ ] Waktu transaksi sesuai WITA.

## 8. Rollback

- Kode: **Deploy → Manage deployments → Edit → Version** → pilih versi sebelumnya.
- Data: sheet tidak pernah dihapus/di-rename oleh kode. Untuk memulihkan data, buka file **Backup Dash Food yyyyMMdd-HHmm** di Drive dan salin sheet yang diperlukan.
- Akun pengguna tidak ikut backup (berisi hash password); buat ulang via `setupInitialAdmin` bila perlu.

## 9. Logo brand & foto produk

> Sejak v1.1: unggah langsung lewat **Pengaturan → Ikon Channel & Pembayaran** dan tombol **Upload Foto** di form produk/topping/Informasi Toko. Bagian di bawah berlaku untuk opsi URL.


- Aplikasi **tidak menyertakan** logo GoFood, GrabFood, ShopeeFood, WhatsApp, DANA, ShopeePay, QRIS. Ambil file resmi dari brand kit/press kit masing-masing, simpan di hosting/Drive publik, lalu isi URL https-nya di **Pengaturan → Daftar Channel / Metode Pembayaran**. Tanpa URL, aplikasi memakai tile warna brand + nama.
- Foto produk: isi **URL foto** di Kelola Produk/Topping. Gunakan foto milik Dash Food atau yang berizin. Bila URL gagal dimuat, aplikasi menampilkan placeholder (diuji).
- Link Google Drive harus berupa link gambar langsung yang publik (mis. `https://drive.google.com/thumbnail?id=FILE_ID&sz=w800`).

## 10. PWA di GitHub Pages (bisa di-install, tampilan bersih)

Kenapa perlu: Web App Apps Script selalu tampil di dalam bingkai Google (kadang dengan banner *"This application was created by another user"*) dan tidak bisa di-install sebagai aplikasi. Versi PWA memakai **UI yang sama** dan di-host di GitHub Pages. Data tetap diambil dari Apps Script lewat `doPost`.

```
HP (PWA, github.io) ──POST text/plain──▶ Apps Script /exec (doPost → api()) ──▶ Google Sheets
```

**Syarat (sekali saja):**
1. Bagian 1–6 di atas sudah selesai. `Api.gs` versi v1.3 (berisi `doPost`) sudah ditempel dan di-deploy sebagai **New version**.
2. Deployment Web App: **Execute as: Me**, **Who has access: Anyone**. Kalau aksesnya "Anyone with Google account" atau hanya domain, PWA akan menampilkan pesan *"Pastikan Web App di-deploy dengan akses Anyone"*.
3. Salin URL yang berakhiran **`/exec`** (bukan `/dev`).

**Pilih alamat aplikasi (pilih satu):**

| Pilihan | Alamat | Biaya | Catatan |
|---|---|---|---|
| **A. GitHub Organization (disarankan)** | `https://dashfood-pos.github.io/` | gratis | Terpisah total dari akun pribadi/portofolio. Tanpa ubah kode. |
| B. Domain sendiri | `https://dashfood.my.id/` | ±Rp20–35 rb/tahun | Tambahan dari A: isi variabel `DF_CUSTOM_DOMAIN`. Wajib diperpanjang. |
| C. Sub-halaman akun pribadi | `https://<akun>.github.io/dashfood/` | gratis | Perlu menaruh 1 file di repo portofolio (§11). Berbagi penyimpanan browser dengan project lain. |

**A. Organization:** di GitHub klik foto profil → *Your organizations* → *New organization* → **Free** → beri nama (mis. `dashfood-pos`). Di org itu buat repo bernama **persis** `dashfood-pos.github.io` (nama org + `.github.io`). Semua langkah di bawah dilakukan di repo org tersebut.

**B. Domain sendiri** (setelah A jalan):
1. Beli domain (mis. `dashfood.my.id`), **aktifkan auto-renew**.
2. Di panel DNS registrar buat record **CNAME**: nama `@` (atau `www`, sesuai yang dipakai) → `dashfood-pos.github.io`. Kalau registrar tidak mengizinkan CNAME di root (`@`), pakai 4 record **A** ke `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
3. Repo → Settings → Secrets and variables → Actions → **Variables** → `DF_CUSTOM_DOMAIN` = `dashfood.my.id` (tanpa `https://`).
4. Jalankan ulang workflow Pages, lalu Settings → Pages → centang **Enforce HTTPS** (setelah sertifikat terbit, bisa beberapa menit–jam).
5. Build ulang APK (§11) — alamat APK otomatis pindah ke domain baru. APK lama perlu login ulang sekali; data aman di Sheets.

**Langkah di GitHub:**
1. Buat repository (sesuai pilihan di atas), lalu push isi folder proyek ini. `.gitignore` sudah mengecualikan `node_modules`, `dist-web`, dan screenshot.
   - GitHub Pages di akun **Free** hanya untuk repo **public**. Kode ini tidak berisi password atau ID spreadsheet: ID tersimpan di Script Properties, password di-hash di sheet. Folder `docs/` (PRD, prototype) boleh dihapus kalau tidak ingin ikut publik.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → tab Variables → New repository variable**:
   - Name: `DF_API_URL`
   - Value: URL `/exec` tadi
4. Buka tab **Actions** dan jalankan workflow **Deploy PWA ke GitHub Pages** (otomatis jalan setiap push ke `main`). Build akan **gagal dengan pesan jelas** bila `DF_API_URL` kosong atau bukan URL `/exec`.
5. Buka `https://<username>.github.io/<nama-repo>/` di Chrome Android → menu ⋮ → **Install app** / **Tambahkan ke layar utama**.

**Ganti ikon aplikasi dengan logo resmi** (disarankan; ikon bawaan memakai logo pisang default):
```bash
npm install
npm run icons -- path/ke/logo-banana-bites.png "#15110E"   # argumen ke-2 = warna latar ikon
git add web/icons && git commit -m "Ikon PWA dari logo resmi" && git push
```

**Update tampilan:** ubah file di `src/` → push → workflow membangun ulang otomatis. Service worker memakai strategi network-first untuk halaman, jadi versi baru terpakai saat aplikasi dibuka lagi dalam keadaan online. Nomor build terlihat di **Pengaturan** (baris bawah: `v1.3 · web <build>`).
Perubahan `.gs` tetap harus di-deploy di Apps Script (New version).

**Batasan yang perlu diketahui:**
- Aplikasi butuh internet. Saat offline, kerangka aplikasi tetap terbuka, tetapi data tidak bisa dimuat. Muncul pesan *"Gagal terhubung… (sedang offline)"* dan tombol **Coba lagi**. Transaksi tidak disimpan offline. Ini disengaja untuk mencegah stok dan pembayaran ganda.
- Sesi login PWA terpisah dari sesi di link `/exec`, karena penyimpanan browsernya berbeda.
- Kecepatan tetap bergantung pada Apps Script (biasanya 1–3 detik per panggilan).

**Checklist uji setelah deploy PWA (di HP asli):**
- [ ] Ikon muncul di layar utama dan aplikasi terbuka tanpa address bar.
- [ ] Login, transaksi cash sampai struk, dan stok berkurang satu kali (cek sheet STOCKS).
- [ ] Upload foto produk dan logo struk berhasil.
- [ ] Cetak struk, Download PDF, dan Bagikan gambar ke WhatsApp.
- [ ] Mode pesawat → buka app → muncul pesan offline. Nyalakan internet → **Coba lagi** → data muncul.
- [ ] Tombol kembali Android: menutup sheet/mundur satu layar; dari Beranda keluar aplikasi.

## 11. APK Android (dibungkus dari PWA, dibuild di GitHub)

APK ini adalah **Trusted Web Activity (TWA)**: aplikasi Android kecil yang membuka PWA di bagian 10 memakai mesin Chrome, layar penuh, dengan ikon sendiri.
- **Data tetap sinkron.** APK tidak punya database sendiri. Semua baca-tulis lewat Apps Script ke Google Sheets yang sama dengan PWA dan link `/exec`. Transaksi di HP A langsung tersimpan di Sheets, dan HP B melihatnya saat layar diperbarui (otomatis ≤ 20 detik atau saat dibuka).
- Tetap butuh internet. Transaksi tidak disimpan offline; ini sengaja, untuk mencegah stok atau pembayaran ganda.
- Tampilan **ikut ter-update otomatis** setiap kali PWA di-push ke GitHub. APK baru hanya perlu dibuat bila ikon, nama, atau alamat berubah.
- Cetak, PDF, dan Bagikan struk ke WhatsApp berjalan seperti di Chrome. HP wajib punya Chrome (bawaan Samsung sudah ada).

**Langkah (sekali):**
1. **Alamat** sesuai pilihan di §10:
   - **A (organization)** atau **B (domain sendiri)**: tidak perlu langkah tambahan. `assetlinks.json` otomatis berada di root domain milik aplikasi ini.
   - **C (sub-halaman akun pribadi, mis. `/dashfood/`)**: salin `dist-web/.well-known/assetlinks.json` ke repo portofolio `<akun>.github.io` di path `.well-known/assetlinks.json`. Kalau portofolio memakai Jekyll (`_config.yml`), tambahkan `include: [".well-known"]`. Kalau HTML biasa, tambahkan file kosong `.nojekyll`. APK hanya menangkap link di bawah `/dashfood/`; halaman portofolio tetap dibuka di browser.
2. Bagian 10 sudah jalan dan PWA bisa dibuka di `https://<username>.github.io/`.
3. **Settings → Secrets and variables → Actions → tab Secrets → New repository secret**:
   - `DF_KEYSTORE_BASE64` = seluruh isi `dashfood-release.keystore.base64.txt`
   - `DF_KEYSTORE_PASSWORD` = kata sandi di `KATA-SANDI.txt`
4. Tab **Actions → Build APK Android → Run workflow**. Tunggu sekitar 3–6 menit.
5. Di HP, buka halaman **Releases** repo → unduh `DashFood-1.5.x.apk` → buka → izinkan *Instal aplikasi tidak dikenal* → Instal.

**Kunci tanda tangan (`dashfood-release.keystore`):**
- Simpan baik-baik di luar repo (Google Drive pribadi + catat kata sandinya). File kunci sudah masuk `.gitignore`.
- **Kalau kunci hilang**, APK versi baru tidak bisa dipasang di atas versi lama. Solusinya: uninstall lalu pasang ulang (data aman di Sheets), dan buat kunci baru (`keytool`), lalu perbarui `web/pwa.config.json → twa.sha256`.
- Workflow **menolak build** bila sidik jari kunci di Secrets ≠ `twa.sha256`, supaya address bar tidak muncul diam-diam.

**Update APK:** jalankan lagi workflow. Nomor versi naik otomatis dan bisa dipasang di atas versi lama (kuncinya sama).

**Checklist uji APK di HP:**
- [ ] Ikon "Dash Food" muncul, aplikasi terbuka **tanpa address bar**. Kalau address bar muncul, cek `https://<username>.github.io/.well-known/assetlinks.json` bisa dibuka dan isinya berisi sidik jari yang sama.
- [ ] Login, transaksi sampai struk; buka PWA/`/exec` di perangkat lain → transaksi yang sama terlihat.
- [ ] Cetak, PDF, Bagikan struk.
- [ ] Mode gelap dan warna aksen tersimpan setelah aplikasi ditutup.
