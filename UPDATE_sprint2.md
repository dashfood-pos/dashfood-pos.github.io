# Dash Food v1.2: Bug Fix & UX Improvement Sprint

Tanggal: 13 Oktober 2026. Dokumen ini adalah laporan akhir sprint dan mengikuti format "7. Laporan Akhir" dari brief.

## 1. Akar masalah dan perbaikan

| # | Masalah | Akar masalah | Perbaikan |
|---|---|---|---|
| 1 | Logo struk tidak bisa diganti | Struk memakai `store_logo_url`, yaitu logo yang sama dengan halaman login. Tidak ada setting terpisah, dan struk lama selalu membaca setting terbaru. | Setting baru `receipt_logo_url` di **Pengaturan → Struk** dengan opsi Upload Logo/Ganti Logo, URL, pratinjau, dan Kembalikan ke default. Nilainya di-snapshot ke `ORDERS.receipt_logo_url` saat pembayaran selesai, sehingga struk lama tetap memakai logo lamanya. Urutan fallback: logo struk → logo toko → logo bawaan. Logo dipakai di struk HTML, cetak, PDF (server), dan gambar PNG struk. Untuk PNG, logo diambil sebagai data URL lewat `receiptLogo` agar canvas tidak "tainted" oleh CORS. |
| 2 | Login menampilkan logo + teks "Dash Food" + tagline | `renderLogin` merender teks nama dan tagline di bawah logo. | Hanya gambar logo yang tampil (`object-fit: contain`, lebar `min(64vw, 260px)`, tinggi maksimal 32vh). Nama toko tetap ada sebagai `h1.sr-only` untuk pembaca layar. |
| 3 | Order tidak bisa diedit atau dihapus | Belum ada API edit. `cancelOrder` tidak meminta konfirmasi dari server. | **Belum dibayar (DRAFT/CONFIRMED):** Edit Order (item, qty, catatan, channel). Harga dihitung ulang di server dan stok divalidasi. Item lama tidak dihapus; `order_id`-nya diberi akhiran `~R<n>` sebagai arsip revisi. **COMPLETED:** tidak bisa diedit atau dihapus. Koreksi dilakukan lewat Batalkan + Refund (khusus MANAGER), dengan reversal stok satu kali. Opsi "Koreksi" membatalkan order lalu menyalin itemnya ke keranjang baru. **CANCELLED:** tidak bisa dibayar, diedit, atau dibatalkan ulang. Dialog konfirmasi menampilkan nomor TRX, item, total, status, dan dampaknya. **Backend:** `cancelOrder` menolak permintaan dengan `CONFIRM_REQUIRED` bila `confirm_order_number` tidak sama dengan nomor order. Semua perubahan dicatat di sheet `ORDER_EVENTS` dan tampil di kartu "Riwayat Perubahan". |
| 4 | Reload lambat | Saat reload ada 4 round-trip berurutan (`publicInfo` → `session` → `dashboard` → `catalog`), font memblokir render, dan thumbnail Drive diminta di `sz=w2000`. | Endpoint `bootstrap` (1 round-trip berisi sesi + katalog + dashboard). Info publik disisipkan ke HTML, sehingga layar login muncul tanpa API. Katalog di-cache di CacheService selama 5 menit dan diinvalidasi otomatis setiap ada penulisan ke sheet katalog/stok/setting. `createOrder`/`recordPayment`/`updateOrder` tetap membaca sheet langsung. Font tidak lagi memblokir render. Ukuran gambar disesuaikan dengan tempat tampilnya (w160–w600), plus `loading=lazy` dan `decoding=async`. |
| 5 | Bidang putih di bawah nav (Samsung A12) | **Belum bisa dipastikan dari sandbox** karena app berjalan di dalam iframe Google. Dugaan terkuat: `100vh` di Chrome Android lebih tinggi daripada area yang terlihat, dan latar `html/body` berwarna putih sehingga celah di luar `.app` tampak putih. | Tinggi layout memakai `height: 100%` dan flex (bukan `vh`). Warna `html/body` disinkronkan dengan layar aktif. Viewport memakai `interactive-widget=resizes-content`. Input yang fokus di-scroll ke area terlihat saat keyboard muncul. Layar diagnostik **Pengaturan → Info Tampilan** menampilkan ukuran viewport, safe-area, dan zoom untuk dikirim bila masalah masih muncul. |

Bug tambahan yang ditemukan saat test: setelah dialog "Batal" ditutup, tombol kembali Android bisa mengeluarkan user dari aplikasi. Penyebabnya, `history.back()` berbalapan dengan `pushState`. Mekanismenya diganti dengan satu entri riwayat penjaga, dan sekarang tidak ada lagi panggilan `history.back()`.

## 2. File yang diubah

**Backend (.gs):**
- `Config.gs`: schema, enum, role aksi baru.
- `Db.gs`: invalidasi cache katalog.
- `Products.gs`: katalog memakai cache.
- `Orders.gs`: `updateOrder`, event, konfirmasi batal, logo di PDF.
- `Payments.gs`: snapshot logo + event PAID.
- `Media.gs`: `receiptLogo`, logo bawaan, data URL.
- `Settings.gs`: `receipt_logo_url`.
- `Api.gs`: `bootstrap`, `bootPublic`, viewport, `checkInstall`.

**Frontend (.html):** `Index.html`, `App.html`, `Styles.html`.

**Dev/test:** `dev/gas-mock.js`, `dev/dev-bridge.js`, `dev/build-dev.js`, `dev/measure.js` (baru), `tests/backend.test.js`, `tests/ui/features.test.js`, `tests/ui/sprint2.test.js` (baru), `package.json`.

## 3. API

| Aksi | Status | Role | Catatan |
|---|---|---|---|
| `bootstrap` | baru | PUBLIC | `{pub, session, catalog, dashboard}`. Setiap bagian punya error sendiri, jadi dashboard yang gagal tidak menggagalkan login. |
| `updateOrder` | baru | STAFF | Hanya untuk order belum dibayar. Selain itu ditolak dengan `NOT_EDITABLE`. |
| `receiptLogo` | baru | STAFF | Mengembalikan `{data_url, source}`. Hanya file yang terdaftar di sheet MEDIA yang dibaca dari Drive. |
| `cancelOrder` | **berubah** | sama | Wajib menyertakan `confirm_order_number`. Klien lama tanpa field ini akan ditolak dengan `CONFIRM_REQUIRED`. Ini disengaja karena brief meminta proteksi backend. |
| `orderDetail` | ditambah field | sama | Ada field baru `events` dan `editable`. Field lama tidak berubah. |
| `catalog` | ditambah field | sama | Ada field baru `cache: 'hit'/'miss'`. |

## 4. Perubahan schema, migrasi, dan rollback

- `ORDERS` mendapat kolom baru `receipt_logo_url` (teks) dan `revision` (angka). Kolom ditambahkan di akhir; kolom lama tidak diganti nama atau dipindah.
- Sheet baru `ORDER_EVENTS` dengan kolom: `event_id, order_id, event_type, detail, created_at, created_by`.
- `SETTINGS` mendapat key baru `receipt_logo_url` (default kosong, artinya memakai logo toko).
- Revisi item order disimpan di `ORDER_ITEMS`/`ORDER_ITEM_VARIANTS` dengan `order_id` berakhiran `~R<n>`. Tidak ada kolom baru di sana.

**Migrasi:** jalankan `setupDashFood()` sekali. Fungsi ini hanya menambah kolom atau sheet yang belum ada dan tidak menghapus data. Lalu jalankan `checkInstall()`.

**Rollback:** kembali ke versi deployment sebelumnya (Manage deployments → Edit → pilih versi lama). Kolom dan sheet tambahan aman dibiarkan karena kode lama membaca kolom berdasarkan nama. Data yang sempat tercatat di `ORDER_EVENTS` dan revisi `~R<n>` tetap ada, tetapi tidak tampil di versi lama.

## 5. Test dan hasil aktual

Semua test dijalankan di sandbox pada 13 Oktober 2026 di atas runtime Apps Script tiruan + Chromium.

| Suite | Hasil |
|---|---|
| `tests/backend.test.js` | 47/47 lulus |
| `tests/ui/ui.test.js` (regresi 21 screen, crawler tombol mati) | 19/19 lulus |
| `tests/ui/features.test.js` (fitur v1.1) | 10/10 lulus |
| `tests/ui/sprint2.test.js` (sprint ini) | 9/9 lulus |
| `checkInstall()` + 49 aksi punya handler | lulus |

Test sprint ini mencakup:
- Logo struk: upload, snapshot, `receiptLogo`, PDF; struk lama tetap memakai logo lama; logo login terpisah dari logo struk.
- Login hanya menampilkan logo.
- Edit order belum dibayar: total dihitung ulang dan event tercatat.
- Batal tanpa konfirmasi ditolak backend.
- Order COMPLETED: tombol Edit tidak ada; batal + refund mengembalikan stok **satu kali**; batal kedua ditolak.
- Order CANCELLED tidak bisa dibayar.
- Panggilan saat boot = `['bootstrap']`.
- Cache katalog: hit, lalu invalidasi setelah ada edit.
- Responsif 360×800, 360×740, 390×844: nav menempel di bawah, tidak ada celah latar, konten bisa di-scroll dan tidak tertutup nav, dan semua menu bisa diakses.
- Tombol kembali Android tidak keluar dari aplikasi.

## 6. Performa (diukur, bukan perkiraan)

Diukur dengan `node dev/measure.js 800`, yaitu latensi tiruan 800 ms per panggilan `google.script.run`, mendekati latensi Apps Script nyata di 4G.

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Reload → dashboard tampil | 2830 ms | 815 ms |
| Round-trip API saat reload | 4 (`publicInfo, session, dashboard, catalog`) | 1 (`bootstrap`) |
| Pembacaan sheet (`getValues`) per reload | 44 | 30 (cache katalog dingin) |
| Layar login tampil | 813 ms | 21 ms |
| Buka Kasir setelah boot | (perlu panggilan `catalog`) | 39 ms, tanpa panggilan tambahan |

**Catatan jujur:** di Apps Script asli, satu panggilan `bootstrap` tetap butuh sekitar 1–3 detik (cold start + Sheets). Yang hilang adalah 3 round-trip berurutan; latensi dasar Google tidak bisa dihilangkan.

## 7. Yang belum terverifikasi

- **Samsung A12 fisik dan frame iframe Apps Script.** Test responsif berjalan di Chromium dengan viewport emulasi, bukan di Chrome Android di dalam iframe Google. Bidang putih di screenshot belum terbukti hilang.
- `google.script.history` asli (tombol kembali). Yang dites adalah fallback `history.pushState`.
- Kecepatan nyata `bootstrap` dan CacheService di server Google.
- Logo struk dari URL eksternal (bukan Drive). Logo tampil di HTML/cetak, tetapi di gambar PNG/PDF bisa jatuh ke logo bawaan karena server hanya membaca file yang terdaftar di MEDIA. Ini disengaja untuk menghindari SSRF dan CORS.
- Perilaku keyboard Samsung Keyboard pada form di bottom sheet.

## 8. Cara menguji setelah deploy

1. Tempel file `.gs`/`.html` yang berubah (lihat bagian 2), jalankan `setupDashFood()`, lalu `checkInstall()`. Hasilnya harus "Semua file .gs lengkap."
2. **Deploy → Manage deployments → Edit → New version.** Tanpa langkah ini, URL `/exec` tetap menjalankan kode lama.
3. Login: hanya logo yang tampil, tanpa teks.
4. Buka Pengaturan → Struk, upload logo, lalu Simpan. Buat transaksi dan bayar; struk/gambar/PDF harus memakai logo baru. Setelah itu ganti logo lagi; struk transaksi tadi harus tetap memakai logo lama. Logo login tidak boleh berubah.
5. Buat order lalu "Simpan Draft". Di Riwayat, tekan ⋯ → Edit Order, ubah qty, lalu Simpan. Total dan Riwayat Perubahan harus ter-update.
6. Order lunas: tidak ada tombol Edit. Batalkan + Refund (login sebagai manager) → cek stok kembali satu kali dan status menjadi Dibatalkan.
7. Reload beberapa kali: dashboard harus muncul setelah satu kali loading.
8. Di A12, buka Produk dan Riwayat lalu scroll sampai bawah. Bila bidang putih masih muncul, buka **Pengaturan → Info Tampilan → Salin** dan kirim hasilnya bersama screenshot.
