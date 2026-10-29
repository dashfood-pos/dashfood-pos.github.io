/**
 * Media.gs — upload & pengelolaan gambar (foto produk/topping, logo toko, latar login, ikon channel/pembayaran).
 *
 * Penyimpanan: Google Drive pemilik skrip, folder khusus "Dash Food Media".
 * - ID folder disimpan di Script Properties (MEDIA_FOLDER_ID); dibuat otomatis saat upload pertama.
 * - Hanya FILE yang diunggah yang di-share "Anyone with the link: Viewer" agar bisa ditampilkan di <img>.
 *   Folder dan isi Drive lain TIDAK ikut dibagikan.
 * - Referensi permanen = file_id, dicatat di sheet MEDIA. Kolom image_url / setting hanya menyimpan URL tampilan.
 * - Gambar lama yang diganti/dihapus dipindah ke Trash Drive (bisa dipulihkan 30 hari) dan ditandai ARCHIVED.
 */

var MEDIA_PURPOSES = {
  PRODUCT: 'MANAGER', VARIANT: 'MANAGER', STORE_LOGO: 'ADMIN', LOGIN_BG: 'ADMIN', BRAND_ICON: 'ADMIN', RECEIPT_LOGO: 'ADMIN'
};
var MEDIA_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function mediaUrl_(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w2000';
}

/** Mengambil file_id dari URL media buatan aplikasi; null bila bukan. */
function mediaFileIdFromUrl_(url) {
  var m = String(url || '').match(/^https:\/\/drive\.google\.com\/thumbnail\?id=([\w-]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function uploadMaxBytes_() {
  var mb = toNumber(getSettingsMap_().upload_max_mb, 5);
  if (mb <= 0 || mb > 20) mb = 5;
  return Math.round(mb * 1024 * 1024);
}

function mediaFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MEDIA_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder terhapus → buat ulang */ }
  }
  var folder = DriveApp.createFolder('Dash Food Media');
  props.setProperty('MEDIA_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * payload: { purpose, ref_id, filename, mime_type, base64 }
 * Mengembalikan { media_id, file_id, url }. Belum mengubah produk/setting —
 * URL baru dipakai saat form disimpan (sehingga admin bisa membatalkan).
 */
function uploadImage(payload, user) {
  var purpose = requireEnum(payload.purpose, Object.keys(MEDIA_PURPOSES), 'Tujuan gambar');
  requireRole_(user, MEDIA_PURPOSES[purpose]);
  var mime = String(payload.mime_type || '').toLowerCase();
  if (MEDIA_MIME.indexOf(mime) === -1) fail('VALIDATION', 'Format file harus JPG, PNG, WebP, atau GIF.');
  var b64 = String(payload.base64 || '').replace(/^data:[^,]*,/, '');
  if (!b64) fail('VALIDATION', 'File kosong.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { fail('VALIDATION', 'Data file rusak.'); }
  var max = uploadMaxBytes_();
  if (bytes.length > max) fail('VALIDATION', 'Ukuran file melebihi batas ' + Math.round(max / 1048576) + ' MB.');
  if (!looksLikeImage_(bytes, mime)) fail('VALIDATION', 'Isi file bukan gambar yang valid.');

  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
  var safeName = optString(payload.filename, 80).replace(/[^\w.\- ]+/g, '_') || ('gambar.' + ext);
  var name = purpose + '_' + (optString(payload.ref_id, 40) || 'baru') + '_' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMMddHHmmss') + '_' + safeName;
  var file;
  try {
    file = mediaFolder_().createFile(Utilities.newBlob(bytes, mime, name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    fail('UPLOAD_FAILED', 'Gagal menyimpan ke Google Drive: ' + (e && e.message ? e.message : e) +
      '. Jika akun Google Workspace membatasi berbagi link publik, gunakan opsi URL gambar.');
  }
  var row = {
    media_id: newId('MED'), file_id: file.getId(), url: mediaUrl_(file.getId()), purpose: purpose,
    ref_id: optString(payload.ref_id, 60), mime_type: mime, size_bytes: bytes.length, original_name: safeName,
    status: 'ACTIVE', created_at: nowIso(), created_by: user.display_name, archived_at: ''
  };
  withLock(function () { Db.insert('MEDIA', row); });
  return { media_id: row.media_id, file_id: row.file_id, url: row.url, size_bytes: row.size_bytes };
}

/** Cek magic number agar file non-gambar yang diganti ekstensinya ditolak. */
function looksLikeImage_(bytes, mime) {
  function b(i) { return bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; }
  if (bytes.length < 12) return false;
  if (mime === 'image/jpeg') return b(0) === 0xFF && b(1) === 0xD8;
  if (mime === 'image/png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47;
  if (mime === 'image/gif') return b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46;
  if (mime === 'image/webp') return b(0) === 0x52 && b(1) === 0x49 && b(8) === 0x57 && b(9) === 0x45;
  return false;
}

/**
 * Dipanggil saat sebuah URL gambar diganti/dihapus. Hanya file buatan aplikasi (ada di sheet MEDIA)
 * yang dipindah ke Trash; URL eksternal diabaikan. Pemanggil harus sudah di dalam withLock.
 */
function archiveMediaUrl_(oldUrl, newUrl) {
  if (!oldUrl || oldUrl === newUrl) return false;
  var fileId = mediaFileIdFromUrl_(oldUrl);
  if (!fileId) return false;
  var row = Db.find('MEDIA', 'file_id', fileId);
  if (!row || row.status !== 'ACTIVE') return false;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* file sudah tidak ada */ }
  Db.update('MEDIA', row, { status: 'ARCHIVED', archived_at: nowIso() });
  return true;
}

/** Normalisasi URL gambar yang diketik admin. Link Google Drive "file/d/ID/view" diubah ke URL gambar langsung. */
function normalizeImageUrl_(v) {
  var s = optString(v, 500);
  if (!s) return '';
  var m = s.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  if (m) return mediaUrl_(m[1]);
  if (!/^https:\/\//i.test(s)) fail('VALIDATION', 'URL gambar harus diawali https://');
  if (/\s/.test(s)) fail('VALIDATION', 'URL gambar tidak boleh berisi spasi.');
  return s;
}

/**
 * Jalankan SEKALI dari editor (pilih authorizeMedia → Run) setelah menambahkan Media.gs:
 * memunculkan dialog izin Google Drive dan membuat folder "Dash Food Media".
 */
function authorizeMedia() {
  var f = mediaFolder_();
  var msg = 'Izin Drive aktif. Folder media: ' + f.getName() + ' (' + f.getId() + ')';
  Logger.log(msg);
  return msg;
}

/** Logo bawaan (PNG 128 px) untuk PDF/struk bila logo kustom tidak tersedia. */
var DEFAULT_LOGO_DATA_URL = 'data:image/png;base64,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';

/**
 * Mengembalikan data URL (base64) untuk logo struk, supaya bisa digambar ke canvas/PDF
 * tanpa masalah CORS. Hanya file yang tercatat di sheet MEDIA yang dilayani (bukan file Drive sembarang).
 */
function mediaDataUrl_(url) {
  var fileId = mediaFileIdFromUrl_(url);
  if (!fileId) return null;
  var row = Db.find('MEDIA', 'file_id', fileId);
  if (!row) return null;
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + (row.mime_type || blob.getContentType()) + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return null; }
}

function receiptLogo(payload) {
  var url = optString(payload && payload.url, 500);
  if (!url) return { data_url: DEFAULT_LOGO_DATA_URL, source: 'default' };
  var d = mediaDataUrl_(url);
  return d ? { data_url: d, source: 'media' } : { data_url: null, source: 'external' };
}
