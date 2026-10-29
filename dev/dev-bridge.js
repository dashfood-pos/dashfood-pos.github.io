/**
 * dev-bridge.js — menghubungkan UI ke backend .gs asli yang berjalan di browser (di atas gas-mock).
 * Dipakai HANYA oleh dev harness (dev/dist/index.html). Tidak ikut deploy.
 *
 * Query string:
 *   ?reset=1     — buang data tersimpan dan buat ulang data demo
 *   ?latency=ms  — latensi buatan google.script.run (default 120)
 *   ?empty=1     — tanpa data demo (hanya setup + admin)
 */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var LATENCY = parseInt(qs.get('latency') || '120', 10);
  var KEY = 'df_mock_db_v1';
  var GAS = window.__GAS;

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function hasDate(v) {
    if (v instanceof Date) return true;
    if (v && typeof v === 'object') return Object.keys(v).some(function (k) { return hasDate(v[k]); });
    return false;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(GAS.mock.snapshot())); } catch (e) { /* kuota */ } }

  function runner(onOk, onFail) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return runner(fn, onFail); };
        if (prop === 'withFailureHandler') return function (fn) { return runner(onOk, fn); };
        if (prop === 'withUserObject') return function () { return runner(onOk, onFail); };
        return function () {
          var args = Array.prototype.slice.call(arguments).map(clone);
          (window.__apiLog = window.__apiLog || []).push({ fn: prop, action: args[0], t: Math.round(performance.now()) });
          setTimeout(function () {
            var fn = GAS.fns[prop];
            if (!fn) { if (onFail) onFail(new Error('Script function not found: ' + prop)); return; }
            try {
              var r = fn.apply(null, args);
              if (hasDate(r)) console.warn('[dev] return value berisi Date — di Apps Script nilai ini menjadi null:', prop);
              persist();
              if (onOk) onOk(clone(r));
            } catch (e) { if (onFail) onFail(e); }
          }, LATENCY);
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };

  /* ---------- data awal ---------- */
  function bootstrap(withDemo) {
    var f = GAS.fns;
    f.setupDashFood();
    var props = GAS.mock.globals.PropertiesService.getScriptProperties();
    props.setProperty('INIT_ADMIN_USERNAME', 'admin');
    props.setProperty('INIT_ADMIN_PASSWORD', 'admin123');
    props.setProperty('INIT_ADMIN_NAME', 'Admin');
    f.setupInitialAdmin();
    if (!withDemo) return;
    var DAY = 86400000, now = Date.now();
    GAS.setClock(now - 8 * DAY);
    f.seedDemoData();
    GAS.setClock(null);
    var tok = f.api('login', { username: 'admin', password: 'admin123' }).data.token;
    function A(action, payload) {
      var r = f.api(action, payload, tok);
      if (!r.ok) throw new Error(action + ': ' + r.error.message);
      return r.data;
    }
    A('saveUser', { username: 'manager', display_name: 'Rina', role: 'MANAGER', password: 'manager123' });
    A('saveUser', { username: 'kasir', display_name: 'Budi', role: 'STAFF', password: 'kasir123' });
    var cat = A('catalog');
    var id = {};
    cat.products.forEach(function (p) { id[p.product_name] = p.product_id; });
    Object.keys(cat.variants).forEach(function (k) { id[cat.variants[k].variant_name] = k; });
    // Satu URL gambar sengaja rusak untuk menguji fallback.
    var es = GAS.Db.find('PRODUCTS', 'product_id', id['Es Teler']);
    GAS.Db.update('PRODUCTS', es, { image_url: 'https://invalid.example.test/es-teler.jpg' });

    var seed = 7;
    function rnd(n) { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); }
    var chans = ['OFFLINE', 'OFFLINE', 'WHATSAPP', 'GOFOOD', 'GRABFOOD', 'SHOPEEFOOD', 'OFFLINE'];
    var methods = { OFFLINE: ['CASH', 'CASH', 'QRIS', 'DANA'], WHATSAPP: ['BANK_TRANSFER', 'DANA', 'SHOPEEPAY'], GOFOOD: ['QRIS'], GRABFOOD: ['QRIS'], SHOPEEFOOD: ['SHOPEEPAY'] };
    var tops = [[], [id.Oreo], [id.Keju], [id.Cokelat], [id.Oreo, id.Keju]];
    for (var d = 6; d >= 0; d--) {
      var base = now - d * DAY;
      GAS.setClock(base - 4 * 3600000);
      A('recordProduction', { product_id: id['Banana Bites'], quantity: 30, production_date: GAS.fns.todayStr(), notes: 'Batch pagi' });
      A('recordProduction', { product_id: id.Sago, quantity: 8, production_date: GAS.fns.todayStr(), notes: '' });
      A('recordProduction', { product_id: id['Es Teler'], quantity: 6, production_date: GAS.fns.todayStr(), notes: '' });
      ['Oreo', 'Cokelat', 'Keju'].forEach(function (t) {
        A('adjustStock', { item_type: 'VARIANT', item_id: id[t], direction: 'IN', quantity: 10, notes: 'Siapkan topping harian' });
      });
      var count = 4 + rnd(4);
      for (var i = 0; i < count; i++) {
        GAS.setClock(base - (count - i) * 40 * 60000);
        var ch = chans[rnd(chans.length)];
        var items = [{ product_id: id['Banana Bites'], quantity: 1 + rnd(3), variant_ids: tops[rnd(tops.length)] }];
        if (rnd(3) === 0) items.push({ product_id: id.Sago, quantity: 1 });
        if (rnd(4) === 0) items.push({ product_id: id['Es Teler'], quantity: 1 });
        var o = A('createOrder', { channel: ch, items: items, external_order_id: ch === 'OFFLINE' || ch === 'WHATSAPP' ? '' : 'F-' + (100000 + rnd(899999)) });
        var m = methods[ch][rnd(methods[ch].length)];
        A('recordPayment', { order_id: o.order_id, payment_method: m, received_amount: Math.ceil(o.total / 50000) * 50000 });
      }
      if (d % 2 === 0) A('saveExpense', { expense_date: GAS.fns.todayStr(), category: ['Bahan', 'Topping', 'Packaging', 'Gas'][rnd(4)], description: ['Pisang', 'Oreo', 'Kotak kemasan', 'Gas 3 kg'][rnd(4)], amount: 20000 + rnd(6) * 5000, payment_method: 'CASH' });
    }
    GAS.setClock(null);
    // Satu order dibatalkan setelah bayar & satu draft untuk riwayat.
    var c = A('createOrder', { channel: 'OFFLINE', items: [{ product_id: id.Sago, quantity: 1 }] });
    A('recordPayment', { order_id: c.order_id, payment_method: 'CASH', received_amount: 20000 });
    A('cancelOrder', { order_id: c.order_id, reason: 'Salah input jumlah', confirm_order_number: c.order_number });
    A('createOrder', { channel: 'WHATSAPP', items: [{ product_id: id['Es Teler'], quantity: 2 }], notes: 'PO antar sore' });
    f.api('logout', {}, tok);
  }

  var saved = null;
  if (!qs.get('reset') && !qs.get('empty')) { try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; } }
  if (saved) GAS.mock.restore(saved);
  else {
    try { localStorage.removeItem(KEY); localStorage.removeItem('df_token'); localStorage.removeItem('df_cart'); } catch (e) { /* no-op */ }
    bootstrap(!qs.get('empty'));
    persist();
  }
  // Meniru doGet: info publik tersedia di HTML tanpa round-trip.
  try { window.__BOOT_PUBLIC = GAS.fns.api('publicInfo', {}, null).data; } catch (e) { window.__BOOT_PUBLIC = null; }
  window.__devPersist = persist;
  window.__devReset = function () { localStorage.removeItem(KEY); location.search = '?reset=1'; };
})();
