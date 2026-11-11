# Dash Food v1.7: Aplikasi Kasir untuk Booth + Printer Bluetooth

Tanggal: 11 November 2026. Melanjutkan v1.6 (evaluasi mingguan/bulanan, unduh Excel/PDF), yang dirilis bersamaan.

## 1. Dua "aplikasi": Admin dan Kasir

| | Admin / Manager | Kasir (HP booth) |
|---|---|---|
| Cara buka | https://dashfood-pos.github.io/ atau APK | https://dashfood-pos.github.io/kasir/ (ikon **DF Kasir**), atau APK/link biasa lalu login dengan akun Kasir |
| Layar pertama | Beranda | **Kasir** |
| Menu bawah | Beranda · Order · Kasir · Stok · Lainnya | **Kasir · Riwayat · Stok · Lainnya** |
| Lainnya | Produk, harga, laporan, pengaturan, dst. | Printer Struk, Riwayat, Stok, Ganti Password, Tampilan |

- Role `STAFF` sekarang tampil sebagai **Kasir**. Tambah akun kasir: **Lainnya → Pengaturan → Akun Pengguna → Tambah → role Kasir**.
- Akun Kasir **tidak bisa** membuka Beranda, laporan, laba, pengeluaran, atau pengaturan toko. Ini ditolak di layar **dan di server** (`dashboard` sekarang khusus Manager/Admin; `bootstrap` tidak mengirim angka laba ke akun kasir).
- Admin yang login di `/kasir/` tetap bisa kembali lewat **Lainnya → Buka menu lengkap**.
- Admin punya menu baru **Lainnya → Aplikasi Kasir (HP booth)** berisi link dan langkah pasang.

Akun yang sudah dibuat di data asli: `kasir` (nama tampilan "Kasir Booth", role Kasir). Password sesuai permintaan pemilik.

## 2. Printer Bluetooth (per HP)

Menu **Lainnya → Printer Struk**. Pengaturan disimpan di HP itu sendiri, jadi dua HP booth bisa memakai printer berbeda.

| Cara | Kapan dipakai | Catatan |
|---|---|---|
| **RawBT** (disarankan) | Printer thermal Bluetooth 58/80 mm apa pun (EPPOS, Panda, iware, Xprinter, dll.) | Butuh aplikasi gratis RawBT dari Play Store. Cetak 1 ketukan tanpa dialog. Mendukung Bluetooth klasik & BLE. |
| **Bluetooth langsung** | Printer yang mendukung BLE | Tanpa aplikasi tambahan. Hanya di APK/PWA (tidak bisa dari link Apps Script). |
| **Dialog cetak HP** | Cadangan / simpan PDF | Seperti sebelumnya. |

Pilihan lain: **lebar kertas 58/80 mm** dan **Cetak otomatis setelah bayar**.

Struk dikirim sebagai perintah **ESC/POS** (teks tajam, cepat): nama toko besar, nomor & tanggal, item + topping, total, uang diterima/kembali, pesan penutup, lalu kertas dimajukan & dipotong.

### Setup tercepat di HP booth (±5 menit, sekali saja)
1. Nyalakan printer → **Pengaturan HP → Bluetooth** → sambungkan (PIN biasanya `0000` atau `1234`).
2. Pasang **RawBT** dari Play Store → buka → pilih printer → tes cetak.
3. Buka **DF Kasir** (atau APK) → login `kasir` → **Lainnya → Printer Struk** → pilih RawBT, kertas 58 mm, aktifkan **Cetak otomatis** → **Cetak Uji**. Saat HP bertanya, pilih RawBT → **Selalu**.

Setelah itu, setiap transaksi berhasil → struk langsung keluar. Tombol **Cetak** di layar struk tetap ada untuk cetak ulang.

## 3. Test & hasil aktual (Mac lokal)

| Pemeriksaan | Hasil |
|---|---|
| backend (+1 test: batasan akun Kasir) | 51/51 |
| UI semua suite + **v17 (baru, 4 test)**: mode kasir, `/kasir/`, RawBT, Bluetooth langsung (printer tiruan) | 58/58 |
| Gate anti-slop (+ layar Printer) | 322 layar, 0 FAIL |
| Login akun `kasir` ke backend live | berhasil |

## 4. Yang belum terverifikasi
- Cetak ke printer fisik (RawBT & BLE) di HP Android sungguhan. Byte ESC/POS diuji otomatis, tetapi tiap merek printer bisa berbeda sedikit (misalnya perintah potong diabaikan printer tanpa pemotong).
- Cetak otomatis lewat RawBT memakai "intent" Android. Chrome mengizinkannya hanya beberapa detik setelah ketukan; bila koneksi lambat dan struk tidak keluar otomatis, tekan **Cetak** di layar struk.

## 5. File yang diubah
- Backend: `src/Config.gs` (label Kasir, `dashboard` khusus Manager), `src/Api.gs` (`bootstrap` tanpa dashboard untuk kasir).
- Frontend: `src/App.html` (mode kasir, layar Printer Struk, ESC/POS, RawBT, Web Bluetooth), `src/Styles.html`.
- PWA: `tools/build-web.js` (halaman & manifest `/kasir/`), `web/sw.js`.
- Test: `tests/backend.test.js`, `tests/ui/v17.test.js` (baru), `tests/ui/ui.test.js` (menu kasir kini disembunyikan, bukan dikunci), helper login di test lain, `dev/taste-check.js`.

Rollback: Apps Script → Deploy → Manage deployments → pilih versi sebelumnya. Akun `kasir` bisa dinonaktifkan di Akun Pengguna.
