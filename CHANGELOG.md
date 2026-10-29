# Changelog

## 1.5.4 — 28 Oktober 2026 (perbaikan setelah rilis pertama)
- APK tidak lagi tertutup sendiri saat dibuka. Penyebabnya: folder gambar splash belum terdaftar di FileProvider (`android/app/src/main/res/xml/filepaths.xml`).
- Garis terang di atas area gestur HP dihapus, jadi menu bawah menyatu dengan area gestur.
- Build APK di GitHub Actions: `setup-android` hanya memasang `platform-tools` (paket `tools` sudah dihapus Google).
- Kasir: stok langsung diperbarui setelah produksi tanpa perlu pindah layar. Teks kartu produk (nama, harga, stok) sejajar antar kartu.
- Workflow baru `apk-diagnose.yml`: menguji APK di emulator Android lalu menyimpan log dan screenshot.
- Alamat resmi pindah ke organization `dashfood-pos` (https://dashfood-pos.github.io/). Variabel opsional `DF_CUSTOM_DOMAIN` untuk domain sendiri.
- README ditulis ulang dengan bahasa yang lebih mudah dipahami, ditambah bagian keamanan.

## 1.5.0 — 28 Oktober 2026 (tema warna + APK)
Detail lengkap: `UPDATE_v1.5.md`.
- 5 warna aksen (Oranye, Hijau, Biru, Marun, Cokelat) × mode terang/gelap; kontras diukur per aksen.
- APK Android (TWA) dibuild di GitHub Actions: kunci dari Secrets, verifikasi sidik jari, rilis otomatis; `assetlinks.json` dari build PWA.
- Gate anti-slop 308 layar, 0 FAIL. Test: backend 48, UI 51.

## 1.4.0 — 21 Oktober 2026 (anti-slop, mode gelap, navigasi instan)
Detail lengkap: `UPDATE_v1.4.md`.
- House rules anti-slop untuk layar aplikasi: tanpa gradien/glow/bayangan diam/emoji/ikon pelangi/violet; permukaan dipisah nada; tombol pill; Inter saja.
- Mode gelap (Otomatis/Terang/Gelap di Lainnya), tanpa kedipan; struk tetap putih.
- KPI simetris: angka sejajar & ukuran disamakan per grid; hanya keterangan yang menyesuaikan.
- Navigasi tanpa menunggu: stale-while-revalidate, prefetch Order & Stok, cache perangkat per pengguna (dihapus saat keluar), buka ulang aplikasi instan.
- Gate `dev/taste-check.js` (132 layar, 0 FAIL), `dev/measure-nav.js`.
- Test: backend 48, UI 19, fitur 10, sprint 9, PWA 6, v1.4 6.

## 1.3.0 — 21 Oktober 2026 (UI oranye + PWA)
Detail lengkap: `UPDATE_v1.3.md`.
- UI baru mengikuti referensi: tema oranye, header judul tengah, kartu/chip/cari berbentuk pill, nav dengan tombol Kasir bulat di tengah.
- Skeleton loading per jenis layar (dan di HTML awal) menggantikan spinner konten.
- Tombol + kartu produk dipindah ke pojok kanan bawah; harga tebal.
- PWA untuk GitHub Pages: `doPost` (API JSON), transport fetch, manifest, service worker (kerangka saja), ikon, workflow GitHub Actions.
- Tanpa perubahan schema.
- Test: backend 48, UI 19, fitur 10, sprint 9, PWA 6.

## 1.2.0 — 13 Oktober 2026 (Bug Fix & UX Sprint)
Detail lengkap: `UPDATE_sprint2.md`.
- Logo struk terpisah (`receipt_logo_url`) dengan upload/URL/default; di-snapshot per transaksi; dipakai di HTML, cetak, PDF, PNG.
- Login hanya menampilkan logo.
- Edit order belum dibayar (`updateOrder`, revisi `~R<n>`); batal wajib konfirmasi nomor TRX di backend; audit trail `ORDER_EVENTS`.
- Reload: endpoint `bootstrap` (4 → 1 round-trip), info publik disisipkan ke HTML, cache katalog 5 menit + invalidasi, ukuran gambar per konteks, font non-blocking.
- Layout ponsel: tinggi berbasis `height:100%`, warna html/body disinkronkan, layar Info Tampilan.
- Perbaikan: tombol kembali Android keluar dari aplikasi setelah dialog ditutup.
- Schema: `ORDERS.receipt_logo_url`, `ORDERS.revision`, sheet `ORDER_EVENTS` (jalankan `setupDashFood`).
- Test: backend 47, UI 19, fitur 10, sprint 9.

## 1.1.0 — 13 Oktober 2026
Detail lengkap: `UPDATE_v1.1.md`.
- Dashboard: bottom nav di semua layar non-transaksi; handler API lazy + `checkInstall()`.
- Struk dikirim sebagai gambar PNG (Web Share API + fallback unduh & buka WhatsApp).
- Upload foto ke Google Drive (folder khusus, share per file) atau URL tervalidasi; posisi crop; arsip foto lama.
- Label DEMO dihapus dari UI operasional; status data hanya di Pengaturan admin.
- Layar Ikon Channel & Pembayaran: upload/URL/default untuk 10 kode.
- Perbaikan: `theme-color` ditolak HtmlService; urutan riwayat order di detik yang sama.
- Test: backend 41, UI regresi 19, fitur 10.

## 1.0.0 — 13 Oktober 2026

Rilis awal (dibangun dari nol; tidak ada kode sebelumnya).

### Ditambahkan
- 21 screen sesuai prototype: Login, Dashboard, Kasir, Detail Produk & Topping, Keranjang, Pembayaran, Struk, Riwayat, Detail Transaksi, Produk, Topping/Varian, Harga per Channel, Stok, Produksi, Pengeluaran, Tambah Pengeluaran, Laporan Penjualan/Produk/Keuangan, Pengaturan (+8 sub-halaman), Lainnya.
- Backend Apps Script dengan 44 aksi API, role ADMIN/MANAGER/STAFF.
- Schema PRD §6 + tambahan terdokumentasi (`AUDIT_REPORT.md` §5): `PRODUCT_VARIANTS`, `USERS`, kolom snapshot & audit.
- Proteksi: harga dihitung server, `createOrder` idempotent, bayar ganda ditolak, stok dipotong sekali di bawah script lock, pembatalan dengan reversal stok.
- Perbaikan viewport Apps Script (`addMetaTag`) dan mode Desktop Site Android.
- Runtime tiruan Apps Script, 34 test backend, 19 test UI end-to-end.

### Diperbaiki selama QA
- Form di dalam bottom sheet tidak tersubmit karena backdrop memanggil `preventDefault()`.
- Nilai KPI terpotong di ponsel; layout KPI diubah (nilai selebar kartu).
- Toast menutupi header/tombol kembali; dipindah ke bawah dan tidak menghalangi ketukan.
- Target sentuh nama item keranjang 24 px → 44 px.

### Diketahui / belum
- HPP & laba kotor: belum tersedia (tidak ada data biaya per produk).
- Logo brand resmi & foto produk: perlu diisi pemilik (slot URL tersedia).
- Uji di perangkat Android fisik & Apps Script sungguhan: checklist `DEPLOYMENT.md` §7.
