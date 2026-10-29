# Dash Food v1.5: Tema Warna + APK Android

Tanggal: 28 Oktober 2026.

## 1. Tema warna (5 aksen)

- Lokasinya: **Lainnya → Tampilan → Warna aksen**. Pilihannya Oranye (default), Hijau, Biru, Marun, Cokelat. Semua bisa digabung dengan mode Otomatis, Terang, atau Gelap.
- Pilihan disimpan per perangkat dan dipasang sebelum CSS dibaca, jadi tidak ada kedipan warna saat aplikasi dibuka.
- Setiap aksen punya 5 nada: warna aksen, warna isi tombol, warna teks aksen (versi terang dan gelap), latar lembut, dan warna saat ditekan. Semua sudah diukur:
  - Aksen vs ikon putih ≥ 3:1: oranye 3.05, hijau 3.49, biru 4.55, marun 5.49, cokelat 4.92.
  - Tombol bertulisan putih ≥ 4.5:1: 4.70 / 5.38 / 5.73 / 7.24 / 7.09.
  - Teks aksen ≥ 4.5:1 di latar terang dan gelap.
- Di mode gelap, warna oranye tombol tengah kini sama dengan mode terang. Di v1.4 oranyenya lebih terang dan kontras ikon putihnya hanya 2.74:1; sekarang 3.05:1.

## 2. APK Android (Trusted Web Activity)

**Bisa dibuat langsung di sini?** Tidak. Workspace ini memblokir server Google untuk Android SDK (`dl.google.com`, `maven.google.com`: respons 403). Karena itu APK **dibuild di GitHub Actions**, yang server-nya sudah punya Android SDK.

**Kenapa TWA:** APK membuka PWA memakai mesin Chrome. Hasilnya:
- Cetak, PDF, dan share struk berjalan sama seperti di Chrome.
- Tampilan ikut ter-update otomatis setiap kali PWA di-push.
- Data tidak diduplikasi di HP: semua tetap di Google Sheets, jadi **otomatis sinkron** dengan PWA, link `/exec`, dan HP lain.

Yang dibuat:
- `android/`: proyek Gradle (AGP 8.7.3, compileSdk 35, minSdk 21, androidbrowserhelper 2.5.0). Ikon adaptif dan splash dibuat dari logo (`npm run icons -- logo.png` memperbarui ikon PWA **dan** APK).
- `.github/workflows/android.yml`: menentukan alamat dari nama repo, membuka kunci dari Secrets, build APK bertanda tangan, **memverifikasi sidik jari kunci = assetlinks**, lalu menerbitkan APK di halaman Releases.
- `tools/build-web.js` kini menghasilkan `/.well-known/assetlinks.json` dari `web/pwa.config.json → twa`.
- Kunci tanda tangan dibuat terpisah (RSA 2048, berlaku 30 tahun). Kunci **tidak** ikut di zip repo. Sidik jari SHA-256-nya (publik) ada di `web/pwa.config.json`.

Langkah lengkap: `DEPLOYMENT.md` bagian 11.

## 3. Test dan hasil aktual (28 Oktober 2026, sandbox)

| Pemeriksaan | Hasil |
|---|---|
| backend | 48/48 |
| ui / features / sprint2 | 19/19 · 10/10 · 9/9 |
| pwa (+ assetlinks.json berisi paket & sidik jari yang benar) | 6/6 |
| v14 (+ test tema warna: 5 aksen, tersimpan, gabung mode gelap) | 7/7 |
| Gate anti-slop: 22 layar × terang/gelap × (oranye 3 ukuran + 4 aksen) | 308 layar, 0 FAIL |
| Logika Gradle (alamat, paket, assetStatements ter-escape) | dijalankan offline: hasil sesuai format Bubblewrap |
| Konversi sidik jari `apksigner` → format assetlinks | diuji: cocok |
| XML Android (manifest, colors, filepaths, adaptive icon) dan YAML workflow | valid |

## 4. Yang BELUM terverifikasi (jujur)

- **Build APK-nya sendiri.** Android SDK tidak bisa diunduh di sini, jadi `assembleRelease` belum pernah dijalankan. Run pertama di GitHub Actions adalah uji build pertamanya. Kalau gagal, kirim log langkah yang merah.
- APK terbuka tanpa address bar. Ini bergantung pada repo `<username>.github.io` dan `assetlinks.json` yang sudah online.
- Instalasi dan perilaku di Samsung A12 (cetak, share, tombol kembali di dalam TWA).

## 5. File yang diubah

- `src/Styles.html`, `src/App.html`, `src/Index.html`: tema warna. Backend tidak berubah.
- `tools/make-icons.js`, `tools/build-web.js`, `web/pwa.config.json`, `.github/workflows/pages.yml`, `.gitignore`.
- **Baru:** `android/**`, `.github/workflows/android.yml`.
- Test: `tests/ui/v14.test.js` (+1), `tests/ui/pwa.test.js` (cek assetlinks), `dev/taste-check.js` (aksen).
