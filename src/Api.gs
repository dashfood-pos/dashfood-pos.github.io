/**
 * Api.gs — entry point web app & router API.
 *
 * Kontrak:
 *   google.script.run.api(action, payload, token)
 *   → { ok: true, data: ... }  atau  { ok: false, error: { code, message, details } }
 * Fungsi ini tidak pernah melempar error ke client; semua error dibungkus.
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  // Info publik (nama toko, logo login) disisipkan ke HTML → layar login tampil tanpa menunggu panggilan API.
  try { t.bootPublic = safeJsonForHtml_(publicInfo()); } catch (e) { t.bootPublic = 'null'; }
  return t.evaluate()
    .setTitle('Dash Food POS')
    // PENTING: <meta viewport> di dalam HTML diabaikan di iframe HtmlService.
    // Tanpa addMetaTag ini, Android merender halaman sebagai layout desktop ±980px.
    // interactive-widget=resizes-content: saat keyboard HP muncul, layout ikut mengecil sehingga form/sheet tetap terlihat.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content')
    // Sengaja HANYA viewport: HtmlService menolak banyak nama meta (mis. 'theme-color') dengan exception.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Endpoint JSON untuk aplikasi PWA (GitHub Pages). Kontrak sama dengan google.script.run.api:
 *   POST body (text/plain) = {"action": "...", "payload": {...}, "token": "..."}
 *   → {"ok": true, "data": ...} atau {"ok": false, "error": {...}}
 * Body dikirim sebagai text/plain agar browser tidak mengirim preflight OPTIONS (tidak didukung Apps Script).
 * Syarat deployment: Execute as "Me", Who has access "Anyone" — sama seperti versi web app biasa.
 * Token sesi ada di body (bukan cookie), jadi tidak ada kredensial ambient yang bisa dipakai CSRF.
 */
function doPost(e) {
  var res;
  try {
    var raw = e && e.postData ? e.postData.contents : '';
    if (!raw || raw.length > 15 * 1024 * 1024) fail('VALIDATION', 'Permintaan kosong atau terlalu besar.');
    var body;
    try { body = JSON.parse(raw); } catch (x) { fail('VALIDATION', 'Format permintaan tidak valid.'); }
    if (!body || typeof body.action !== 'string') fail('VALIDATION', 'Aksi tidak ada.');
    res = api(body.action, body.payload && typeof body.payload === 'object' ? body.payload : {}, typeof body.token === 'string' ? body.token : null);
  } catch (err) {
    res = { ok: false, error: { code: err && err.code ? err.code : 'VALIDATION', message: err && err.message ? err.message : 'Permintaan tidak valid.', details: null } };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/** Dipakai template: <?!= include('Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Map dibangun saat dipanggil (bukan saat file dimuat) karena Apps Script mengeksekusi
 * file .gs berurutan; referensi langsung ke fungsi di file lain bisa masih undefined.
 */
function apiHandlers_() {
  return {
  ping: function () { return { pong: true, server_time: nowIso() }; },
  publicInfo: function () { return publicInfo(); },
  login: function (p) { return login(p); },
  session: function (p, u) {
    return { user: publicUser_(u), settings: settings(), enums: ENUMS, labels: LABELS, server_time: nowIso(),
      today: todayStr() };
  },
  logout: function (p, u, t) { return logout(p, u, t); },
  changePassword: function (p, u, t) { return changePassword(p, u, t); },
  catalog: function (p, u, t) { return catalog(p, u, t); },
  stock: function (p, u, t) { return stock(p, u, t); },
  stockMovements: function (p, u, t) { return stockMovements(p, u, t); },
  createOrder: function (p, u, t) { return createOrder(p, u, t); },
  recordPayment: function (p, u, t) { return recordPayment(p, u, t); },
  cancelOrder: function (p, u, t) { return cancelOrder(p, u, t); },
  orders: function (p, u, t) { return orders(p, u, t); },
  orderDetail: function (p, u, t) { return orderDetail(p, u, t); },
  receiptPdf: function (p, u, t) { return receiptPdf(p, u, t); },
  dashboard: function (p, u, t) { return dashboard(p, u, t); },
  products: function () { return products(); },
  saveProduct: function (p, u, t) { return saveProduct(p, u, t); },
  setProductActive: function (p, u, t) { return setProductActive(p, u, t); },
  variants: function () { return variants(); },
  saveVariant: function (p, u, t) { return saveVariant(p, u, t); },
  setVariantActive: function (p, u, t) { return setVariantActive(p, u, t); },
  prices: function (p, u, t) { return prices(p, u, t); },
  savePrices: function (p, u, t) { return savePrices(p, u, t); },
  saveVariantPrices: function (p, u, t) { return saveVariantPrices(p, u, t); },
  categories: function (p, u, t) { return categories(p, u, t); },
  saveCategory: function (p, u, t) { return saveCategory(p, u, t); },
  setCategoryActive: function (p, u, t) { return setCategoryActive(p, u, t); },
  adjustStock: function (p, u, t) { return adjustStock(p, u, t); },
  updateStockSettings: function (p, u, t) { return updateStockSettings(p, u, t); },
  recordProduction: function (p, u, t) { return recordProduction(p, u, t); },
  productions: function (p, u, t) { return productions(p, u, t); },
  expenses: function (p, u, t) { return expenses(p, u, t); },
  saveExpense: function (p, u, t) { return saveExpense(p, u, t); },
  reportSales: function (p, u, t) { return reportSales(p, u, t); },
  reportProducts: function (p, u, t) { return reportProducts(p, u, t); },
  reportFinance: function (p, u, t) { return reportFinance(p, u, t); },
  settings: function () { return settings(); },
  saveSettings: function (p, u, t) { return saveSettings(p, u, t); },
  users: function () { return users(); },
  saveUser: function (p, u, t) { return saveUser(p, u, t); },
  resetPassword: function (p, u, t) { return resetPassword(p, u, t); },
  setUserActive: function (p, u, t) { return setUserActive(p, u, t); },
  backup: function () { return backup(); },
  uploadImage: function (p, u, t) { return uploadImage(p, u, t); },
  setDataMode: function (p, u, t) { return setDataMode(p, u, t); },
  updateOrder: function (p, u, t) { return updateOrder(p, u, t); },
  receiptLogo: function (p, u, t) { return receiptLogo(p, u, t); },
  bootstrap: function (p, u, t) { return bootstrap_(p); }
  };
}

/**
 * Jalankan dari editor (pilih checkInstall → Run) untuk mengecek semua file .gs sudah ada.
 * Hasil di log eksekusi: daftar fungsi yang hilang beserta file asalnya.
 */
function checkInstall() {
  var need = {
    'Config.gs': ['CONFIG', 'SCHEMA', 'ACTION_ROLES'], 'Utils.gs': ['fail', 'withLock', 'nowIso'], 'Db.gs': ['Db'],
    'Setup.gs': ['setupDashFood', 'setupInitialAdmin'], 'Auth.gs': ['login', 'logout', 'authenticate_'],
    'Settings.gs': ['settings', 'publicInfo'], 'Products.gs': ['catalog', 'saveProduct'],
    'Inventory.gs': ['stock', 'recordProduction'], 'Orders.gs': ['createOrder', 'orders', 'updateOrder', 'logOrderEvent_'],
    'Payments.gs': ['recordPayment'], 'Expenses.gs': ['expenses'], 'Reports.gs': ['dashboard'], 'Media.gs': ['uploadImage', 'receiptLogo'], 'Api.gs': ['api', 'doGet', 'bootstrap_']
  };
  var g = this, missing = [];
  Object.keys(need).forEach(function (file) {
    need[file].forEach(function (fn) { if (typeof g[fn] === 'undefined') missing.push(file + ' → ' + fn); });
  });
  var msg = missing.length ? 'BELUM LENGKAP. Hilang: ' + missing.join(', ') : 'Semua file .gs lengkap.';
  Logger.log(msg);
  return msg;
}

function api(action, payload, token) {
  try {
    Db.resetCache();
    var handler = apiHandlers_()[action];
    var minRole = ACTION_ROLES[action];
    if (!handler || !minRole) fail('UNKNOWN_ACTION', 'Aksi tidak dikenal: ' + action);
    payload = payload || {};
    var user = null;
    if (minRole !== 'PUBLIC') {
      user = authenticate_(token);
      requireRole_(user, minRole);
    }
    var data = handler(payload, user, token);
    return { ok: true, data: data };
  } catch (e) {
    if (e instanceof AppError || (e && e.name === 'AppError')) {
      return { ok: false, error: { code: e.code, message: e.message, details: e.details || null } };
    }
    // Error tak terduga: log detail di server, kirim pesan umum + ringkas ke client.
    try { console.error('[api:' + action + ']', e && e.stack ? e.stack : e); } catch (x) { /* no-op */ }
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Terjadi kesalahan di server: ' + (e && e.message ? e.message : String(e)), details: null }
    };
  }
}

/** JSON aman untuk disisipkan dalam <script> (mencegah penutupan tag lebih awal). */
function safeJsonForHtml_(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Satu panggilan saat aplikasi dibuka: info publik + sesi + katalog + dashboard hari ini.
 * Menggantikan 4 panggilan berurutan (publicInfo → session → dashboard, catalog) dan
 * berbagi cache baca sheet dalam satu eksekusi.
 */
function bootstrap_(payload) {
  var out = { pub: publicInfo(), session: null, catalog: null, dashboard: null };
  var user;
  try { user = authenticate_(payload && payload.token); } catch (e) { return out; }
  out.session = { user: publicUser_(user), settings: settings(), enums: ENUMS, labels: LABELS, server_time: nowIso(), today: todayStr() };
  try { out.catalog = catalog(); } catch (e) { out.catalog_error = e.message; }
  try { out.dashboard = dashboard({ period: 'today' }); } catch (e) { out.dashboard_error = e.message; }
  return out;
}
