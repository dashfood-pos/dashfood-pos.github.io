/**
 * Setup.gs — membuat/memperbarui struktur spreadsheet, admin awal, dan data demo.
 *
 * Fungsi yang dijalankan manual dari editor Apps Script:
 *   setupDashFood()        — aman dijalankan berulang (idempotent)
 *   setupInitialAdmin()    — membuat admin pertama dari Script Properties
 *   seedDemoData()         — HANYA untuk demo/test; menandai data_mode = DEMO
 *   setDataModeProduction()— menandai data sebagai produksi (tidak menghapus apa pun)
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Dash Food')
      .addItem('1. Setup / perbarui struktur sheet', 'setupDashFood')
      .addItem('2. Buat admin awal', 'setupInitialAdmin')
      .addSeparator()
      .addItem('Isi data DEMO (khusus uji coba)', 'seedDemoData')
      .addToUi();
  } catch (e) { /* bukan container-bound */ }
}

function setupDashFood() {
  var ss = Db.spreadsheet();
  var report = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var expected = SCHEMA[name];
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, expected.length).setValues([expected]);
      report.push('Sheet dibuat: ' + name);
    } else {
      var lastCol = Math.max(sh.getLastColumn(), 1);
      var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim(); });
      var missing = expected.filter(function (c) { return current.indexOf(c) === -1; });
      if (missing.length) {
        var startCol = current.filter(function (c) { return c !== ''; }).length === 0 ? 1 : lastCol + 1;
        sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
        report.push('Kolom ditambahkan di ' + name + ': ' + missing.join(', '));
      }
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    applyTextFormats_(sh);
  });
  Db.resetCache();

  // SETTINGS default (hanya key yang belum ada).
  var existing = indexBy(Db.all('SETTINGS'), 'setting_key');
  var now = nowIso();
  var newSettings = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!existing[k]) newSettings.push({ setting_key: k, setting_value: DEFAULT_SETTINGS[k], updated_at: now });
  });
  Db.insertMany('SETTINGS', newSettings);
  if (newSettings.length) report.push('Settings default ditambahkan: ' + newSettings.length);

  // Kategori bawaan hanya bila sheet kategori kosong.
  if (Db.all('CATEGORIES').length === 0) {
    Db.insertMany('CATEGORIES', DEFAULT_CATEGORIES.map(function (c) {
      return {
        category_id: newId('CAT'), category_name: c.name, category_type: c.type,
        is_active: true, created_at: now, updated_at: now
      };
    }));
    report.push('Kategori bawaan dibuat.');
  }
  var msg = report.length ? report.join('\n') : 'Struktur sudah lengkap. Tidak ada perubahan.';
  Logger.log(msg);
  return msg;
}

function applyTextFormats_(sh) {
  var lastCol = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  for (var c = 0; c < header.length; c++) {
    if (TEXT_COLUMNS.indexOf(String(header[c])) !== -1) {
      sh.getRange(2, c + 1, rows, 1).setNumberFormat('@');
    }
  }
}

/**
 * Membuat admin pertama. Isi dulu Script Properties:
 *   INIT_ADMIN_USERNAME, INIT_ADMIN_PASSWORD (min. 8 karakter), INIT_ADMIN_NAME (opsional)
 * Password dihapus dari properties setelah akun dibuat.
 */
function setupInitialAdmin() {
  var props = PropertiesService.getScriptProperties();
  var username = props.getProperty('INIT_ADMIN_USERNAME');
  var password = props.getProperty('INIT_ADMIN_PASSWORD');
  var name = props.getProperty('INIT_ADMIN_NAME') || 'Admin';
  if (!username || !password) {
    fail('SETUP', 'Isi Script Properties INIT_ADMIN_USERNAME dan INIT_ADMIN_PASSWORD terlebih dahulu.');
  }
  var admins = Db.filter('USERS', function (u) { return u.role === 'ADMIN' && u.is_active; });
  if (admins.length) {
    props.deleteProperty('INIT_ADMIN_PASSWORD');
    return 'Admin aktif sudah ada. Tidak ada akun baru dibuat.';
  }
  createUser_({ username: username, display_name: name, role: 'ADMIN', password: password });
  props.deleteProperty('INIT_ADMIN_PASSWORD');
  return 'Admin "' + username + '" dibuat. Password dihapus dari Script Properties.';
}

/**
 * Data DEMO sesuai PRD §7. Tidak menimpa data yang ada: hanya berjalan bila
 * belum ada produk. Menandai SETTINGS.data_mode = DEMO agar UI memberi label.
 */
function seedDemoData() {
  return withLock(function () {
    if (Db.all('PRODUCTS').length > 0) {
      return 'Produk sudah ada. Data demo tidak diisi agar data yang ada tidak tercampur.';
    }
    var now = nowIso();
    var today = todayStr();
    var cats = indexBy(Db.filter('CATEGORIES', function (c) { return c.category_type === 'PRODUCT'; }), 'category_name');
    function catId(n) { return cats[n] ? cats[n].category_id : ''; }

    var demoProducts = [
      { name: 'Banana Bites', cat: 'Cemilan', unit: 'pcs', desc: 'Cemilan pisang dengan berbagai pilihan topping.',
        prices: [10000, 11000, 13000, 13000, 13000], stock: 50, toppings: true },
      { name: 'Sago', cat: 'Dessert', unit: 'cup', desc: 'Dessert sago dingin.',
        prices: [15000, 16000, 18000, 18000, 18000], stock: 20, toppings: false },
      { name: 'Es Teler', cat: 'Minuman', unit: 'cup', desc: 'Es teler segar.',
        prices: [15000, 16000, 18000, 18000, 18000], stock: 15, toppings: false }
    ];
    var demoToppings = [
      { name: 'Oreo', prices: [2000, 2000, 2500, 2500, 2500] },
      { name: 'Cokelat', prices: [2000, 2000, 2500, 2500, 2500] },
      { name: 'Keju', prices: [2500, 2500, 3000, 3000, 3000] }
    ];

    var products = [], prices = [], stocks = [], variants = [], vprices = [], links = [];
    demoToppings.forEach(function (t) {
      var vid = newId('VAR');
      t.id = vid;
      variants.push({ variant_id: vid, variant_name: t.name, variant_type: 'TOPPING', unit: 'porsi',
        is_active: true, created_at: now, updated_at: now, image_url: '' });
      ENUMS.CHANNELS.forEach(function (ch, i) {
        vprices.push({ variant_price_id: newId('VPR'), variant_id: vid, channel: ch, additional_price: t.prices[i],
          is_active: true, created_at: now, updated_at: now });
      });
      stocks.push({ stock_id: newId('STK'), item_type: 'VARIANT', item_id: vid, quantity: 20, unit: 'porsi',
        minimum_stock: 5, updated_at: now });
    });
    demoProducts.forEach(function (p) {
      var pid = newId('PRD');
      products.push({ product_id: pid, product_name: p.name, category_id: catId(p.cat), base_unit: p.unit,
        is_active: true, created_at: now, updated_at: now, description: p.desc, image_url: '' });
      ENUMS.CHANNELS.forEach(function (ch, i) {
        prices.push({ price_id: newId('PRC'), product_id: pid, channel: ch, base_price: p.prices[i],
          effective_from: today, is_active: true, created_at: now, updated_at: now });
      });
      stocks.push({ stock_id: newId('STK'), item_type: 'PRODUCT', item_id: pid, quantity: p.stock, unit: p.unit,
        minimum_stock: 5, updated_at: now });
      if (p.toppings) {
        demoToppings.forEach(function (t) {
          links.push({ id: newId('PVL'), product_id: pid, variant_id: t.id, is_active: true, created_at: now });
        });
      }
    });
    Db.insertMany('VARIANTS', variants);
    Db.insertMany('VARIANT_PRICES', vprices);
    Db.insertMany('PRODUCTS', products);
    Db.insertMany('PRICES', prices);
    Db.insertMany('PRODUCT_VARIANTS', links);
    Db.insertMany('STOCKS', stocks);
    // Movement awal agar riwayat stok konsisten dengan saldo.
    Db.insertMany('STOCK_MOVEMENTS', stocks.map(function (s) {
      return { movement_id: newId('MOV'), item_type: s.item_type, item_id: s.item_id, movement_type: 'ADJUSTMENT_IN',
        quantity: s.quantity, reference_type: 'DEMO_SEED', reference_id: '', notes: 'Stok awal data demo',
        created_at: now, balance_after: s.quantity, created_by: 'system' };
    }));
    setSetting_('data_mode', 'DEMO');
    return 'Data DEMO dibuat: 3 produk, 3 topping. SETTINGS.data_mode = DEMO.';
  });
}

function setDataModeProduction() {
  setSetting_('data_mode', 'PRODUCTION');
  return 'data_mode = PRODUCTION. Pastikan harga & stok sudah diganti dengan data asli.';
}
