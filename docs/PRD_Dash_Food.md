# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Dash Food — Mobile-First POS & Business Operations
**Versi:** 1.0  
**Tanggal:** 13 Oktober 2026  
**Status:** Draft implementasi untuk Claude Code  
**Pemilik produk:** Dash Food  
**Bahasa UI:** Bahasa Indonesia  
**Zona waktu:** Asia/Makassar  
**Mata uang:** Rupiah (IDR)

---

## 1. Ringkasan Produk

Dash Food adalah aplikasi kasir dan operasional untuk usaha makanan rumahan. Aplikasi membantu pemilik/operator menerima pesanan dari berbagai channel, menghitung harga dan topping, memproses pembayaran, mengelola stok produk siap jual, mencatat produksi dan pengeluaran, serta membaca laporan usaha.

Aplikasi harus terasa seperti aplikasi kasir mobile, bukan dashboard desktop yang diperkecil. Target utama adalah ponsel Android, dengan dukungan tablet dan desktop. Penggunaan utama berlangsung melalui layar sentuh.

### Prinsip utama
1. **Mobile-first sungguhan:** layout, ukuran teks, touch target, navigasi, dan alur kerja dirancang untuk ponsel.
2. **Operasional dahulu:** transaksi kasir harus cepat, jelas, dan aman dari duplikasi.
3. **Satu sumber data:** Google Sheets adalah penyimpanan data V1; Google Apps Script menjadi API/backend.
4. **Harga berbasis channel:** harga produk dan tambahan topping dapat berbeda menurut channel.
5. **Stok konsisten:** stok baru dikurangi saat pembayaran sukses, bukan saat item baru dimasukkan ke keranjang.
6. **Jangan mengarang data:** semua angka laporan dihitung dari transaksi/data backend; data dummy hanya untuk mode prototype/demo.
7. **Jangan merusak backend yang sudah ada:** audit kode yang ada sebelum mengubah struktur atau mengganti implementasi.

---

## 2. Tujuan dan Indikator Keberhasilan

### Tujuan
- Mempercepat pencatatan transaksi harian.
- Mengurangi salah hitung harga, topping, uang diterima, dan kembalian.
- Mengetahui stok siap jual serta kebutuhan produksi.
- Menyatukan penjualan dari Offline, WhatsApp/PO, GoFood, GrabFood, dan ShopeeFood.
- Memantau penjualan, produk terlaris, pengeluaran, dan laba bersih sederhana.

### Kriteria keberhasilan V1
- Kasir dapat membuat order, memilih channel, menambah produk/varian, memilih pembayaran, menyelesaikan transaksi, dan melihat struk.
- Transaksi yang sama tidak dapat dibayar dua kali.
- Stok berkurang tepat satu kali setelah pembayaran sukses.
- Harga di UI berasal dari API, bukan angka yang di-hardcode di komponen.
- Semua tombol yang terlihat memiliki aksi nyata atau secara eksplisit dinonaktifkan dengan alasan.
- Tampilan ponsel menggunakan lebar layar secara penuh, tidak menyusut menjadi kolom sempit di tengah.
- Teks isi utama minimal sekitar 14–16 px pada ponsel; label sekunder tetap terbaca.
- Touch target penting minimal sekitar 44×44 CSS px.
- Tidak ada ikon brand yang diganti ikon generik jika logo resmi/representasi brand tersedia dan diperlukan.

---

## 3. Pengguna dan Hak Akses

### Peran V1
- **ADMIN:** akses seluruh modul, pengaturan, data master, laporan, dan koreksi operasional.
- **MANAGER:** operasional, produk, stok, produksi, pengeluaran, dan laporan; akses pengaturan dibatasi sesuai implementasi.
- **STAFF:** kasir, membuat order, menerima pembayaran, melihat order sesuai kebutuhan operasional.

Skema role yang sudah ada di Better Auth pada proyek lain tidak otomatis menjadi bagian dari backend Apps Script ini. Untuk V1 Apps Script, audit autentikasi yang benar-benar tersedia terlebih dahulu. Jangan mengklaim login aman jika hanya berupa UI mockup. Jika autentikasi belum tersedia, tulis sebagai gap yang harus diputuskan sebelum produksi.

---

## 4. Platform dan Arsitektur

### Stack V1 yang telah disepakati
- Frontend: HTML, CSS, JavaScript yang disajikan melalui Google Apps Script.
- Backend/API: Google Apps Script.
- Database: Google Sheets.
- Runtime/deployment: Apps Script Web App.
- Zona waktu: `Asia/Makassar`.
- Mata uang: `IDR`.

### Arsitektur
`Mobile Browser → Index.html (UI) → google.script.run / API wrapper → Apps Script service functions → Google Sheets`

Jangan mengganti stack atau memigrasikan database tanpa persetujuan eksplisit. Claude harus memeriksa struktur repo/file Apps Script yang aktual sebelum implementasi.

### Kontrak API yang diketahui
API wrapper `api(action, payload)` sudah memiliki/direncanakan action:
- `catalog`
- `stock`
- `dashboard`
- `createOrder`
- `recordPayment`

Implementasi wajib memeriksa file backend aktual untuk signature dan bentuk data. Jangan menebak respons API. Tambahkan action baru hanya setelah memeriksa fungsi yang tersedia dan menjaga kompatibilitas.

---

## 5. Modul dan Ruang Lingkup

### 5.1 Login
- Form email/username dan password jika autentikasi backend tersedia.
- Validasi field, loading state, pesan error, dan status sesi.
- Tidak boleh berpura-pura login sukses jika backend belum mengautentikasi.
- Jika login belum diimplementasikan, tandai sebagai placeholder dan jangan jadikan penghalang mode demo.

### 5.2 Dashboard
- Ringkasan omzet, jumlah transaksi, laba bersih, dan pengeluaran.
- Filter periode: hari ini, 7 hari, bulan ini, rentang tanggal jika didukung.
- Penjualan per channel.
- Produk terlaris.
- Indikator stok rendah.
- Semua KPI dihitung dari data backend dan menampilkan loading/empty/error state.

### 5.3 Kasir / Penjualan
- Pencarian produk.
- Filter kategori.
- Kartu produk dengan foto, nama, harga sesuai channel, satuan, stok, dan tombol tambah.
- Pemilihan channel: Offline, WhatsApp, GoFood, GrabFood, ShopeeFood.
- Keranjang dengan quantity +/-; hapus item; catatan order; diskon bila diizinkan.
- Subtotal, diskon, total yang selalu dihitung ulang.
- Produk tanpa topping tidak boleh menampilkan pilihan topping.
- Pada ponsel, katalog di atas dan keranjang di bawah; hindari layout dua panel berdampingan.
- Produk yang stoknya tidak cukup harus diberi status jelas dan tidak boleh dibayar.

### 5.4 Detail Produk & Topping
- Menampilkan nama, foto, deskripsi opsional, harga dasar untuk channel terpilih.
- Quantity.
- Varian/topping dapat dipilih lebih dari satu jika aturan produk mengizinkan.
- Harga topping berasal dari `VARIANT_PRICES` sesuai channel.
- V1: Banana Bites memiliki topping Oreo, Cokelat, dan Keju. Sago dan Es Teler tidak memiliki topping pada setup awal.
- “Original” jangan dianggap topping berbayar jika belum dikonfigurasi sebagai varian resmi; aturan harus mengikuti data master.

### 5.5 Keranjang
- Nama produk dan nama topping/varian terlihat jelas.
- Quantity, harga satuan, tambahan topping, subtotal per item, subtotal order, diskon, dan total.
- Perubahan channel harus memicu perhitungan harga ulang dan memberi tahu pengguna bila total berubah.
- Tombol lanjut pembayaran nonaktif jika keranjang kosong.

### 5.6 Pembayaran
Metode:
- Cash
- DANA
- ShopeePay
- QRIS
- Bank Transfer

Aturan:
- Cash: pengguna memasukkan uang diterima; validasi uang diterima ≥ total; kembalian = diterima − total.
- Non-cash: jumlah dibayar default sebesar total, tanpa kembalian.
- Validasi order dan stok sebelum pembayaran disimpan.
- Proteksi duplikasi dengan lock/idempotency atau pemeriksaan status order di backend.
- Stok hanya dipotong satu kali setelah pembayaran berhasil.
- Status order/payment diperbarui secara atomik sejauh kemampuan Apps Script memungkinkan.
- Error backend harus ditampilkan dalam bahasa yang dapat dipahami, tanpa menyembunyikan penyebabnya.

### 5.7 Struk Transaksi
- Nomor transaksi/order.
- Tanggal dan waktu.
- Channel.
- Item, varian/topping, kuantitas, harga, subtotal.
- Diskon, total, metode pembayaran, uang diterima, kembalian.
- Aksi cetak, unduh PDF, dan bagikan.
- Jangan tampilkan aksi yang belum benar-benar berfungsi; jika print/PDF masih tahap berikutnya, tandai sebagai belum aktif.

### 5.8 Order / Riwayat Transaksi
- Daftar order dengan nomor transaksi, tanggal/jam, channel, status, total.
- **Nama produk wajib ditampilkan pada ringkasan order**, tidak hanya nomor transaksi.
- Filter periode, channel, status, pencarian nomor transaksi/nama produk.
- Detail transaksi menampilkan item, pembayaran, catatan, dan riwayat status jika tersedia.
- Pembatalan setelah pembayaran harus mengikuti aturan reversal stok dan audit trail; jangan hapus transaksi secara permanen.

### 5.9 Manajemen Produk
- Tambah/edit/nonaktifkan produk.
- Nama, kategori, satuan, foto, status aktif.
- Hindari penghapusan permanen jika produk sudah pernah dipakai pada transaksi.
- Validasi nama wajib dan kategori yang valid.

### 5.10 Kategori
- Kategori awal dapat mencakup Dessert, Minuman, Bahan, Topping, Packaging, Operasional, dan Lainnya.
- Kategori harus bisa dikelola jika modul kategori memang tersedia di backend.
- Kategori operasional tidak otomatis menjadi produk yang dijual.

### 5.11 Varian / Topping
- Tambah/edit/nonaktifkan varian.
- Tipe, satuan, status aktif.
- Harga tambahan per channel.
- Hanya tampil pada produk yang mengizinkannya.
- Jangan tampilkan seluruh varian untuk semua produk.

### 5.12 Harga per Channel
- Harga dasar produk per channel.
- Harga tambahan varian per channel.
- Validasi nilai numerik ≥ 0.
- Perubahan harga harus jelas apakah langsung berlaku atau punya effective date.
- Gunakan `PRICES` dan `VARIANT_PRICES` sesuai schema yang ada.

### 5.13 Stok
- Stok produk dan varian dikelola terpisah dengan `item_type` + `item_id`.
- Quantity, unit, minimum stock, last updated.
- Riwayat mutasi stok.
- Penyesuaian manual memerlukan alasan/catatan.
- Jangan mengizinkan stok negatif kecuali ada keputusan bisnis eksplisit.
- Stok produk siap jual tidak sama dengan stok bahan baku; V1 berfokus pada stok siap jual/varian yang telah dipersiapkan.

### 5.14 Produksi
- Catat produk, kuantitas hasil produksi, tanggal, catatan.
- Produksi menambah stok produk siap jual.
- Catat `PRODUCTION_IN` di `STOCK_MOVEMENTS` dan data produksi di `PRODUCTION`.
- Gunakan lock/validasi agar satu submit tidak mencatat produksi dua kali.

### 5.15 Pengeluaran
- Tanggal, kategori, deskripsi, nominal, metode pembayaran, catatan.
- Kategori pengeluaran dapat mencakup Bahan, Topping, Packaging, Operasional, Gas, dan kategori lain yang dikelola.
- Pengeluaran tidak boleh dihitung sebagai order/penjualan.
- Validasi nominal positif dan tanggal valid.

### 5.16 Laporan
- Laporan penjualan per periode dan channel.
- Laporan produk/produk terlaris.
- Laporan keuangan sederhana: omzet, pengeluaran, laba bersih sederhana.
- Definisi awal: `laba bersih sederhana = total penjualan yang diakui − pengeluaran tercatat`. Jangan menyebutnya laba akuntansi penuh karena belum tentu mencakup HPP, pajak, biaya platform, dan kewajiban lain.
- Tampilkan definisi metrik dan sumber datanya.

### 5.17 Pengaturan
- Informasi toko.
- Channel.
- Metode pembayaran.
- Kategori produk/pengeluaran.
- Printer/struk.
- Akun pengguna.
- Backup data.
- Menu yang belum terhubung ke backend harus ditandai sebagai belum tersedia, bukan tombol palsu.

### 5.18 Menu Lainnya
Akses cepat ke Produk, Topping/Varian, Harga, Stok, Produksi, Pengeluaran, Laporan, Pengaturan.

---

## 6. Data Model Google Sheets

Schema dasar yang diketahui dari proyek:

- `SETTINGS`: `setting_key, setting_value, updated_at`
- `CATEGORIES`: `category_id, category_name, category_type, is_active, created_at, updated_at`
- `PRODUCTS`: `product_id, product_name, category_id, base_unit, is_active, created_at, updated_at`
- `VARIANTS`: `variant_id, variant_name, variant_type, unit, is_active, created_at, updated_at`
- `PRICES`: `price_id, product_id, channel, base_price, effective_from, is_active, created_at, updated_at`
- `VARIANT_PRICES`: `variant_price_id, variant_id, channel, additional_price, is_active, created_at, updated_at`
- `ORDERS`: `order_id, order_number, external_order_id, order_date, order_time, channel, status, subtotal, discount, total, notes, created_at, updated_at`
- `ORDER_ITEMS`: `order_item_id, order_id, product_id, quantity, unit_price, topping_total, line_total, notes, created_at`
- `ORDER_ITEM_VARIANTS`: `id, order_item_id, variant_id, quantity, additional_price, subtotal, created_at`
- `PAYMENTS`: `payment_id, order_id, payment_method, amount, received_amount, change_amount, paid_at, status, created_at`
- `STOCKS`: `stock_id, item_type, item_id, quantity, unit, minimum_stock, updated_at`
- `STOCK_MOVEMENTS`: `movement_id, item_type, item_id, movement_type, quantity, reference_type, reference_id, notes, created_at`
- `PRODUCTION`: `production_id, product_id, quantity, production_date, notes, created_at`
- `EXPENSES`: `expense_id, expense_date, category, description, amount, payment_method, notes, created_at`

Enum awal:
- Channels: `OFFLINE`, `WHATSAPP`, `GOFOOD`, `GRABFOOD`, `SHOPEEFOOD`
- Payment methods: `CASH`, `DANA`, `SHOPEEPAY`, `QRIS`, `BANK_TRANSFER`
- Order statuses: `DRAFT`, `CONFIRMED`, `COMPLETED`, `CANCELLED`
- Item types: `PRODUCT`, `VARIANT`
- Stock movements: `PRODUCTION_IN`, `SALE_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `RETURN_IN`, `CANCEL_REVERSE`

**Penting:** schema di atas berasal dari konteks proyek yang tersedia. Claude harus membandingkannya dengan file aktual sebelum membuat perubahan, dan tidak melakukan rename kolom tanpa migrasi yang eksplisit.

---

## 7. Data Demo Awal

Data berikut adalah data dummy/test, bukan harga final bisnis:

### Produk
- Banana Bites
- Sago
- Es Teler

### Harga contoh per channel
| Produk | Offline | WhatsApp | GoFood | GrabFood | ShopeeFood |
|---|---:|---:|---:|---:|---:|
| Banana Bites | Rp10.000 | Rp11.000 | Rp13.000 | Rp13.000 | Rp13.000 |
| Sago | Rp15.000 | Rp16.000 | Rp18.000 | Rp18.000 | Rp18.000 |
| Es Teler | Rp15.000 | Rp16.000 | Rp18.000 | Rp18.000 | Rp18.000 |

### Contoh harga topping
| Topping | Offline/WhatsApp | GoFood/GrabFood/ShopeeFood |
|---|---:|---:|
| Oreo | Rp2.000 | Rp2.500 |
| Cokelat | Rp2.000 | Rp2.500 |
| Keju | Rp2.500 | Rp3.000 |

### Contoh stok awal test
- Banana Bites: 50 pcs (minimum 5)
- Sago: 20 cup (minimum 5)
- Es Teler: 15 cup (minimum 5)
- Topping Oreo/Cokelat/Keju: masing-masing 20 porsi (minimum 5)

Jangan mempromosikan data di atas sebagai harga/stock produksi aktif tanpa konfirmasi dari data Sheets.

---

## 8. Design System & UX Requirements

### Arah visual
- Warm food-business aesthetic.
- Cream/off-white background, white cards, brown primary actions.
- Text utama charcoal/near-black.
- Status colors: green untuk sukses, red untuk error/batal, blue/purple/orange hanya untuk kategori yang relevan.
- Ikon outline konsisten; logo brand digunakan untuk channel/payment yang memang memiliki identitas brand.
- Foto makanan bergaya studio, crop rapi, pencahayaan konsisten, tanpa emoji sebagai pengganti foto.

### Mobile-first wajib
- `meta viewport` yang benar.
- Gunakan full viewport width; jangan membatasi shell mobile menjadi 430px jika itu membuat area hitam kiri/kanan atau kolom sempit.
- CSS breakpoints tidak boleh menjadi satu-satunya deteksi perangkat jika masalah desktop-site Android perlu ditangani. Utamakan viewport responsive yang benar; jangan mengandalkan UA detection untuk layout utama.
- Pada ponsel, kasir adalah satu kolom vertikal: katalog dahulu, keranjang setelahnya.
- Dashboard KPI 2 kolom di ponsel.
- Jangan membuat empat KPI kecil berjajar di ponsel.
- Teks isi penting 14–16 px minimum sebagai target awal; label sekunder jangan sampai sulit dibaca.
- Touch target tombol/icon penting minimal 44×44 CSS px.
- Bottom navigation 5 item: Beranda, Kasir, Order, Stok, Lainnya.
- Pastikan safe-area bawah tidak menimpa konten.
- Modal di ponsel menggunakan bottom sheet atau dialog hampir full-width; konten modal harus dapat discroll.
- Foto produk konsisten dalam rasio yang ditentukan dan menggunakan `object-fit: cover`/`contain` sesuai konteks; tidak meregang.
- Hindari horizontal scrolling kecuali untuk chip kategori/channel yang memang disengaja.

### States wajib per screen
- Loading.
- Empty state.
- Error state dengan retry jika sesuai.
- Success feedback.
- Disabled state dengan alasan.
- Form validation.
- Confirm dialog untuk aksi destruktif.
- Offline/permission error jika relevan.

### Aksesibilitas
- Label kontrol eksplisit.
- Kontras cukup.
- Focus/active state jelas.
- Tombol tidak hanya mengandalkan warna.
- Logo brand memiliki alt/label yang benar.
- Teks harga menggunakan format Indonesia: `Rp 10.000`.

---

## 9. Navigasi dan Daftar Screen

Prototype referensi mencakup 21 screen:
1. Login
2. Dashboard
3. Kasir/Penjualan
4. Detail Produk & Topping
5. Keranjang
6. Pembayaran
7. Struk Transaksi
8. Riwayat Transaksi
9. Detail Transaksi
10. Manajemen Produk
11. Kelola Topping/Varian
12. Harga per Channel
13. Stok
14. Produksi
15. Pengeluaran
16. Tambah Pengeluaran
17. Laporan Penjualan
18. Laporan Produk
19. Laporan Keuangan
20. Pengaturan
21. Menu Lainnya

Screen dapat dipecah menjadi sub-route/modal sesuai implementasi, tetapi seluruh alur dan fungsi yang relevan harus tersedia. Jangan hanya membuat screenshot statis; elemen interaktif wajib berfungsi.

---

## 10. Business Rules Penting

1. Harga final dihitung/ditetapkan oleh backend atau divalidasi backend; jangan percaya total dari browser.
2. Total item = `(harga produk + total tambahan varian per unit) × quantity`, kecuali schema dan implementasi yang ada menentukan aturan lebih spesifik. Audit backend untuk menghindari penggandaan topping.
3. Total order = subtotal − diskon, dengan validasi diskon tidak boleh membuat total negatif.
4. Pembayaran harus terkait dengan order yang valid dan status yang benar.
5. Order yang sudah completed/paid tidak boleh diproses lagi.
6. Stok divalidasi sebelum pembayaran dan dikurangi satu kali setelah pembayaran berhasil.
7. Produksi menambah stok produk.
8. Penyesuaian stok harus menghasilkan movement record dan catatan alasan.
9. Order batal sebelum pembayaran tidak mengurangi stok; order yang dibatalkan setelah stok dikurangi memerlukan reversal movement.
10. Perubahan harga tidak boleh mengubah histori order lama.
11. Riwayat transaksi tidak dihapus permanen.
12. Data produk/varian yang pernah dipakai dalam transaksi sebaiknya dinonaktifkan, bukan dihapus.
13. Foto eksternal hanya untuk prototype/demo. Produksi sebaiknya menggunakan foto milik Dash Food atau aset yang memiliki izin penggunaan.
14. Logo brand harus digunakan secara konsisten dan tidak diubah secara menyesatkan.

---

## 11. Non-Functional Requirements

- Responsif untuk Android phone, tablet, dan desktop.
- Interaksi kasir umum memberi feedback segera.
- Operasi yang mengubah uang/stok harus menggunakan lock/validasi backend.
- Pesan error tidak membocorkan kredensial atau data sensitif.
- `.env`/secret tidak boleh dimasukkan ke frontend atau repo.
- Gunakan `LockService` jika sesuai untuk operasi bersamaan di Apps Script.
- Hindari pemanggilan Sheets berulang di loop bila bisa dibatch.
- Logging cukup untuk debugging, tetapi tidak mencatat data sensitif.
- Perubahan schema harus didokumentasikan dan memiliki rencana migrasi.
- UI tidak boleh menganggap API berhasil sebelum respons sukses diterima.

---

## 12. Acceptance Criteria per Alur Utama

### A. Penjualan cash
1. Pilih channel Offline.
2. Tambahkan Banana Bites.
3. Pilih topping jika diizinkan.
4. Ubah quantity.
5. Lanjut ke pembayaran.
6. Pilih Cash dan masukkan uang diterima.
7. Sistem menampilkan kembalian dengan benar.
8. Selesaikan transaksi.
9. Order menjadi COMPLETED dan payment PAID.
10. Stok berkurang sekali.
11. Struk menampilkan produk, topping, total, uang diterima, dan kembalian.

### B. Penjualan non-cash
1. Buat order dan pilih DANA/QRIS/ShopeePay/Bank Transfer.
2. Uang diterima tidak meminta nominal cash.
3. Total payment sama dengan total order.
4. Tidak ada kembalian.
5. Pembayaran sukses menyelesaikan order dan memotong stok sekali.

### C. Produk tanpa topping
1. Buka Sago atau Es Teler.
2. UI tidak menampilkan daftar topping Banana Bites.
3. Total hanya berasal dari harga produk dan quantity.

### D. Stok tidak cukup
1. Masukkan quantity melebihi stok.
2. UI memberi peringatan.
3. Backend menolak pembayaran.
4. Tidak ada payment sukses atau stock deduction parsial.

### E. Order history
1. Transaksi muncul setelah sukses.
2. List menampilkan nomor transaksi, waktu, channel, status, total, dan **nama produk**.
3. Detail transaksi sesuai data Sheets.

### F. Mobile
1. Di ponsel portrait, app memenuhi lebar layar.
2. Tidak ada black sidebars atau app shell sempit di tengah.
3. Kasir satu kolom, katalog di atas dan keranjang di bawah.
4. Dashboard KPI dua kolom.
5. Tombol mudah ditekan dan teks terbaca tanpa zoom.
6. Bottom navigation tidak menutupi konten.

---

## 13. Testing Plan

- Unit test untuk fungsi harga, total, kembalian, dan validasi stok.
- Integration test untuk create order → payment → stock movements → completed status.
- Duplicate payment test.
- Insufficient stock test.
- Product without topping test.
- Price by channel test.
- Test tiap metode pembayaran.
- Test mobile viewport: 360×800, 390×844, 412×915; tablet; desktop.
- Test Chrome Android termasuk mode Desktop Site.
- Test image loading failure and fallback.
- Test semua tombol/icon/menu: setiap elemen actionable harus melakukan aksi yang sesuai.
- Test loading/empty/error states.
- Test data historis tidak berubah ketika harga master berubah.

---

## 14. Tahapan Implementasi yang Disarankan

### Phase 0 — Audit
- Inventarisasi semua file frontend/backend.
- Baca `Config.gs`, `Api.gs`, service files, `Index.html`, `SCHEMA`, dan test.
- Jalankan test yang ada.
- Identifikasi gap UI/API/schema.
- Jangan ubah file sebelum audit dan rencana perubahan ditulis.

### Phase 1 — UI foundation
- Tetapkan token warna, typography, spacing, radius, icon sizes, touch targets.
- Benahi viewport/mobile layout.
- Buat komponen reusable: header, bottom nav, card, input, button, modal, brand icon, product image.
- Pastikan mobile-first sebelum detail screen.

### Phase 2 — Core POS
- Catalog, search/filter, product detail, toppings, cart, channel price.
- Pastikan perhitungan harga dan topping benar.

### Phase 3 — Checkout & order
- Payment flow, duplicate protection, stock deduction, receipt, history, detail order.

### Phase 4 — Operations
- Product, variants, channel pricing, stock, production, expenses.

### Phase 5 — Reports/settings
- Dashboard, sales reports, product reports, financial reports, settings, backup.

### Phase 6 — QA & deployment
- Test regression, mobile, permission, deployment, rollback.
- Buat changelog dan deployment checklist.

---

## 15. Aturan Kerja untuk Claude

- Jangan langsung rewrite seluruh project.
- Mulai dari audit file dan buat daftar temuan.
- Pertahankan Apps Script + Sheets sebagai stack V1.
- Jangan mengubah schema, function names, API contract, atau business rules tanpa menjelaskan alasan dan dampaknya.
- Jangan mengganti desain referensi dengan improvisasi yang berbeda.
- Prototype HTML adalah referensi visual/interaksi, bukan sumber data backend.
- Implementasi harus menghasilkan kode kerja, bukan hanya mockup.
- Setiap tombol harus terhubung ke aksi nyata atau dinonaktifkan dengan alasan.
- Jangan menulis “selesai” sebelum test relevan dijalankan.
- Setelah setiap fase: laporkan file berubah, alasan, test yang dijalankan, hasil test, risiko/gap, dan langkah rollback.
- Hindari mengarang data produk/harga/stok. Dummy data harus diberi label demo.
- Foto/logo eksternal harus memiliki fallback dan tidak boleh menjadi dependency tunggal untuk fungsi inti.

---

## 16. Definition of Done

Satu fitur dianggap selesai jika:
- Acceptance criteria fitur terpenuhi.
- UI mobile terbaca dan semua touch target berfungsi.
- Backend validasi data penting.
- Tidak ada duplikasi order/payment/stock movement.
- Loading/error/empty state tersedia.
- Test relevan lulus.
- Tidak ada regresi pada fitur lama.
- File dan perubahan terdokumentasi.
- Perubahan bisa di-rollback.

**Akhir PRD.**
