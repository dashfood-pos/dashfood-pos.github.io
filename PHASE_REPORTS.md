# Laporan per Fase — Dash Food POS

Format mengikuti CLAUDE.md: ringkasan, file, test & hasil, gap/risiko, rollback, fase berikutnya.
Semua test dijalankan 13 Okt 2026 di Node 22 + Chromium 141 headless.

---

## Fase 0 — Audit

1. **Ringkasan:** Tidak ada source code, test, maupun prototype HTML v22. Pemilik mengonfirmasi bangun dari nol. Konflik prototype vs PRD dipetakan (12 butir) dan diputuskan. Detail: `AUDIT_REPORT.md`.
2. **File:** `AUDIT_REPORT.md`.
3. **Test:** tidak ada test yang bisa dijalankan (belum ada kode).
4. **Gap/risiko:** kontrak API & schema menjadi kontrak awal; tambahan schema terdokumentasi di AUDIT_REPORT §5.
5. **Rollback:** tidak relevan.
6. **Berikutnya:** fondasi backend + UI.

## Fase 1 — Fondasi (backend & UI)

1. **Ringkasan:** Schema 16 sheet, lapisan `Db` (baca batch, kolom berdasarkan nama header, kolom teks diformat `@`), setup idempotent, login (hash bersalt + iterasi, sesi bertoken, batas percobaan), router `api(action, payload, token)` yang tidak pernah melempar error ke client, role per aksi. UI: design tokens dari piksel prototype, shell lebar penuh, header coklat/putih, bottom nav 5 item, bottom sheet, toast, state loading/empty/error, ikon outline satu keluarga, brand mark, gambar dengan fallback, perbaikan viewport Apps Script (`addMetaTag`) dan mode Desktop Site.
2. **File:** `src/appsscript.json, Config.gs, Utils.gs, Db.gs, Setup.gs, Auth.gs, Settings.gs, Api.gs, Index.html, Styles.html, Icons.html`, `dev/gas-mock.js, dev/load-gas.js`.
3. **Test:** backend test #1–4, #31–34 (SHA-256 mock vs crypto Node, setup idempotent & nol di depan nomor telepon tetap, auth/lockout/role/logout, user nonaktif, router, lock selalu dilepas, sesi tidak membocorkan hash) — **lulus**.
4. **Gap/risiko:** SHA-256 iteratif bukan bcrypt (keterbatasan Apps Script). Sesi disimpan di Script Properties (kuota 500 KB; cukup untuk puluhan sesi).
5. **Rollback:** proyek baru — hapus deployment.
6. **Berikutnya:** kasir.

## Fase 2 — Kasir

1. **Ringkasan:** Katalog satu panggilan (produk + harga semua channel + topping per produk + stok), cari, filter kategori, channel per order, detail produk + topping multi-pilih (hanya topping yang ditautkan ke produk), keranjang (qty, hapus, catatan, diskon, no. order platform), kalkulasi preview di client, validasi stok gabungan lintas baris.
2. **File:** `src/Products.gs, src/App.html`.
3. **Test:** backend #5–8, #18–19, #27 (harga per channel, harga browser diabaikan, produk tanpa topping, topping duplikat, harga topping per channel, harga belum diatur, produk/topping nonaktif). UI #4 (12.C), #7 (ganti channel → hitung ulang + notifikasi) — **lulus**.
4. **Gap/risiko:** Prototype memilih channel di Detail Produk; diimplementasikan sebagai channel level order (K2).
5. **Rollback:** versi deployment sebelumnya.
6. **Berikutnya:** checkout.

## Fase 3 — Checkout & order

1. **Ringkasan:** `createOrder` (idempotent via `client_ref`, harga dihitung ulang server), `recordPayment` di bawah script lock (validasi status → metode → nominal → seluruh stok → tulis payment → movement → stok → status COMPLETED terakhir), proteksi bayar ganda, struk (cetak, PDF server-side, bagikan), riwayat dengan nama produk & pencarian, detail, lanjutkan draft, batal (draft: tanpa stok; selesai: Manager/Admin + alasan + `CANCEL_REVERSE` + payment `REFUNDED`).
2. **File:** `src/Orders.gs, src/Payments.gs, src/App.html`.
3. **Test:** backend #9–17, #20–21, #26, #30 dan UI #2 (12.A), #3 (12.B), #5 (12.D), #6 (ketuk ganda), #8 (12.E), #9 (batal) — **lulus**.
4. **Gap/risiko:** Apps Script tidak punya transaksi atomik lintas sheet; kegagalan infrastruktur di tengah penulisan bisa meninggalkan payment tanpa status COMPLETED (laporan tidak menghitungnya). Konkurensi dua perangkat hanya bisa diuji setelah deploy. Download PDF di iframe HtmlService perlu dicek di perangkat.
5. **Rollback:** versi deployment sebelumnya; data transaksi tidak pernah dihapus.
6. **Berikutnya:** operasional.

## Fase 4 — Operasional

1. **Ringkasan:** Kelola produk (tambah/edit/nonaktifkan, kategori, satuan, deskripsi, URL foto + pratinjau, topping yang diizinkan), topping (harga per channel, satuan), harga per channel (histori harga tersimpan; baris lama dinonaktifkan), stok produk/topping (status OK/Menipis/Habis, penyesuaian wajib alasan, stok minimum, riwayat mutasi), produksi (idempotent), pengeluaran (tambah/edit, kategori), kategori produk/pengeluaran.
2. **File:** `src/Products.gs, src/Inventory.gs, src/Expenses.gs, src/App.html`.
3. **Test:** backend #17, #22–25, #28–29 dan UI #10 (produk → harga → produksi → kasir), #11 (pengeluaran & penyesuaian stok), #12 (form dalam sheet) — **lulus**.
4. **Gap/risiko:** **Bug ditemukan & diperbaiki saat QA:** backdrop bottom sheet memanggil `preventDefault()` pada klik tombol submit di dalamnya, sehingga semua form di sheet (penyesuaian stok, kategori, akun) tidak tersubmit. Ditambahkan test regresi #12 dan crawler diperketat. Stok bahan baku (bukan produk jadi) di luar cakupan V1 sesuai PRD §5.13.
5. **Rollback:** versi deployment sebelumnya.
6. **Berikutnya:** laporan & pengaturan.

## Fase 5 — Dashboard, laporan, pengaturan

1. **Ringkasan:** Dashboard (Omzet, Transaksi, Laba Bersih sederhana, Pengeluaran, pembanding periode sebelumnya, per channel, terlaris, stok menipis), Laporan Penjualan (grafik harian interaktif, channel, metode bayar, diskon, transaksi batal), Laporan Produk (per kombinasi produk+topping), Laporan Keuangan (komposisi pengeluaran, HPP ditandai belum tersedia, definisi metrik). Pengaturan: info toko, channel & metode bayar (aktif/nonaktif + URL logo resmi), kategori, struk + cetak uji, akun pengguna, backup, ganti password.
2. **File:** `src/Reports.gs, src/Settings.gs, src/Auth.gs, src/App.html`.
3. **Test:** backend #24–25, #30, #31 dan UI #1 (seluruh 21 screen), #13 (role STAFF) — **lulus**.
4. **Gap/risiko:** Laba bersih sederhana belum memperhitungkan HPP, pajak, dan komisi platform (dijelaskan di UI).
5. **Rollback:** versi deployment sebelumnya.
6. **Berikutnya:** QA.

## Fase 6 — QA

1. **Ringkasan:** Dev harness menjalankan UI asli + backend `.gs` asli di browser. 19 test end-to-end di Chromium.
2. **File:** `dev/build-dev.js, dev/dev-bridge.js, tests/backend.test.js, tests/ui/ui.test.js, screenshots/`.
3. **Test & hasil aktual:**
   - `node --test tests/backend.test.js` → **34 pass, 0 fail**.
   - `node --test --test-concurrency=1 tests/ui/ui.test.js` → **19 pass, 0 fail**, termasuk:
     - 21 screen di 390×844: 0 error konsol (selain Google Fonts yang diblokir sandbox), 0 overflow horizontal, 0 teks < 11,5 px, 0 kontrol tanpa aksi, 0 target sentuh < 36 px.
     - Viewport 360×800, 390×844, 412×915: lebar penuh, KPI 2 kolom, katalog di atas keranjang, bottom nav tidak menutupi konten.
     - Desktop Site (viewport 980, layar 412, touch): class `zoom-fix` aktif, zoom > 2×, bottom nav tetap.
     - Tablet 820×1180 dan desktop 1440×900: dua panel + rail navigasi, latar bukan hitam.
     - Gambar rusak → placeholder; error server → state error + Coba lagi berhasil.
4. **Gap/risiko:**
   - Font di screenshot memakai Inter/Poppins lokal; di produksi dimuat dari Google Fonts.
   - Target sentuh minimum yang diuji 36 px; tombol utama ≥ 44 px, chip 40 px dengan area sentuh diperluas lewat pseudo-element (tidak terukur oleh test).
   - Belum diuji di perangkat Android fisik dan di Apps Script sungguhan → checklist di `DEPLOYMENT.md` §7.
   - Kemiripan visual dengan prototype dicek manual dari screenshot, bukan pixel-diff (gambar prototype terlalu kecil per screen untuk pixel-diff yang bermakna).
5. **Rollback:** `DEPLOYMENT.md` §8.
6. **Berikutnya (rekomendasi):** deploy ke akun Anda, jalankan checklist §7, isi logo resmi & foto produk; setelah itu baru pertimbangkan HPP (butuh data biaya per produk) atau stok bahan baku.
