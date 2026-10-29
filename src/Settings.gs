/**
 * Settings.gs — pengaturan toko, channel, metode pembayaran, struk, backup.
 */

function getSettingsMap_() {
  var map = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { map[k] = DEFAULT_SETTINGS[k]; });
  Db.all('SETTINGS').forEach(function (r) { map[r.setting_key] = r.setting_value; });
  return map;
}

function setSetting_(key, value) {
  var cur = Db.find('SETTINGS', 'setting_key', key);
  var now = nowIso();
  if (cur) Db.update('SETTINGS', cur, { setting_value: String(value), updated_at: now });
  else Db.insert('SETTINGS', { setting_key: key, setting_value: String(value), updated_at: now });
}

function enabledList_(csv, all) {
  var list = String(csv || '').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return all.indexOf(s) !== -1; });
  return all.filter(function (x) { return list.indexOf(x) !== -1; }); // urutan kanonik
}

/** Info non-rahasia untuk layar login (sebelum autentikasi). */
function publicInfo() {
  var s = getSettingsMap_();
  return {
    store_name: s.store_name, store_tagline: s.store_tagline, store_logo_url: s.store_logo_url,
    login_background_url: s.login_background_url, data_mode: s.data_mode,
    has_users: Db.all('USERS').length > 0
  };
}

function settings() {
  var s = getSettingsMap_();
  var brandLogos = {};
  Object.keys(s).forEach(function (k) {
    if (k.indexOf('brand_logo_') === 0) brandLogos[k.substring(11)] = s[k];
  });
  return {
    store: {
      store_name: s.store_name, store_tagline: s.store_tagline, store_address: s.store_address,
      store_phone: s.store_phone, store_logo_url: s.store_logo_url, login_background_url: s.login_background_url
    },
    // Logo struk terpisah dari logo login. Kosong = mengikuti logo login, lalu logo bawaan.
    receipt: { receipt_footer: s.receipt_footer, receipt_show_logo: toBool(s.receipt_show_logo),
      receipt_logo_url: s.receipt_logo_url, receipt_logo_effective: s.receipt_logo_url || s.store_logo_url || '' },
    allow_discount: toBool(s.allow_discount),
    data_mode: s.data_mode,
    channels_enabled: enabledList_(s.channels_enabled, ENUMS.CHANNELS),
    payment_methods_enabled: enabledList_(s.payment_methods_enabled, ENUMS.PAYMENT_METHODS),
    brand_logos: brandLogos,
    upload_max_mb: toNumber(s.upload_max_mb, 5),
    last_backup_at: s.last_backup_at,
    last_backup_url: s.last_backup_url
  };
}

var EDITABLE_SETTINGS_ = [
  'store_name', 'store_tagline', 'store_address', 'store_phone', 'store_logo_url', 'login_background_url', 'receipt_logo_url',
  'receipt_footer', 'receipt_show_logo', 'allow_discount', 'channels_enabled', 'payment_methods_enabled',
  'upload_max_mb', 'brand_logo_OFFLINE', 'brand_logo_CASH', 'brand_logo_BANK_TRANSFER', 'brand_logo_WHATSAPP', 'brand_logo_GOFOOD', 'brand_logo_GRABFOOD', 'brand_logo_SHOPEEFOOD',
  'brand_logo_DANA', 'brand_logo_SHOPEEPAY', 'brand_logo_QRIS', 'brand_logo_BANK_TRANSFER'
];

function saveSettings(payload) {
  return withLock(function () {
    var values = (payload && payload.values) || {};
    var keys = Object.keys(values);
    if (!keys.length) fail('VALIDATION', 'Tidak ada perubahan untuk disimpan.');
    keys.forEach(function (k) {
      if (EDITABLE_SETTINGS_.indexOf(k) === -1) fail('VALIDATION', 'Pengaturan "' + k + '" tidak dapat diubah.');
    });
    if (values.store_name !== undefined) requireString(values.store_name, 'Nama toko', 60);
    if (values.channels_enabled !== undefined) {
      if (!enabledList_(values.channels_enabled, ENUMS.CHANNELS).length) fail('VALIDATION', 'Minimal satu channel aktif.');
    }
    if (values.payment_methods_enabled !== undefined) {
      if (!enabledList_(values.payment_methods_enabled, ENUMS.PAYMENT_METHODS).length) {
        fail('VALIDATION', 'Minimal satu metode pembayaran aktif.');
      }
    }
    if (values.upload_max_mb !== undefined) {
      var mb = Number(values.upload_max_mb);
      if (!isFinite(mb) || mb < 1 || mb > 20) fail('VALIDATION', 'Batas ukuran upload harus 1–20 MB.');
    }
    var current = getSettingsMap_();
    var normalized = {};
    keys.forEach(function (k) {
      normalized[k] = /_url$|^brand_logo_/.test(k) ? normalizeImageUrl_(values[k]) : optString(values[k], 500);
    });
    keys.forEach(function (k) {
      // Logo struk lama TIDAK diarsipkan: order lama menyimpan snapshot URL-nya agar struk historis tetap utuh.
      if (/_url$|^brand_logo_/.test(k) && k !== 'receipt_logo_url') archiveMediaUrl_(current[k], normalized[k]);
      setSetting_(k, normalized[k]);
    });
    return settings();
  });
}

/**
 * Backup: membuat spreadsheet baru berisi salinan semua sheet Dash Food.
 * Hanya memakai SpreadsheetApp (tidak butuh scope Drive penuh).
 */
function backup() {
  var src = Db.spreadsheet();
  var stamp = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMMdd-HHmm');
  var dest = SpreadsheetApp.create('Backup Dash Food ' + stamp);
  var firstSheet = dest.getSheets()[0];
  Object.keys(SCHEMA).forEach(function (name) {
    if (name === 'USERS') return; // hash password tidak ikut dibackup
    var sh = src.getSheetByName(name);
    if (sh) sh.copyTo(dest).setName(name);
  });
  if (dest.getSheets().length > 1) dest.deleteSheet(firstSheet);
  var url = dest.getUrl();
  withLock(function () {
    setSetting_('last_backup_at', nowIso());
    setSetting_('last_backup_url', url);
  });
  return { url: url, created_at: nowIso(), note: 'Sheet USERS tidak ikut dibackup karena berisi hash password.' };
}

/** Menandai status data (DEMO/PRODUCTION). Tidak menghapus data apa pun. */
function setDataMode(payload) {
  var mode = requireEnum(payload.mode, ['DEMO', 'PRODUCTION'], 'Mode data');
  return withLock(function () { setSetting_('data_mode', mode); return settings(); });
}
