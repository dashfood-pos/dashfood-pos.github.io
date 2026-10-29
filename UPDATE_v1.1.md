# Dash Food POS v1.1 — Laporan Perbaikan

Tanggal: 13 Oktober 2026. Lima perbaikan: akses dashboard, struk WhatsApp sebagai gambar, upload/URL foto, label DEMO, dan ikon channel/pembayaran.

---

## Cara update proyek Apps Script (±10 menit)

1. **File baru:** buat Script `Media` dan tempel isi `src/Media.gs`.
2. **Ganti isi** file berikut dengan versi di paket: `Config.gs`, `Api.gs`, `Settings.gs`, `Products.gs`, `Inventory.gs`, `Reports.gs`, `Orders.gs`, `App.html`, `Styles.html`. File lain tidak berubah.
3. Jalankan **`setupDashFood`**. Ini menambah sheet `MEDIA` dan kolom `image_position` di `PRODUCTS`/`VARIANTS`. Data lama tidak disentuh.
4. Jalankan **`authorizeMedia`** → setujui izin **Google Drive**. Folder *Dash Food Media* akan dibuat.
5. Jalankan **`checkInstall`**. Hasil yang benar: "Semua file .gs lengkap."
6. Kalau memakai URL `/exec`: **Deploy → Manage deployments → Edit → New version**. URL `/dev` langsung memakai kode terbaru.

**Migrasi & rollback**
- Hanya **menambah**: satu sheet baru dan dua kolom baru di akhir sheet. Tidak ada kolom yang di-rename atau dihapus.
- URL foto lama di `image_url` tetap berlaku.
- Rollback: pilih versi deployment sebelumnya. Sheet `MEDIA` dan kolom `image_position` boleh dibiarkan; kode lama mengabaikannya.

---

## 1. Akses Dashboard

**Akar masalah**
1. Map handler di `Api.gs` sebelumnya merujuk fungsi secara langsung saat dibangun. Kalau satu fungsi tidak terbaca, misalnya `Auth.gs` belum tertempel lengkap, **semua** panggilan API gagal ("logout is not defined"), termasuk dashboard.
2. 16 layar sekunder tidak punya bottom nav, misalnya Struk, Detail Transaksi, form produk/topping/pengeluaran, Produksi, dan sub-Pengaturan. Untuk kembali ke Beranda perlu beberapa kali tombol kembali.

**Perbaikan**
- Handler API dipanggil lazy, jadi file yang hilang hanya memengaruhi fitur terkait. Ditambah fungsi `checkInstall()` untuk mendeteksi file `.gs` yang belum ada.
- Bottom nav tampil di **semua layar kecuali alur transaksi** (Detail Produk, Keranjang, Pembayaran), supaya kasir tidak menekannya tidak sengaja saat membayar.
- Tab aktif ditandai warna dan `aria-current`. Layar sub-menu menyorot tab induknya; Struk menyorot Order.
- Dashboard yang gagal dimuat menampilkan pesan error dan tombol **Coba lagi**, tanpa angka pengganti.
- Keranjang dan order yang belum dibayar tetap ada saat berpindah layar.

## 2. Struk WhatsApp sebagai Gambar

**Akar masalah:** versi sebelumnya hanya membagikan **teks** lewat `navigator.share` atau link `wa.me`. Tidak ada gambar yang dibuat.

**Perbaikan**
- Struk digambar ke **PNG 1200 px** (480 px logis × 2,5) langsung di browser, tanpa library eksternal.
- Sebelum menggambar, data **diambil ulang dari server** (`orderDetail`), jadi total tidak bisa dimanipulasi dari browser.
- Isi gambar: logo, nama toko, no. transaksi, tanggal-jam, channel, no. platform, kasir, item + topping + catatan, qty × harga, subtotal, diskon, total, metode bayar, uang diterima & kembalian (cash), status batal, ucapan terima kasih.
- Sheet **Kirim Struk** memisahkan tiga aksi:
  - **Bagikan gambar**: memakai Web Share API dengan file PNG, lalu pengguna memilih WhatsApp. Kalau browser tidak mendukung, tombol nonaktif dengan alasan tertulis.
  - **Unduh gambar**: menyimpan file PNG.
  - **Buka WhatsApp**: link `wa.me` dengan caption, plus kolom nomor pelanggan opsional (08… → 628…). Pengguna diberi instruksi untuk melampirkan gambar secara manual.
- UI **tidak pernah** menyatakan "terkirim". Setelah menu share ditutup, pesannya: "Gambar diteruskan ke aplikasi pilihan. Pastikan pesan terkirim di WhatsApp."
- Cetak dan PDF tetap ada.

**Kirim otomatis tanpa membuka WhatsApp** butuh **WhatsApp Business Platform (Cloud API)** dari Meta. Belum diimplementasikan karena butuh:
- Akun Meta Business terverifikasi dan nomor WhatsApp khusus bisnis (tidak bisa dipakai bersamaan di aplikasi WhatsApp biasa).
- Access token yang disimpan **hanya** di Script Properties, tidak pernah di frontend.
- Pesan pertama ke pelanggan wajib memakai *message template* yang disetujui Meta, dan dikenai biaya per pesan sesuai tarif Meta yang berlaku.
- Gambar diunggah dulu ke endpoint media Meta.

Ini keputusan bisnis (biaya, verifikasi). Kalau mau, ini bisa jadi fase berikutnya.

## 3. Foto: URL & Upload

**Penyimpanan yang dipilih: Google Drive.** Sel Google Sheets maksimal 50.000 karakter, jadi tidak cukup untuk menyimpan foto.
- File disimpan di folder **Dash Food Media** milik akun pemilik skrip. ID folder ada di Script Property `MEDIA_FOLDER_ID`.
- **Hanya file yang diunggah** yang di-share *Anyone with the link: Viewer* supaya bisa tampil di aplikasi. Folder dan isi Drive lain tidak dibagikan.
- Sheet baru `MEDIA` mencatat: `media_id, file_id, url, purpose, ref_id, mime_type, size_bytes, original_name, status, created_at, created_by, archived_at`. Referensi permanennya `file_id`.
- Saat foto **diganti atau dihapus**, file lama dipindah ke **Trash Drive** (bisa dipulihkan 30 hari) dan ditandai `ARCHIVED`. URL eksternal tidak pernah disentuh.

**Fitur**
- Berlaku untuk foto produk, foto topping, logo toko (login & struk), dan foto latar login. Aplikasi belum punya banner menu, jadi tidak ada yang ditambahkan untuk itu.
- **Upload Foto:**
  - Pemilih file di HP maupun desktop.
  - Validasi tipe JPG/PNG/WebP/GIF, di browser **dan** server (server mengecek magic number, jadi file teks yang diganti ekstensinya ditolak).
  - Batas ukuran bisa diatur lewat setting `upload_max_mb`, default 5 MB.
  - Gambar yang sisi terpanjangnya > 1600 px diperkecil **proporsional**. GIF tidak diubah.
  - Status loading, sukses, dan gagal ditampilkan.
- **Pakai URL:**
  - Hanya `https`.
  - Gambar **benar-benar dicoba dimuat** sebelum boleh dipakai. Halaman web, link privat, atau link mati ditolak dengan pesan yang jelas.
  - Link Google Drive `file/d/…/view` otomatis dikonversi ke URL gambar langsung.
- Pratinjau dengan rasio tetap: produk 4:3, topping/logo 1:1, latar login 16:9.
- Tombol **Hapus foto**.
- Foto produk/topping memakai `cover` dengan **posisi crop** (Tengah/Atas/Bawah/Kiri/Kanan). Logo memakai `contain`.
- Perubahan baru tersimpan saat **Simpan** ditekan, jadi admin bisa batal.

## 4. Label DEMO

**Akar masalah:** label "DEMO" ditampilkan berdasarkan `SETTINGS.data_mode`, yang bernilai `DEMO` karena `seedDemoData()` pernah dijalankan. Labelnya muncul di 4 tempat: pill di setiap header, info-box di login, info-box di dashboard, dan footer Pengaturan.

**Perbaikan**
- Semua label itu dihapus dari UI operasional (login, dashboard, kasir, struk, laporan, modal).
- Status data tetap jujur untuk **admin saja** di **Pengaturan → Status Data** ("Masih memakai data contoh"). Di sana ada tombol untuk menandai data sebagai operasional. Tombol ini hanya mengubah label, **tidak menghapus atau mengubah data**.
- `seedDemoData()`, dev harness, dan test tetap ada.
- Tidak ada fallback data dummy di jalur error. Kalau API gagal, yang tampil adalah pesan error + Coba lagi (sudah diuji untuk katalog, dashboard, dan createOrder).

> Kalau data demo sudah terpasang di spreadsheet produksi lo, menghapus label **tidak** membuatnya jadi data asli. Ganti harga dan stok contoh dengan data asli (atau mulai dari spreadsheet baru), baru tandai sebagai operasional.

## 5. Ikon Channel & Pembayaran

**Akar masalah:** URL logo hanya bisa diisi untuk 7 dari 10 kode. Inputnya diselipkan di form aktif/nonaktif channel, tanpa upload, tanpa pratinjau, dan tanpa tombol default.

**Perbaikan:** layar baru **Pengaturan → Ikon Channel & Pembayaran** (khusus Admin).
- Berisi 5 channel (Offline, WhatsApp, GoFood, GrabFood, ShopeeFood) dan 5 metode (Cash, DANA, ShopeePay, QRIS, Transfer Bank).
- Setiap baris: ikon saat ini, **Upload**, **URL**, **Default**, lalu pratinjau ikon baru dengan **Simpan/Batal**.
- Disimpan di backend: `SETTINGS.brand_logo_<KODE>`, ditambah `brand_logo_OFFLINE`, `brand_logo_CASH`, `brand_logo_BANK_TRANSFER`.
- Satu komponen `brandMark()` dipakai di dashboard, chip kasir, detail produk, keranjang, pembayaran, dan laporan. Kotaknya berukuran sama dengan `object-fit: contain`.
- Ikon gagal dimuat → otomatis kembali ke ikon bawaan.
- Upload ikon memakai mekanisme Drive yang sama dengan foto.

---

## File yang diubah

| File | Perubahan |
|---|---|
| `src/Media.gs` | **Baru**: `uploadImage`, `archiveMediaUrl_`, `normalizeImageUrl_`, `authorizeMedia`, validasi magic number |
| `src/Config.gs` | Sheet `MEDIA`, kolom `image_position`, setting `upload_max_mb` + 3 `brand_logo_*`, role `uploadImage`/`setDataMode` |
| `src/Api.gs` | Handler lazy, `checkInstall()`, aksi `uploadImage` & `setDataMode`, meta tag hanya `viewport` |
| `src/Settings.gs` | Normalisasi URL gambar, arsip file lama, `setDataMode`, validasi `upload_max_mb` |
| `src/Products.gs` | `image_position`, arsip foto lama, normalisasi URL |
| `src/Inventory.gs`, `src/Reports.gs` | Meneruskan `image_position` |
| `src/Orders.gs` | Urutan riwayat order di detik yang sama memakai nomor transaksi (**bug ditemukan saat QA**) |
| `src/App.html` | Bottom nav, komponen gambar, layar Ikon & Status Data, struk gambar + Kirim Struk, label DEMO dihapus |
| `src/Styles.html` | Gaya pratinjau gambar, gambar struk, toast di atas saat sheet terbuka |

**API baru:** `uploadImage({purpose, ref_id, filename, mime_type, base64})` dan `setDataMode({mode})`.
**API yang diubah (kompatibel):** `saveProduct`/`saveVariant` menerima `image_position`; `saveSettings` menerima 3 kunci ikon baru + `upload_max_mb`; `catalog`, `stock`, dan laporan mengembalikan `image_position`.

## Test yang dijalankan (hasil aktual)

| Suite | Hasil |
|---|---|
| `tests/backend.test.js` | **41/41 lulus** (+7 baru: upload/validasi/role, arsip foto, normalisasi link Drive, 10 ikon + default, status data, urutan riwayat, meta tag) |
| `tests/ui/ui.test.js` (regresi) | **19/19 lulus**: order, pembayaran, stok, pembatalan, 21 screen, viewport |
| `tests/ui/features.test.js` | **10/10 lulus**, mencakup 12 butir pengujian wajib |

Rincian `features.test.js`:
1. Beranda bisa dibuka dengan 1 tap dari 25 layar, di ponsel dan desktop.
2. Struk menghasilkan PNG valid 1200 px yang diunduh; isinya memakai data server.
3. Fallback WhatsApp: nomor dinormalkan dan caption memakai nomor transaksi.
4. Browser yang mendukung share memanggil `navigator.share` dengan file PNG, dan toast tidak mengklaim "terkirim".
5. Upload foto dari ponsel dan desktop: file palsu ditolak, foto tampil di kasir, tetap ada setelah reload, gambar 3200×2000 diperkecil ke 1600×1000, foto lama diarsipkan.
6. URL `http` ditolak, halaman web ditolak, URL valid tampil di login setelah reload.
7. Label DEMO tidak muncul di 10 layar maupun struk.
8. Ikon tampil di dashboard, kasir, laporan, dan pembayaran; tetap ada setelah reload; fallback berukuran sama; tombol Default berfungsi.
9. Saat API gagal, tidak ada produk atau order palsu.

Screenshot ada di `screenshots/v1.1/` (termasuk `struk_contoh.png`).

## Keterbatasan yang tersisa (belum diuji / di luar kendali kode)

- **Belum diuji di Apps Script dan Android fisik.** Drive dan `navigator.share` diuji memakai tiruan. Yang perlu dicek setelah deploy:
  - Apakah frame Apps Script mengizinkan **Web Share** dan **download**. Kalau ditolak, aplikasi menampilkan pesan + fallback; tekan lama gambar untuk menyimpan.
  - Apakah gambar Drive (`drive.google.com/thumbnail?id=…`) tampil konsisten. Google bisa membatasi akses saat traffic tinggi; untuk volume besar, pertimbangkan hosting gambar lain.
- **Akun Google Workspace** bisa melarang share "Anyone with the link". Kalau begitu, upload menampilkan error yang jelas, dan opsi URL tetap bisa dipakai.
- Logo toko dari Drive mungkin tidak bisa digambar ke struk karena kebijakan CORS. Kalau begitu, struk gambar memakai logo bawaan (struk HTML/cetak tetap memakai logo toko).
- Foto yang diunggah tapi tidak jadi disimpan (admin menekan Batal) tetap ada di folder Drive dengan status `ACTIVE`.
- Kirim otomatis lewat WhatsApp Business API belum ada (lihat bagian 2).
