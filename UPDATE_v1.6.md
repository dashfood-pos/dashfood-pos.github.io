# Dash Food v1.6: Evaluasi Mingguan & Bulanan, Unduh Excel/PDF

Tanggal: 11 November 2026.

## 1. Beranda: filter Bulan lalu

- Menu periode di Beranda sekarang: **Hari ini, Kemarin, 7 Hari Terakhir, Minggu ini, Minggu lalu, Bulan ini, Bulan lalu**.
- Saat periode bukan "Hari ini", di bawah sapaan muncul rentang tanggalnya, misalnya *Bulan lalu: 1–31 Okt 2026 · dibandingkan 1–30 Sep 2026*, jadi jelas angka apa yang sedang dilihat.
- Tombol **Lihat semua** di Produk Terlaris membuka Laporan Produk dengan periode yang sama.

## 2. Periode baru & pembanding yang lebih adil (backend)

| Periode | Rentang | Dibandingkan dengan |
|---|---|---|
| Minggu ini | Senin s.d. hari ini | Minggu lalu, Senin s.d. hari yang sama |
| Minggu lalu | Senin–Minggu pekan lalu | Pekan sebelumnya |
| Bulan ini | Tgl 1 s.d. hari ini | Bulan lalu tgl 1 s.d. tanggal yang sama |
| Bulan lalu | Satu bulan penuh | Bulan sebelumnya (penuh) |
| Lainnya | tidak berubah | Rentang sama panjang tepat sebelumnya |

Sebelumnya "Bulan ini" tanggal 11 dibandingkan dengan 21–31 bulan lalu; sekarang dengan 1–11 bulan lalu.

## 3. Laporan: grafik baru, ramah pemula

Semua laporan (Penjualan, Produk, Keuangan):
- **Chip periode** di atas (Minggu ini, Minggu lalu, Bulan ini, Bulan lalu, 7 Hari, 30 Hari, Hari ini, Kemarin), cukup sekali ketuk.
- **Kartu periode**: rentang tanggal, pembandingnya, serta tombol **Unduh Excel** dan **Unduh PDF**.
- **Kesimpulan Singkat** dalam kalimat biasa, misalnya "Omzet naik 13,5% dibanding bulan sebelumnya", "Hari paling ramai: Sabtu", "Dari setiap Rp 100.000 omzet, Rp 32.000 terpakai untuk pengeluaran". Titik hijau = kabar baik, merah = perlu perhatian.
- Grafik batang bisa **diketuk** dan rinciannya tampil di bawah grafik. Periode lebih dari 7 hari punya pilihan **Per hari / Per minggu**; lebih dari 14 hari otomatis per minggu.

Per laporan:
- **Penjualan**: omzet per hari/minggu dengan garis abu-abu untuk periode sebelumnya, grafik **Hari Paling Ramai** (rata-rata omzet Senin–Minggu), channel, metode bayar.
- **Produk**: pendapatan per produk beserta penanda periode lalu dan % naik/turun, lalu rincian per varian.
- **Keuangan**: grafik **Omzet vs Pengeluaran**, grafik **Untung / Rugi** (hijau di atas 0, merah di bawah 0), komposisi pengeluaran dalam batang berperingkat (menggantikan donat).

Warna grafik tetap, tidak ikut warna aksen: biru = omzet, oranye = pengeluaran, abu-abu = periode lalu, hijau/merah = untung/rugi. Pasangan warna ini lolos uji buta warna dan kontras ≥ 3:1 di mode terang dan gelap. Kenaikan **pengeluaran** kini berwarna merah, bukan hijau.

## 4. Unduh Excel & PDF

- Dibuat langsung di HP dari data laporan yang tampil, **tanpa library tambahan**. Jalan sama di link Apps Script, PWA, dan APK.
- Nama file: `Dash-Food_Laporan-Penjualan_2026-10-01_sd_2026-10-31.xlsx`.
- **Excel (.xlsx)**: tab *Ringkasan* (periode, angka utama, % perubahan, kesimpulan) plus satu tab per tabel. Angka Rupiah, tanggal, dan persen tersimpan sebagai angka asli Excel, jadi bisa dijumlah, diurutkan, dan difilter. Baris judul dibekukan dan ada filter.
  - Penjualan: + tab **Transaksi** (semua transaksi selesai pada periode itu).
  - Keuangan: + tab **Daftar Pengeluaran**.
- **PDF (A4)**: kartu angka utama, kesimpulan, grafik vektor yang tajam saat dicetak, tabel dengan baris total, dan nomor halaman.

## 5. Test & hasil aktual (11 November 2026, Mac lokal)

| Pemeriksaan | Hasil |
|---|---|
| backend (+2 test: periode baru, data grafik) | 50/50 |
| UI: ui / features / sprint2 / pwa / v14 / **v16 (baru, 3 test)** | 54/54 |
| Gate anti-slop (22 layar × terang/gelap × aksen) | 308 layar, 0 FAIL |
| File .xlsx dibuka openpyxl & Quick Look macOS | terbaca, format Rp/%/tanggal benar |
| File .pdf dirender macOS | 3 laporan tampil benar, multi-halaman |

## 6. Cara update

1. **Apps Script** (wajib, ada perubahan backend): salin isi file di folder `dashfood-v1.6-apps-script/` (atau dari `src/`) ke file dengan nama sama di editor Apps Script: `Utils.gs`, `Reports.gs`, `App.html`, `Styles.html`, `Icons.html`. Lalu **Deploy → Manage deployments → pensil → New version**.
2. **PWA/APK**: push ke GitHub, maka workflow Pages membangun ulang. APK tidak perlu dipasang ulang.
3. Tidak ada perubahan schema Google Sheets, jadi `setupDashFood` tidak perlu dijalankan ulang.

Penting: kalau PWA sudah ter-update tetapi Apps Script **belum** di-deploy ulang, chip *Minggu ini/Minggu lalu* akan menampilkan "Periode tidak dikenal". Deploy keduanya bersamaan.

## 7. Yang belum terverifikasi

- Membuka file .xlsx di Microsoft Excel/Google Sheets di HP Android dan unduhan di dalam APK (TWA). Di Chrome desktop dan headless unduhan berjalan; di APK seharusnya sama karena TWA memakai Chrome.
- Unduhan di link Apps Script sungguhan (`/exec`). Mekanismenya sama dengan "Download PDF" struk yang sudah dipakai sejak v1.0.

## 8. File yang diubah

- Backend: `src/Utils.gs` (periode `week`, `last_week`, pembanding baru, `weekdayIdx`), `src/Reports.gs` (`prev_daily`, `prev_by_product`, `prev_total_revenue`, `reportFinance.daily`, batas 366 hari). Penambahan field saja, kontrak lama tetap.
- Frontend: `src/App.html` (Beranda, laporan, grafik, ekspor), `src/Styles.html` (token & komponen grafik), `src/Icons.html` (ikon `sheet`).
- Test: `tests/backend.test.js` (+2), `tests/ui/v16.test.js` (baru), `package.json` (versi 1.6.0, test v16).

Rollback: deploy ulang versi Apps Script sebelumnya (Manage deployments → pilih versi lama) dan kembalikan `src/` ke v1.5.4. Tidak ada data yang perlu dikembalikan.
