/**
 * Db.gs — lapisan akses Google Sheets.
 *
 * - Membaca seluruh sheet sekali per eksekusi (batch getValues) lalu di-cache.
 * - Kolom dipetakan berdasarkan nama header, bukan posisi.
 * - Penulisan memakai setValues per blok baris (batch), bukan per sel.
 */

var Db = (function () {
  var cache = {};
  var headerCache = {};
  var ssCache = null;
  // Sheet yang memengaruhi katalog kasir: setiap penulisan ke sini mengosongkan cache katalog server.
  var CATALOG_SHEETS = ['PRODUCTS', 'PRICES', 'VARIANTS', 'VARIANT_PRICES', 'PRODUCT_VARIANTS', 'STOCKS', 'CATEGORIES', 'SETTINGS'];
  function touched(name) {
    delete cache[name];
    if (CATALOG_SHEETS.indexOf(name) !== -1) invalidateCatalogCache_();
  }

  function spreadsheet() {
    if (ssCache) return ssCache;
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    ssCache = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ssCache) fail('SETUP_REQUIRED', 'Spreadsheet belum terhubung. Jalankan setupDashFood() terlebih dahulu.');
    return ssCache;
  }

  function sheet(name) {
    var sh = spreadsheet().getSheetByName(name);
    if (!sh) fail('SETUP_REQUIRED', 'Sheet ' + name + ' belum ada. Jalankan setupDashFood().');
    return sh;
  }

  function headers(name) {
    if (headerCache[name]) return headerCache[name];
    var sh = sheet(name);
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) fail('SETUP_REQUIRED', 'Header sheet ' + name + ' kosong.');
    var h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim(); });
    var expected = SCHEMA[name] || [];
    for (var i = 0; i < expected.length; i++) {
      if (h.indexOf(expected[i]) === -1) {
        fail('SCHEMA_MISMATCH', 'Kolom ' + expected[i] + ' tidak ditemukan di sheet ' + name +
          '. Jalankan setupDashFood() untuk menambahkan kolom yang kurang.');
      }
    }
    headerCache[name] = h;
    return h;
  }

  function readValue(col, v) {
    if (v instanceof Date) {
      if (/_date$|^effective_from$/.test(col)) return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
      if (col === 'order_time') return Utilities.formatDate(v, CONFIG.TZ, 'HH:mm');
      return Utilities.formatDate(v, CONFIG.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
    }
    if (BOOL_COLUMNS.indexOf(col) !== -1) return toBool(v);
    if (NUMBER_COLUMNS.indexOf(col) !== -1) return toNumber(v, 0);
    return v === null || v === undefined ? '' : String(v);
  }

  function writeValue(col, v) {
    if (BOOL_COLUMNS.indexOf(col) !== -1) return toBool(v);
    if (NUMBER_COLUMNS.indexOf(col) !== -1) return toNumber(v, 0);
    return v === null || v === undefined ? '' : String(v);
  }

  function all(name) {
    if (cache[name]) return cache[name];
    var sh = sheet(name);
    var h = headers(name);
    var lastRow = sh.getLastRow();
    var rows = [];
    if (lastRow >= 2) {
      var values = sh.getRange(2, 1, lastRow - 1, h.length).getValues();
      for (var r = 0; r < values.length; r++) {
        var row = values[r];
        var empty = true;
        for (var c = 0; c < row.length; c++) { if (row[c] !== '' && row[c] !== null) { empty = false; break; } }
        if (empty) continue;
        var o = { _row: r + 2 };
        for (var k = 0; k < h.length; k++) if (h[k]) o[h[k]] = readValue(h[k], row[k]);
        rows.push(o);
      }
    }
    cache[name] = rows;
    return rows;
  }

  function toRow(name, obj) {
    var h = headers(name);
    return h.map(function (col) { return col ? writeValue(col, obj[col]) : ''; });
  }

  function insertMany(name, objs) {
    if (!objs || !objs.length) return [];
    var sh = sheet(name);
    var h = headers(name);
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var values = objs.map(function (o) { return toRow(name, o); });
    sh.getRange(start, 1, values.length, h.length).setValues(values);
    touched(name);
    return objs;
  }

  function insert(name, obj) {
    insertMany(name, [obj]);
    return obj;
  }

  /** Menulis ulang satu baris berdasarkan objek yang sudah dibaca (punya _row). */
  function update(name, current, patch) {
    if (!current || !current._row) fail('INTERNAL', 'Baris tidak valid untuk update ' + name);
    var merged = {};
    var k;
    for (k in current) if (current.hasOwnProperty(k)) merged[k] = current[k];
    for (k in patch) if (patch.hasOwnProperty(k)) merged[k] = patch[k];
    var h = headers(name);
    sheet(name).getRange(current._row, 1, 1, h.length).setValues([toRow(name, merged)]);
    touched(name);
    return merged;
  }

  /** Update banyak baris; baris berurutan digabung menjadi satu setValues. */
  function updateMany(name, pairs) {
    if (!pairs.length) return;
    var h = headers(name);
    var sh = sheet(name);
    var rows = pairs.map(function (p) {
      var merged = {}, k;
      for (k in p.current) if (p.current.hasOwnProperty(k)) merged[k] = p.current[k];
      for (k in p.patch) if (p.patch.hasOwnProperty(k)) merged[k] = p.patch[k];
      return { row: p.current._row, values: toRow(name, merged) };
    }).sort(function (a, b) { return a.row - b.row; });
    var i = 0;
    while (i < rows.length) {
      var j = i;
      while (j + 1 < rows.length && rows[j + 1].row === rows[j].row + 1) j++;
      var block = rows.slice(i, j + 1).map(function (x) { return x.values; });
      sh.getRange(rows[i].row, 1, block.length, h.length).setValues(block);
      i = j + 1;
    }
    touched(name);
  }

  function find(name, key, value) {
    var rows = all(name);
    for (var i = 0; i < rows.length; i++) if (rows[i][key] === value) return rows[i];
    return null;
  }

  function filter(name, fn) {
    return all(name).filter(fn);
  }

  function resetCache() {
    cache = {};
    headerCache = {};
  }

  function resetConnection() {
    resetCache();
    ssCache = null;
  }

  return {
    spreadsheet: spreadsheet, sheet: sheet, headers: headers, all: all, insert: insert, insertMany: insertMany,
    update: update, updateMany: updateMany, find: find, filter: filter, resetCache: resetCache,
    resetConnection: resetConnection
  };
})();

/** Strip properti internal sebelum dikirim ke client. */
function clean(o) {
  if (!o) return o;
  var r = {};
  for (var k in o) if (o.hasOwnProperty(k) && k.charAt(0) !== '_') r[k] = o[k];
  return r;
}

/* ---------- Cache katalog (CacheService, 5 menit) ----------
 * Hanya untuk TAMPILAN katalog. createOrder/recordPayment selalu membaca sheet langsung,
 * sehingga harga & stok checkout tidak pernah berasal dari cache. */
var CATALOG_CACHE_KEY = 'catalog_v2';
function invalidateCatalogCache_() {
  try { CacheService.getScriptCache().remove(CATALOG_CACHE_KEY); } catch (e) { /* no-op */ }
}
function cachedCatalog_(build) {
  var c = null;
  try { c = CacheService.getScriptCache(); var hit = c.get(CATALOG_CACHE_KEY); if (hit) { var o = JSON.parse(hit); o.cache = 'hit'; return o; } } catch (e) { c = null; }
  var fresh = build();
  try { if (c) c.put(CATALOG_CACHE_KEY, JSON.stringify(fresh), 300); } catch (e) { /* >100KB: lewati cache */ }
  fresh.cache = 'miss';
  return fresh;
}
