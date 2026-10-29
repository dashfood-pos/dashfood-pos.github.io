/**
 * Utils.gs — helper umum: error, tanggal, ID, angka, lock, hashing.
 */

/** Error bisnis yang aman ditampilkan ke pengguna. */
function AppError(code, message, details) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.details = details || null;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

function fail(code, message, details) {
  throw new AppError(code, message, details);
}

/* ---------- Tanggal & waktu (Asia/Makassar) ---------- */

function nowIso() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayStr() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
}

function nowTimeStr() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'HH:mm');
}

function compactDate(dateStr) {
  return String(dateStr).replace(/-/g, '');
}

function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  var p = String(s).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
}

/** Tambah n hari pada string yyyy-MM-dd (aman dari zona waktu). */
function addDays(dateStr, n) {
  var p = String(dateStr).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function daysBetween(a, b) {
  var pa = String(a).split('-'), pb = String(b).split('-');
  var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
  var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
  return Math.round((db - da) / 86400000);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/**
 * Menerjemahkan filter periode menjadi rentang tanggal inklusif.
 * period: today | yesterday | 7d | 30d | month | last_month | custom
 */
function resolvePeriod(payload) {
  payload = payload || {};
  var period = payload.period || 'today';
  var today = todayStr();
  var from, to, label;
  switch (period) {
    case 'today': from = to = today; label = 'Hari ini'; break;
    case 'yesterday': from = to = addDays(today, -1); label = 'Kemarin'; break;
    case '7d': from = addDays(today, -6); to = today; label = '7 hari terakhir'; break;
    case '30d': from = addDays(today, -29); to = today; label = '30 hari terakhir'; break;
    case 'month': from = today.substring(0, 8) + '01'; to = today; label = 'Bulan ini'; break;
    case 'last_month': {
      var firstThis = today.substring(0, 8) + '01';
      to = addDays(firstThis, -1);
      from = to.substring(0, 8) + '01';
      label = 'Bulan lalu';
      break;
    }
    case 'custom':
      if (!isValidDateStr(payload.date_from) || !isValidDateStr(payload.date_to)) {
        fail('INVALID_PERIOD', 'Rentang tanggal tidak valid.');
      }
      from = payload.date_from; to = payload.date_to;
      if (from > to) fail('INVALID_PERIOD', 'Tanggal awal harus sebelum tanggal akhir.');
      label = from + ' s.d. ' + to;
      break;
    default:
      fail('INVALID_PERIOD', 'Periode tidak dikenal: ' + period);
  }
  var len = daysBetween(from, to) + 1;
  return {
    period: period, from: from, to: to, label: label, days: len,
    prev_from: addDays(from, -len), prev_to: addDays(from, -1)
  };
}

/* ---------- ID ---------- */

function newId(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

/* ---------- Angka & validasi ---------- */

function toNumber(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback === undefined ? 0 : fallback;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function toBool(v) {
  if (v === true || v === false) return v;
  var s = String(v).toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YA' || s === 'Y';
}

function requireString(v, field, maxLen) {
  var s = (v === null || v === undefined) ? '' : String(v).trim();
  if (!s) fail('VALIDATION', field + ' wajib diisi.');
  if (maxLen && s.length > maxLen) fail('VALIDATION', field + ' maksimal ' + maxLen + ' karakter.');
  return s;
}

function optString(v, maxLen) {
  var s = (v === null || v === undefined) ? '' : String(v).trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen);
  return s;
}

function requireNonNegInt(v, field) {
  var n = Number(v);
  if (!isFinite(n) || n < 0 || Math.floor(n) !== n) fail('VALIDATION', field + ' harus bilangan bulat ≥ 0.');
  return n;
}

function requirePosInt(v, field) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) fail('VALIDATION', field + ' harus bilangan bulat > 0.');
  return n;
}

function requireEnum(v, list, field) {
  if (list.indexOf(v) === -1) fail('VALIDATION', field + ' tidak valid.');
  return v;
}

function formatRupiah(n) {
  var v = Math.round(toNumber(n));
  var neg = v < 0;
  var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + 'Rp ' + s;
}

function indexBy(rows, key) {
  var m = {};
  for (var i = 0; i < rows.length; i++) m[rows[i][key]] = rows[i];
  return m;
}

function groupBy(rows, key) {
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i][key];
    (m[k] = m[k] || []).push(rows[i]);
  }
  return m;
}

/* ---------- Lock ---------- */

/**
 * Menjalankan fn di bawah script lock. Semua operasi yang mengubah uang/stok
 * wajib lewat sini agar dua kasir tidak menulis bersamaan.
 */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(CONFIG.LOCK_WAIT_MS);
  } catch (e) {
    fail('BUSY', 'Sistem sedang memproses transaksi lain. Coba lagi beberapa detik.');
  }
  try {
    Db.resetCache();
    return fn();
  } finally {
    try { SpreadsheetApp.flush(); } catch (e2) { /* no-op */ }
    lock.releaseLock();
  }
}

/* ---------- Hashing ---------- */

function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function sha256Hex(text) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function hashPassword(password, salt) {
  var h = salt + ':' + password;
  for (var i = 0; i < CONFIG.PASSWORD_ITERATIONS; i++) h = sha256Hex(h + ':' + salt);
  return h;
}

/** Perbandingan waktu-konstan sederhana. */
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function randomToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}
