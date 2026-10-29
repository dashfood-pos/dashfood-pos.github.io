# Dash Food POS

Aplikasi kasir untuk usaha makanan rumahan. Dipakai untuk mencatat penjualan, mengatur stok, harga per channel (Offline, WhatsApp, GoFood, GrabFood, ShopeeFood), pengeluaran, dan melihat laporan, langsung dari HP.

**Buka aplikasinya:** https://dashfood-pos.github.io/

---

## Cara memakai

Ada tiga cara membuka Dash Food. Ketiganya memakai data yang sama, jadi transaksi di satu HP langsung terlihat di HP lain.

| Cara | Untuk siapa | Cara pasang |
|---|---|---|
| **Aplikasi Android (APK)** | HP Android | Buka halaman [Releases](../../releases/latest) dari HP → unduh file `.apk` → buka → izinkan *Instal aplikasi tidak dikenal* → Instal. |
| **Pasang dari browser (PWA)** | Android dan iPhone | Buka https://dashfood-pos.github.io/ di Chrome (Android) atau Safari (iPhone) → menu → **Tambahkan ke layar utama**. |
| **Link Google** | Laptop/komputer | Link Web App dari Google Apps Script (minta ke admin). |

Yang perlu diketahui:
- **Butuh internet.** Tanpa internet, aplikasi tetap terbuka tetapi data tidak bisa dimuat dan transaksi tidak bisa disimpan. Ini disengaja supaya stok dan pembayaran tidak tercatat dua kali.
- **Tampilan ter-update sendiri.** Kalau ada perbaikan tampilan, cukup tutup dan buka lagi aplikasinya. APK hanya perlu dipasang ulang kalau ikon atau nama aplikasi berubah.
- **Akun dibuat oleh admin**, lewat menu *Lainnya → Pengguna*. Ada tiga peran: **Admin** (semua akses), **Manager** (produk, harga, stok), dan **Staff** (kasir).

---

## Di mana data disimpan

```
HP / laptop  ──▶  Google Apps Script  ──▶  Google Sheets (database)
                                       └─▶ Google Drive (foto produk & logo)
```

- **Semua data ada di Google Sheets milik pemilik usaha.** GitHub hanya menyimpan *kode tampilan* aplikasi, tanpa data penjualan, pelanggan, atau password.
- HP hanya menyimpan salinan sementara agar layar cepat tampil. Salinan ini dihapus saat pengguna menekan **Keluar**.

---

## Keamanan

**Yang ada di repo ini (publik):** kode aplikasi, dokumentasi, ikon, dan "sidik jari" kunci APK (di `web/pwa.config.json`). Sidik jari ini memang wajib publik supaya Android bisa memastikan APK berasal dari situs ini. Sidik jari *tidak bisa* dipakai untuk membuat APK palsu.

**Yang TIDAK ada di repo ini dan tidak boleh di-commit:**
- File kunci APK (`*.keystore`) dan kata sandinya. Keduanya hanya disimpan di **GitHub Secrets** dan di penyimpanan pribadi pemilik. File `.gitignore` sudah menolak file-file ini.
- ID spreadsheet, password pengguna, dan data transaksi. Semuanya tersimpan di akun Google pemilik.

**Perlindungan di aplikasi:**
- Login wajib untuk semua data. Password disimpan dalam bentuk acak (hash + salt), bukan teks asli.
- Setelah 5 kali salah password, akun dikunci 10 menit.
- Hak akses dicek di server: Staff tidak bisa mengubah harga atau pengguna walaupun mencoba lewat jalan lain.
- Harga dihitung ulang di server, pembayaran tidak bisa dicatat dua kali, dan setiap pembatalan order tercatat di riwayat.

**Catatan untuk pemilik:**
- Foto yang diunggah ke aplikasi (produk, logo) bisa dilihat oleh siapa pun yang punya link-nya. Jangan unggah foto berisi data pribadi.
- Pakai password minimal 8 karakter yang tidak dipakai di tempat lain, dan aktifkan verifikasi dua langkah di akun Google dan GitHub.
- Jangan pernah menempel isi file kunci APK atau kata sandinya ke chat, email, atau issue.

Menemukan celah keamanan? Hubungi pemilik repo secara pribadi, jangan lewat Issues yang publik.

---

## Untuk pengembang

<details>
<summary>Struktur folder, cara menjalankan, dan cara deploy</summary>

### Teknologi
- **Backend:** Google Apps Script (`src/*.gs`) + Google Sheets. Kolom dibaca berdasarkan nama header.
- **Tampilan:** satu aplikasi HTML/JavaScript tanpa framework (`src/*.html`), dipakai oleh Apps Script, PWA, dan APK sekaligus.
- **PWA:** dibangun oleh `tools/build-web.js`, lalu otomatis di-deploy ke GitHub Pages saat ada push ke `main`.
- **APK:** Trusted Web Activity di `android/`, yaitu aplikasi kecil yang membuka PWA lewat Chrome. Dibuild oleh GitHub Actions.

### Struktur folder
```
src/            Kode yang di-deploy ke Apps Script (.gs = server, .html = tampilan)
web/            Bahan PWA: pengaturan (pwa.config.json), service worker, ikon
android/        Proyek APK Android
tools/          build-web.js (membuat PWA), make-icons.js (membuat ikon dari logo)
dev/            Alat pengembangan: Apps Script tiruan, server lokal, pengukur kecepatan, cek desain
tests/          Test otomatis (backend + tampilan di Chromium)
docs/           PRD, aturan proyek, gambar prototype
.github/workflows/
  pages.yml          deploy PWA ke GitHub Pages
  android.yml        build APK bertanda tangan + terbitkan di Releases
  apk-diagnose.yml   uji APK di emulator Android (log + screenshot)
```

### Menjalankan di laptop
```bash
npm install                 # memasang Playwright (untuk test & ikon)
npm run test:backend        # test backend
npm run test:ui             # test tampilan di Chromium
npm run check:taste         # cek aturan desain (kontras, font, warna)
npm run build:dev           # versi lokal dengan data contoh: buka dev/dist/index.html
npm run serve:web           # PWA lokal di http://localhost:4173
npm run icons -- logo.png   # membuat ikon PWA dan APK dari logo
```
Akun untuk versi lokal: `admin / admin123`, `manager / manager123`, `kasir / kasir123`. Akun ini **hanya ada di data contoh lokal** dan tidak berlaku di aplikasi asli.

### Deploy
Panduan lengkap ada di [DEPLOYMENT.md](DEPLOYMENT.md):
- Bagian 1–9: memasang Apps Script dan Google Sheets (wajib).
- Bagian 10: PWA di GitHub Pages. Isi variabel `DF_API_URL` dengan URL `/exec` Apps Script.
- Bagian 11: APK Android. Isi secret `DF_KEYSTORE_BASE64` dan `DF_KEYSTORE_PASSWORD`.

Perubahan file `.gs` atau `.html` di `src/` juga harus di-deploy di Apps Script: **Deploy → Manage deployments → pensil → New version**.

Riwayat perubahan: [CHANGELOG.md](CHANGELOG.md).

</details>
