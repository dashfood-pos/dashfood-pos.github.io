# AUDIT_REPORT — Dash Food POS

**Tanggal audit:** 13 Oktober 2026
**Auditor:** Claude (Phase 0)
**Sumber yang diperiksa:** `PRD_Dash_Food.md` (533 baris), `CLAUDE.md` (76 baris), prompt kerja (teks), gambar prototype 21 screen (`docs/prototype_21_screens.png`, 1536×1024 px).

---

## 1. Kondisi proyek

### 1.1 Inventaris file
| File yang diwajibkan CLAUDE.md | Status |
|---|---|
| `Config.gs`, `Api.gs`, `Setup.gs`, `Utils.gs` | **Tidak ada** |
| `Orders.gs`, `Payments.gs`, `Products.gs`, `Inventory.gs`, `Expenses.gs`, `Reports.gs` | **Tidak ada** |
| `Index.html` | **Tidak ada** |
| Test | **Tidak ada** |
| `Index_DashFood_Prototype_v22_CompleteChannelIcons.html` (sumber #3 di CLAUDE.md) | **Tidak ada** |

Tidak ada source code, test, atau prototype HTML yang bisa diaudit. Alur order → payment → stock deduction **tidak dapat ditelusuri** karena belum ada implementasinya. Tidak ada test untuk dijalankan.

### 1.2 Keputusan pemilik (13 Okt 2026)
Pemilik proyek mengonfirmasi: **backend belum ada, bangun dari nol.** Konsekuensinya:
- Sumber kebenaran #1 di CLAUDE.md ("existing source files and their actual contracts") belum ada; kontrak API dan schema yang dibangun di sini **menjadi kontrak awal**.
- Schema mengikuti PRD §6 persis untuk semua kolom yang disebut; kolom tambahan **ditambahkan di belakang** (tidak ada rename/penghapusan) agar kompatibel dengan PRD.
- Kontrak `api(action, payload)` dengan action `catalog`, `stock`, `dashboard`, `createOrder`, `recordPayment` dipertahankan namanya.

### 1.3 Batasan verifikasi
- Apps Script dan Google Sheets **tidak dapat dijalankan** di lingkungan ini. Logika backend diuji memakai runtime tiruan (`dev/gas-mock.js`) yang meniru `SpreadsheetApp`, `LockService`, `Utilities`, `PropertiesService`, `CacheService`, termasuk perilaku Sheets yang mengonversi string tanggal/angka otomatis.
- Konkurensi sungguhan (dua kasir menekan bayar pada detik yang sama) **tidak bisa diuji** di mock karena JavaScript lokal single-thread. Proteksi berbasis `LockService` + pemeriksaan status sudah diimplementasikan, tetapi harus diuji ulang setelah deploy.
- UI diuji di Chromium headless melalui dev harness yang memanggil kode backend asli di atas mock.

---

## 2. Analisis prototype (21 screen)

Palet diambil dari piksel gambar:

| Token | Nilai | Sumber |
|---|---|---|
| Header coklat | `#624737` | Header Kasir/Keranjang/Pembayaran |
| Tombol primer | `#5E4130` | Tombol Masuk, Tambah ke Keranjang |
| Background halaman | `#F9F9F9` | Dashboard, Pengeluaran |
| Kartu | `#FFFFFF` | Semua kartu |
| Sukses | `#19B974` (teks), `#EDF9F4` (bg) | "+12% dari kemarin", box Kembalian |
| Info | `#1661ED` / `#E7EEFC` | Info box Harga per Channel |
| Error/notifikasi | `#FC3731` | Badge cart |

Pola struktural:
- Dua gaya header: **coklat penuh** (Kasir, Keranjang, Pembayaran) dan **putih + tombol kembali** (Riwayat, Detail, Produk, Stok, dll.).
- Dashboard: sapaan, filter periode, KPI 2×2, ikon channel 5 kolom, Produk Terlaris.
- Bottom nav 5 item: Beranda, Kasir, Order, Stok, Lainnya.
- Daftar admin: kartu baris dengan thumbnail 1:1, nama, sub-info, badge status, menu ⋮.

### 2.1 Batasan fidelitas visual
Gambar 1536×1024 berisi 21 screen, jadi tiap screen hanya ±200 px lebar. **Struktur, urutan komponen, warna, dan hierarki dapat diikuti; ukuran font/spacing persis tidak dapat dibaca.** Ukuran mengikuti aturan PRD (teks isi 15 px, touch target ≥ 44 px), yang memang lebih besar dari skala prototype. Klaim pixel-perfect tidak dibuat.

---

## 3. Konflik antar sumber dan resolusinya

Semua resolusi di bawah disetujui pemilik ("pakai rekomendasi") kecuali ditandai lain.

| # | Konflik | Prototype | PRD / CLAUDE.md | Resolusi |
|---|---|---|---|---|
| K1 | Layout kasir | Kasir dan Keranjang terpisah (ikon cart) | Katalog di atas, keranjang di bawah | Katalog + **ringkasan keranjang sticky** di bawah layar kasir (ponsel); tap membuka layar Keranjang penuh seperti prototype. Tablet/desktop: dua panel. |
| K2 | Pemilihan channel | Dipilih di Detail Produk (terkesan per item) | Channel atribut order | Channel **satu per order**, dipilih di Kasir. Chip channel di Detail Produk tetap tampil dan mengubah channel order yang sama, disertai notifikasi bila total keranjang berubah. |
| K3 | "Original +Rp 0" | Baris topping | "Original" bukan topping berbayar kecuali dikonfigurasi | Original **= tidak memilih topping**. Tidak dibuat sebagai varian. Teks "Original" muncul di keranjang/struk bila produk bertopping tanpa topping dipilih. |
| K4 | Strawberry, Matcha | Muncul di Kelola Topping | Setup awal hanya Oreo/Cokelat/Keju | Tidak di-seed. Bisa ditambah lewat Kelola Topping. |
| K5 | Harga Sago/Es Teler | Mulai Rp 10.000 / Rp 12.000 | Demo Rp 15.000 | Harga selalu dari Sheets. Seed demo mengikuti PRD §7. |
| K6 | HPP & Laba Kotor | Tampil di Laporan Keuangan | Schema tidak punya biaya per produk | HPP ditampilkan sebagai **"Belum tersedia"** dengan alasan. Tidak ada angka karangan. |
| K7 | Total di struk | "Total Rp 1.500" | Total = subtotal − diskon | Typo prototype; struk menampilkan total yang benar. |
| K8 | Nama toko | "Banana Bites" di login/struk | Produk bernama Dash Food | Nama toko dari `SETTINGS.store_name`; default setup "Dash Food". Bisa diubah di Pengaturan → Informasi Toko. |
| K9 | Tombol "+ Tambah" di screen Produksi | Ada di header form | Tidak boleh tombol mati | Dihilangkan; screen sudah berupa form + riwayat produksi. |
| K10 | Ikon lonceng di Laporan Keuangan | Ada | Tidak boleh tombol mati | Dihilangkan. Lonceng di Dashboard dipertahankan → daftar stok rendah. |
| K11 | Riwayat Transaksi tidak menampilkan nama produk | Hanya nomor + channel | PRD §5.8 wajib nama produk | Ringkasan produk ditambahkan pada tiap baris. |
| K12 | Foto makanan & logo brand | Foto studio + logo resmi | Wajib brand mark, foto berizin | Aset tidak tersedia sebagai file. Disediakan **slot URL** (`image_url` produk/varian, `brand_logo_<KODE>` di Settings). Fallback: tile warna brand + nama tertulis untuk channel/payment; placeholder netral untuk foto. Logo resmi harus diambil pemilik dari brand kit masing-masing. |

---

## 4. Masalah desain yang diantisipasi (dari keluhan di CLAUDE.md/PRD)

1. **Shell sempit / sidebar hitam:** penyebab umum di Apps Script adalah `<meta viewport>` di HTML **diabaikan** di dalam iframe HtmlService. Wajib memakai `HtmlOutput.addMetaTag('viewport', ...)` di `doGet`. Diimplementasikan.
2. **Chrome Android mode Desktop Site:** viewport dipaksa ±980 px sehingga semua terlihat kecil. Ditangani berbasis kemampuan, bukan UA: bila `pointer: coarse` dan `innerWidth` jauh lebih besar dari `screen.width`, root di-`zoom` agar skala kembali normal.
3. **Selector bertabrakan:** CSS disusun dengan token + komponen ber-prefix, tanpa `!important` tambal-sulam.

---

## 5. Tambahan schema (dibanding PRD §6)

Tidak ada kolom PRD yang di-rename atau dihapus. Tambahan diletakkan di akhir.

| Sheet | Tambahan | Alasan |
|---|---|---|
| `PRODUCTS` | `description`, `image_url` | PRD §5.4/§5.9 menyebut deskripsi & foto, schema belum punya kolomnya |
| `VARIANTS` | `image_url` | Thumbnail di Kelola Topping/Stok |
| `ORDERS` | `client_ref`, `cashier_id`, `cashier_name`, `completed_at`, `cancelled_at`, `cancel_reason` | Idempotency createOrder, kolom "Kasir" di Detail Transaksi, audit trail pembatalan |
| `ORDER_ITEMS` | `product_name` | Snapshot nama agar histori tidak berubah saat produk diganti nama |
| `ORDER_ITEM_VARIANTS` | `variant_name` | Snapshot nama topping |
| `STOCK_MOVEMENTS` | `balance_after`, `created_by` | Audit trail mutasi |
| `PRODUCTION` | `client_ref`, `created_by` | Proteksi submit ganda |
| `EXPENSES` | `updated_at`, `created_by` | Audit edit |
| **Baru** `PRODUCT_VARIANTS` | `id, product_id, variant_id, is_active, created_at` | PRD §5.11 "hanya tampil pada produk yang mengizinkannya" butuh relasi produk↔topping |
| **Baru** `USERS` | `user_id, username, display_name, role, password_hash, password_salt, is_active, last_login_at, created_at, updated_at` | Login nyata (PRD §5.1) |

Enum tambahan: `PAYMENTS.status` = `PAID` / `REFUNDED`.

**Rollback schema:** karena proyek baru, rollback = hapus spreadsheet/deployment. Untuk versi berikutnya, kolom tambahan dibaca berdasarkan nama header (bukan posisi), sehingga kolom bisa ditambah tanpa memecah kode lama.

---

## 6. Keputusan teknis kunci

| Topik | Keputusan |
|---|---|
| Harga final | Dihitung ulang di backend saat `createOrder`; total dari browser diabaikan. |
| Rumus item | `line_total = (unit_price + Σ additional_price topping) × quantity`. `topping_total` = Σ tambahan **per unit**. `ORDER_ITEM_VARIANTS.quantity` = jumlah porsi topping (= quantity item), `subtotal = additional_price × quantity`. Tidak ada penggandaan. |
| Konsumsi stok | Produk: `quantity`. Tiap topping: 1 porsi per unit item. Kebutuhan dijumlah lintas baris keranjang sebelum dicek. |
| Pembayaran | Di dalam `LockService` script lock: cek status order (harus `DRAFT`/`CONFIRMED`), cek belum ada payment `PAID`, cek seluruh stok cukup → baru tulis payment, movement `SALE_OUT`, update stok, status `COMPLETED`. Jika satu stok kurang, **tidak ada tulisan apa pun**. |
| Idempotency | `createOrder` menerima `client_ref`; submit ulang dengan ref sama mengembalikan order yang sama. `recordPayment` kedua untuk order yang sama ditolak. |
| Pembatalan | Draft: status `CANCELLED`, stok tidak disentuh. Completed: wajib alasan, role ADMIN/MANAGER, movement `CANCEL_REVERSE`, payment `REFUNDED`. Tidak ada hapus permanen. |
| Auth | Tabel `USERS`, password SHA-256 bersalt dengan iterasi, token sesi di `PropertiesService` dengan kedaluwarsa, pembatasan percobaan login. Admin pertama dibuat dari Script Properties (bukan di kode). |
| Data demo | Hanya lewat fungsi eksplisit `seedDemoData()`; men-set `SETTINGS.data_mode = DEMO` dan UI menampilkan badge "Mode Demo". |
| Tanggal | Disimpan sebagai teks `yyyy-MM-dd` / `HH:mm` / ISO; kolom tanggal diformat `@` agar Sheets tidak mengonversi. Pembacaan menormalkan `Date` bila tetap terkonversi. |

---

## 7. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Apps Script tidak punya transaksi atomik antar-sheet | Kegagalan di tengah penulisan payment bisa meninggalkan data setengah jadi | Semua validasi selesai sebelum penulisan pertama; urutan tulis: payment → movements → stok → status order; status `COMPLETED` ditulis terakhir sehingga order setengah jadi tidak terhitung di laporan |
| Kuota/latensi Apps Script (±1–3 detik per panggilan) | Kasir terasa lambat | Satu panggilan `catalog` memuat produk+harga+stok semua channel; kalkulasi preview di client |
| Download PDF di iframe HtmlService | Atribut sandbox bisa memblokir unduhan | Perlu diuji setelah deploy; fallback: Cetak → "Simpan sebagai PDF" |
| Foto/logo belum ada | UI berbeda dari prototype secara visual | Slot URL + fallback sudah siap |
| SHA-256 bukan bcrypt | Lebih lemah terhadap brute force offline jika sheet bocor | Salt + iterasi + sheet USERS tidak dibagikan; pertimbangkan Google Sign-In untuk produksi |
| Laba bersih sederhana ≠ laba akuntansi | Salah tafsir | Definisi ditampilkan di layar laporan |

---

## 8. Rencana implementasi

| Fase | Isi | Bukti selesai |
|---|---|---|
| 1 Fondasi | Schema, Db layer, setup, auth, router API, design tokens, shell responsif, bottom nav, ikon, komponen | Test unit Db/auth lulus; screenshot shell di 360/390/412 |
| 2 Kasir | Katalog, cari, filter kategori, channel, detail produk, topping, keranjang, validasi stok | Test harga per channel, produk tanpa topping |
| 3 Checkout | createOrder, recordPayment, proteksi ganda, potong stok, struk, riwayat, detail, batal | Test integrasi order→payment→movement, duplikasi, stok kurang |
| 4 Operasional | Produk, topping, harga, stok, penyesuaian, produksi, pengeluaran | Test produksi, penyesuaian, histori harga tidak berubah |
| 5 Laporan & pengaturan | Dashboard, 3 laporan, pengaturan + user + backup | Test agregasi laporan |
| 6 QA | E2E Playwright, dead-button crawler, viewport matrix, desktop-site, gambar gagal | Laporan test + screenshot |

Laporan per fase: `PHASE_REPORTS.md`.
