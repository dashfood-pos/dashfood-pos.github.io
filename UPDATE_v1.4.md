# Dash Food v1.4: Anti-slop, Mode Gelap, Navigasi Instan, KPI Simetris, Inter

Tanggal: 21 Oktober 2026.

## 1. Catatan tentang skill yang dipakai

`SKILL.md` "tasteskill v2" menyebut dirinya **"Not for dashboards or app screens"**. Skill ini untuk landing page. Yang ter-upload juga hanya `SKILL.md`; script `draw.mjs`, `inspect.mjs`, `lint.mjs` dan folder `library/` tidak ikut. Karena itu yang diterapkan adalah **house rules dan laws of the craft yang masuk akal untuk layar aplikasi**. Gate `inspect.mjs` diganti dengan pemeriksa buatan sendiri yang berjalan di browser: `dev/taste-check.js`. Langkah khusus landing page tidak dikerjakan karena tidak relevan untuk aplikasi kasir: draw direction, foto arsip, motion layer minimal 8 elemen, dan hero.

| House rule | Penerapan di Dash Food |
|---|---|
| Tanpa gradien | Glow login, shimmer skeleton, fade bar CTA, dan latar placeholder foto diganti warna datar. Skeleton sekarang **berdenyut** (opacity), tidak lagi memakai shimmer. |
| Tanpa bayangan pada elemen diam, tanpa glow | Kartu, chip, kolom cari, tombol, dan tombol + tidak lagi berbayangan. Permukaan dibedakan lewat **selisih nada**: ground `#F2F1EE` → kartu putih → `surface-2`. Bayangan hanya untuk elemen yang benar-benar melayang: nav bawah, bar keranjang, sheet, toast, dan tombol kembali di atas foto. |
| Tanpa emoji | "Halo, Admin! 👋" menjadi "Halo, Admin". |
| Tanpa ikon berwarna-warni / kartu ber-ikon | Ikon pelangi di kartu KPI dihapus. Ikon menu di Lainnya/Pengaturan memakai satu nada netral. |
| Tanpa violet/indigo | Warna ungu dihapus dari token. |
| Tanpa garis tipis | Pemisah 1px pada daftar diganti jarak. Riwayat order kini satu permukaan per order. Garis putus-putus hanya ada di struk, karena struk memang meniru kertas. |
| Satu bentuk tombol | Semua tombol dan chip berbentuk pill. Field form tetap bergaris tipis; skill sendiri mengecualikan form. |
| Satu font | **Inter saja**: Poppins dihapus, termasuk dari gambar struk. Angka memakai tabular figures. |
| Satu aksen | Oranye. Hijau, merah, dan kuning hanya untuk status. Warna brand channel/pembayaran (GoFood, Grab, DANA, dll.) tetap karena itu warna asli brand. |
| Teks isi pakai tinta penuh, kontras cukup | Semua teks ≥ 4.5:1 (teks besar ≥ 3:1) di **kedua tema**. Diukur oleh gate, bukan diperkirakan. |

## 2. Mode gelap

- Tersedia di **Lainnya → Tampilan: Otomatis / Terang / Gelap**. Otomatis mengikuti setelan HP dan berubah langsung saat HP berganti tema. Pilihan disimpan per perangkat.
- Tema dipasang lewat skrip kecil di `<head>` sebelum CSS dibaca, jadi tidak ada kedipan terang ke gelap saat aplikasi dibuka.
- Gelapnya hangat (`#12100E`), bukan hitam pekat. Oranye untuk teks di tema gelap dibuat lebih terang (`#FF9F5C`) supaya terbaca.
- **Struk tetap kertas putih** di tema gelap: tampilan struk, cetak, PDF, dan gambar PNG.
- Warna status bar HP (PWA) mengikuti tema.

## 3. KPI simetris

- Setiap kartu tersusun dari tiga baris tetap: **label** (1 baris, dipotong rapi bila panjang), **angka** (1 baris), lalu **keterangan**. Hanya keterangan yang tingginya boleh berubah, sehingga **angka selalu sejajar** di semua kartu satu baris.
- Bila satu angka tidak muat (misalnya Rp 123.456.789 di HP 360 px), **semua angka di grid itu diperkecil bersama**, bukan hanya kartu tersebut (`fitKpi()`).
- Kartu HPP disamakan strukturnya: angkanya "—", sementara "Belum tersedia · Kenapa?" ada di baris keterangan.
- Penjualan per Channel: "Rp" pindah ke judul ("Rupiah"), sehingga angka di 5 kolom tidak lagi bertabrakan di 360 px.

## 4. Menu terbuka tanpa menunggu

Penyebab "delay": setiap menu baru mengambil data ke Apps Script **setelah** diketuk. Satu panggilan butuh sekitar 1–3 detik, dan selama itu yang tampil hanya skeleton.

Perbaikannya:
1. **Stale-while-revalidate.** Data yang pernah dimuat langsung tampil. Kalau umurnya lebih dari 20 detik, data diambil ulang di belakang (ditandai bar oranye tipis di atas layar), lalu layar diperbarui. Kalau pengambilan ulang gagal, data lama tetap tampil dan muncul peringatan.
2. **Prefetch.** Setelah Beranda tampil, data Order dan Stok diambil di belakang.
3. **Cache perangkat.** Sesi dan data terakhir disimpan per pengguna, maksimal 40 data dan 150 KB per data. Saat aplikasi dibuka ulang, Beranda tampil **seketika** lalu disegarkan. Angka "Hari ini" dari kemarin tidak dipakai. Cache **dihapus saat Keluar** atau saat sesi berakhir. Detail order tidak disimpan di perangkat.
4. Kursor dan isi kolom yang sedang diketik **tidak hilang** ketika layar diperbarui di belakang.

**Aman untuk transaksi:** harga dan stok saat checkout tetap dihitung server (`createOrder`/`recordPayment` di bawah LockService). Data tampilan yang sedikit usang tidak bisa menyebabkan harga salah, stok ganda, atau bayar ganda.

### Pengukuran (`node dev/measure-nav.js 800`, latensi tiruan 800 ms per panggilan)

| Ketuk → isi layar tampil | v1.3 (sebelum) | v1.4 (sesudah) |
|---|---|---|
| Order, pertama kali | 852 ms | **56 ms** |
| Stok, pertama kali | 839 ms | **42 ms** |
| Kasir | 61 ms | 49 ms |
| Buka ulang aplikasi → Beranda | 826 ms | **24 ms** |
| Order setelah buka ulang | 867 ms | **45 ms** |
| Stok setelah buka ulang | 846 ms | **41 ms** |
| Kunjungan ulang Order/Stok | ~46 ms (data tidak pernah disegarkan) | ~50 ms (tampil langsung **dan** disegarkan di belakang) |

**Catatan jujur:**
- Login pertama dan menu yang belum pernah dibuka (Laporan, Produk, dll.) tetap menunggu server sekali, karena datanya memang belum ada. Kunjungan berikutnya, termasuk setelah aplikasi ditutup, langsung tampil.
- Biayanya: 2 panggilan latar tambahan (Order & Stok) setiap kali login.

## 5. File yang diubah

- `src/Styles.html`: ditulis ulang (token terang/gelap, house rules).
- `src/App.html`: data layer SWR + prefetch + cache perangkat, tema, KPI, fokus input, grafik memakai token, tanpa emoji.
- `src/Index.html`: hanya Inter, skrip tema di `<head>`.
- `tools/make-icons.js` dan `web/icons/*`: ikon tanpa gradien.
- `web/pwa.config.json`: warna tema.
- **Baru:** `dev/taste-check.js` (gate), `dev/measure-nav.js` (ukur navigasi), `tests/ui/v14.test.js`.
- Penyesuaian test: penunggu juga menunggu bar penyegaran; ekspektasi panggilan boot (+ prefetch); test error state dan offline diperbarui sesuai perilaku baru.
- **Backend (.gs) dan schema: tidak berubah.**

## 6. Test dan hasil aktual (21 Oktober 2026, sandbox)

| Suite | Hasil |
|---|---|
| backend | 48/48 |
| ui (21 screen, tombol mati, overflow, teks < 11.5 px, target sentuh < 36 px) | 19/19 |
| features | 10/10 |
| sprint2 (responsif 360×800 / 360×740 / 390×844, tombol kembali) | 9/9 |
| pwa | 6/6 |
| v14 | 6/6 |
| **Gate anti-slop** `dev/taste-check.js` | **132 layar × 0 FAIL** |
| `checkInstall()` | lengkap |

Isi `v14.test.js`:
- Tema otomatis, terang, gelap; pilihan tersimpan dan terpasang sebelum App berjalan; struk tetap putih di tema gelap.
- KPI sejajar dan berukuran sama, termasuk saat angkanya ratusan juta, tanpa angka terpotong.
- Order dan Stok terbuka tanpa skeleton dalam < 400 ms dengan latensi server 600 ms.
- Data lama tampil, lalu bar penyegaran muncul, lalu transaksi baru dari perangkat lain ikut muncul.
- Kursor dan isi input bertahan saat layar dirender ulang.
- Keluar menghapus cache perangkat.

Detail gate: 22 layar × {terang, gelap} × {360×800, 390×844, 800×1280}. Yang diperiksa: gradien, bayangan elemen diam, glow, font selain Inter, emoji, kapital kecil, violet/indigo, kontras teks, overflow, serta kesejajaran, ukuran, dan pemotongan angka KPI. Gate sudah diuji balik: elemen pelanggar yang sengaja disisipkan tertangkap semua (7 aturan).

## 7. Belum terverifikasi

- **Font Inter yang benar-benar termuat.** Sandbox tidak bisa mengakses Google Fonts, jadi gate hanya memastikan semua elemen *meminta* Inter. Di HP yang online, Inter dimuat; sebelum selesai dimuat, sementara memakai font sistem.
- Mode gelap di HP asli (Samsung A12), termasuk transisi saat HP berganti tema.
- Kecepatan nyata di Apps Script. Angka di atas memakai latensi tiruan; pola keuntungannya sama, tetapi angka absolutnya bergantung pada Google.

## 8. Cara update

**Apps Script:**
1. Tempel `App.html`, `Styles.html`, `Index.html` (backend tidak berubah).
2. Deploy → Manage deployments → Edit → **New version**.

**PWA:** push ke GitHub; workflow akan membangun ulang otomatis.

**Rollback:** pilih versi deployment sebelumnya. Tidak ada perubahan data atau schema.
