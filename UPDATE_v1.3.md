# Dash Food v1.3 — UI Oranye, Skeleton Loading, PWA GitHub Pages

Tanggal: 21 Oktober 2026.

## 1. Yang berubah

| Permintaan | Hasil |
|---|---|
| Ganti UI mengikuti referensi (oranye) | Latar abu hangat `#F6F5F3` dan kartu putih tanpa garis tegas dengan bayangan halus. Header terang dengan judul di tengah serta tombol kembali/aksi bulat. Kolom cari berbentuk pill. Chip kategori/channel berbentuk pill; yang aktif berwarna oranye. Bottom nav berisi 5 item dengan **Kasir sebagai tombol bulat oranye di tengah** (urutan: Beranda, Order, Kasir, Stok, Lainnya). Login gelap dengan cahaya oranye di belakang logo. Grafik laporan memakai garis oranye. Bar keranjang hitam dengan tombol oranye. |
| Loading pakai skeleton | Spinner konten diganti skeleton yang bentuknya mengikuti layar: Beranda (KPI, channel, daftar), Kasir (kolom cari, chip, grid kartu), Riwayat/Stok (daftar), Detail/Struk, Laporan (grafik), Form. Saat HTML pertama dibuka langsung tampil kerangka Beranda + nav, bukan layar kosong. Spinner hanya tersisa untuk **proses** (tombol "Memproses…", membuat gambar struk). |
| Tombol + di kanan bawah kartu produk | Tombol + 40×40 px oranye kini ada di pojok kanan bawah kartu, sejajar harga dan stok. Harga dibuat tebal; "Mulai" dipindah ke baris kecil di atas harga supaya tidak terpotong di layar 360 px. Tombol untuk produk yang habis atau belum ada harganya tampil abu-abu dan tidak aktif. |
| Push ke GitHub, install di HP, tampilan bersih | Versi **PWA** dibangun dari UI yang sama (`tools/build-web.js`), lalu di-deploy otomatis ke GitHub Pages lewat GitHub Actions. Apps Script mendapat `doPost` sebagai API JSON. Hasilnya bisa di-install ke layar utama dan tampil layar penuh tanpa bar/banner Google. |

## 2. Keputusan desain yang perlu Bro tahu

- **Ada dua oranye, demi keterbacaan.** Oranye terang `#F26B0F` (sama dengan referensi) dipakai untuk tombol Kasir di tengah, tombol +, titik nav aktif, dan grafik, yaitu elemen tanpa teks. Kontrasnya 3:1, cukup untuk ikon. Tombol dan chip yang bertulisan putih (Masuk, Bayar, chip aktif) memakai oranye tua `#C84B09` (kontras 4.7:1, lolos WCAG AA). Kalau teks putih ditaruh di oranye terang, kontrasnya cuma 3.05:1 dan susah dibaca di bawah sinar matahari.
- Ikon tombol Kasir di tengah sengaja **mesin kasir**, bukan troli. Troli tetap dipakai untuk tombol Keranjang di header Kasir, jadi tidak ada dua ikon troli dengan fungsi berbeda.
- Layout grid 2 kolom dipertahankan sesuai pilihan; kartu tidak diubah menjadi list.

## 3. Arsitektur PWA

```
GitHub Pages (index.html + config.js + manifest + sw.js + ikon)
   │  fetch POST, Content-Type text/plain  ← "simple request": tanpa preflight CORS
   ▼
Apps Script /exec → doPost(e) → api(action, payload, token) → Google Sheets
```

- `doPost` memakai **router dan kontrak yang sama** dengan `google.script.run.api`: role check, LockService, validasi stok, dan anti bayar ganda semuanya tetap di server.
- Token sesi dikirim di body, bukan cookie. Karena itu tidak ada kredensial bawaan browser yang bisa disalahgunakan lewat CSRF.
- Service worker **hanya menyimpan kerangka aplikasi**. Panggilan API (POST, domain lain) tidak pernah di-cache, sehingga harga, stok, dan transaksi selalu dari server.
- Tidak ada rahasia di frontend. `config.js` hanya berisi URL `/exec`, yang memang publik.
- Build gagal dengan pesan jelas bila URL bukan `https://script.google.com/.../exec` atau kosong di CI.

## 4. File yang diubah

- **Apps Script:**
  - `Api.gs`: tambah `doPost`; `checkInstall` mencakup fungsi baru.
  - `App.html`: transport fetch, skeleton, header, nav, kartu produk, warna grafik, cache info publik, theme-color.
  - `Styles.html`: tema oranye dan skeleton.
  - `Index.html`: skeleton awal.
- **Baru:**
  - `web/pwa.config.json`, `web/sw.js`, `web/icons/*`
  - `tools/build-web.js`, `tools/make-icons.js`
  - `.github/workflows/pages.yml`, `.gitignore`
  - `dev/serve-web.js`, `tests/ui/pwa.test.js`
- **Dev/test:**
  - `dev/gas-mock.js` (ContentService), `tests/backend.test.js` (+1 test doPost).
  - Penunggu loading di 3 file test UI kini ikut menunggu skeleton selesai.
  - Warna latar login di `sprint2.test.js` disesuaikan.
- **Schema:** tidak ada perubahan. Tidak perlu menjalankan `setupDashFood`.

## 5. Test dan hasil aktual (21 Oktober 2026, sandbox)

| Suite | Hasil |
|---|---|
| `tests/backend.test.js` (+ `doPost`: kontrak, token, input rusak, aksi tak dikenal) | 48/48 lulus |
| `tests/ui/ui.test.js` (21 screen, tombol mati, overflow, teks < 11.5 px, target sentuh) | 19/19 lulus |
| `tests/ui/features.test.js` | 10/10 lulus |
| `tests/ui/sprint2.test.js` (responsif 360×800/360×740/390×844, tombol kembali) | 9/9 lulus |
| `tests/ui/pwa.test.js` | 6/6 lulus |
| `checkInstall()` | "Semua file .gs lengkap." |

Isi `pwa.test.js`. Test ini memakai server lokal yang meniru Apps Script: API di origin lain, POST dijawab 302 lalu GET JSON, dan OPTIONS ditolak 405.
- Manifest valid, ikon 192/512/maskable berstatus 200 image/png, service worker aktif, dan meta theme-color ada.
- Login → dashboard → Kasir → 2× Sago → bayar cash → struk, semuanya lewat fetch. Hasilnya: **0 preflight**, stok Sago berkurang tepat 2, dan ada tepat 1 pembayaran PAID.
  - Sebagai kontrol: request dengan `application/json` memang memicu preflight dan diblokir, jadi pemeriksaan ini benar-benar mendeteksi masalahnya.
- Reload dengan sesi tersimpan hanya memanggil `bootstrap` sekali; info publik tersimpan untuk layar login berikutnya.
- Offline: kerangka app tetap terbuka dari cache dengan pesan "Gagal terhubung… offline". Setelah online lagi, "Coba lagi" berhasil.
- Simulasi deployment salah (respons HTML login Google) menampilkan pesan yang menyebut akses "Anyone".
- Di 360×800: tombol + ada di pojok kanan bawah kartu, nav menempel di bawah layar, tanpa scroll horizontal.

## 6. Yang BELUM terverifikasi (butuh akun Google & HP asli)

- **Panggilan fetch ke Apps Script asli.** Polanya (POST text/plain → 302 → googleusercontent dengan `Access-Control-Allow-Origin: *`) adalah pola yang umum dipakai, dan server tiruan meniru perilaku itu. Tetapi sandbox ini tidak bisa mengakses `script.google.com`, jadi belum dicoba ke server Google sungguhan.
- Proses install PWA di Chrome Android dan tampilan standalone di Samsung A12.
- Workflow GitHub Actions belum pernah dijalankan di GitHub. File dan build-nya sudah diuji lokal (`node tools/build-web.js`), tetapi belum di runner GitHub.
- Upload foto berukuran besar lewat doPost (batas body 15 MB di kode; batas Google sekitar 50 MB).
- Cetak, Download PDF, dan share gambar struk dari mode standalone.

## 7. Cara update

**Apps Script (wajib, juga untuk yang tidak memakai PWA):**
1. Tempel `Api.gs`, `App.html`, `Styles.html`, `Index.html`.
2. Jalankan `checkInstall()`.
3. Deploy → Manage deployments → Edit → **New version**.

**PWA:** ikuti `DEPLOYMENT.md` bagian 10 (repo, Pages Source = GitHub Actions, variabel `DF_API_URL`, install di HP).

**Rollback:** di Apps Script pilih versi deployment sebelumnya. Di GitHub, revert commit lalu workflow akan deploy ulang. Data tidak tersentuh karena tidak ada perubahan schema.
