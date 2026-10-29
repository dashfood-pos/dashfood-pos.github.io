/**
 * Test backend Dash Food (PRD §13) di atas runtime tiruan Apps Script.
 * Jalankan: node --test tests/
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('crypto');
const { loadGas, callApi } = require('../dev/load-gas');

const ADMIN = { username: 'admin', password: 'rahasia123' };

function boot({ demo = true, seedDaysAgo = 0 } = {}) {
  const ctx = loadGas();
  if (seedDaysAgo) ctx.__setClock(Date.now() - seedDaysAgo * 86400000);
  const props = ctx.PropertiesService.getScriptProperties();
  props.setProperty('INIT_ADMIN_USERNAME', ADMIN.username);
  props.setProperty('INIT_ADMIN_PASSWORD', ADMIN.password);
  ctx.setupInitialAdmin();
  if (demo) ctx.seedDemoData();
  ctx.__resetClock();
  const token = ok(callApi(ctx, 'login', ADMIN)).token;
  const api = (action, payload, tk) => callApi(ctx, action, payload, tk === undefined ? token : tk);
  const cat = demo ? ok(api('catalog')) : null;
  const ids = {};
  if (cat) {
    cat.products.forEach((p) => { ids[p.product_name] = p.product_id; });
    Object.values(cat.variants).forEach((v) => { ids[v.variant_name] = v.variant_id; });
  }
  return { ctx, api, token, ids };
}

function ok(res) {
  if (!res.ok) throw new Error(`API gagal: ${res.error.code} ${res.error.message}`);
  return res.data;
}

function errCode(res) {
  assert.equal(res.ok, false, 'seharusnya gagal tetapi sukses');
  return res.error.code;
}

function rows(ctx, sheet) {
  ctx.Db.resetCache();
  return ctx.Db.all(sheet);
}

function stockOf(ctx, type, id) {
  return rows(ctx, 'STOCKS').find((s) => s.item_type === type && s.item_id === id).quantity;
}

function makeUser(api, username, role) {
  ok(api('saveUser', { username, display_name: username, role, password: 'password123' }));
}

/* ------------------------------------------------------------------ */

test('mock SHA-256 identik dengan crypto Node', () => {
  const { ctx } = boot({ demo: false });
  for (const s of ['', 'abc', 'Dash Food ✓ pisang', 'x'.repeat(200)]) {
    assert.equal(ctx.sha256Hex(s), nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('setup idempotent dan kolom teks tidak dikonversi Sheets', () => {
  const { ctx, api } = boot({ demo: false });
  assert.match(ctx.setupDashFood(), /tidak ada perubahan/i);
  ok(api('saveSettings', { values: { store_phone: '081234567890' } }));
  const s = ok(api('settings'));
  assert.equal(s.store.store_phone, '081234567890', 'nol di depan nomor telepon harus tetap');
  const cats = rows(ctx, 'CATEGORIES');
  assert.equal(typeof cats[0].created_at, 'string');
  assert.ok(cats.length >= 9);
});

test('auth: password salah, lockout, token, role, logout', () => {
  const { api } = boot({ demo: false });
  assert.equal(errCode(api('login', { username: 'admin', password: 'salah' }, null)), 'AUTH_FAILED');
  assert.equal(errCode(api('catalog', {}, null)), 'AUTH_REQUIRED');
  assert.equal(errCode(api('catalog', {}, 'token-palsu')), 'AUTH_REQUIRED');
  makeUser(api, 'kasir1', 'STAFF');
  const staffToken = ok(api('login', { username: 'kasir1', password: 'password123' }, null)).token;
  assert.equal(errCode(api('saveProduct', { product_name: 'X' }, staffToken)), 'FORBIDDEN');
  assert.equal(errCode(api('users', {}, staffToken)), 'FORBIDDEN');
  assert.equal(ok(api('catalog', {}, staffToken)).products.length, 0);
  ok(api('logout', {}, staffToken));
  assert.equal(errCode(api('catalog', {}, staffToken)), 'AUTH_REQUIRED');
  for (let i = 0; i < 5; i++) api('login', { username: 'kasir1', password: 'salah' }, null);
  assert.equal(errCode(api('login', { username: 'kasir1', password: 'password123' }, null)), 'LOCKED');
});

test('auth: user nonaktif ditolak, admin terakhir tidak bisa dinonaktifkan', () => {
  const { api } = boot({ demo: false });
  makeUser(api, 'manager1', 'MANAGER');
  const users = ok(api('users'));
  const mgr = users.find((u) => u.username === 'manager1');
  const mgrToken = ok(api('login', { username: 'manager1', password: 'password123' }, null)).token;
  ok(api('setUserActive', { user_id: mgr.user_id, is_active: false }));
  assert.equal(errCode(api('catalog', {}, mgrToken)), 'AUTH_REQUIRED');
  const admin = users.find((u) => u.username === 'admin');
  assert.equal(errCode(api('setUserActive', { user_id: admin.user_id, is_active: false })), 'VALIDATION');
  assert.ok(users.every((u) => u.password_hash === undefined), 'hash password tidak boleh bocor ke client');
});

test('harga per channel: GoFood Banana Bites + Keju = 13.000 + 3.000', () => {
  const { api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'GOFOOD', items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Keju] }] }));
  assert.equal(o.items[0].unit_price, 13000);
  assert.equal(o.items[0].topping_total, 3000);
  assert.equal(o.items[0].line_total, 32000);
  assert.equal(o.items[0].variants[0].quantity, 2);
  assert.equal(o.items[0].variants[0].subtotal, 6000);
  assert.equal(o.total, 32000);
});

test('harga dari browser diabaikan; backend yang menghitung', () => {
  const { api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', total: 1, items: [{ product_id: ids.Sago, quantity: 1, unit_price: 1, line_total: 1 }] }));
  assert.equal(o.total, 15000);
});

test('produk tanpa topping: Sago menolak topping, total = harga × qty', () => {
  const { api, ids } = boot();
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1, variant_ids: [ids.Oreo] }] })), 'VALIDATION');
  const c = ok(api('catalog'));
  assert.deepEqual(c.products.find((p) => p.product_name === 'Sago').variant_ids, []);
  assert.deepEqual(c.products.find((p) => p.product_name === 'Es Teler').variant_ids, []);
  assert.equal(c.products.find((p) => p.product_name === 'Banana Bites').variant_ids.length, 3);
  const o = ok(api('createOrder', { channel: 'WHATSAPP', items: [{ product_id: ids.Sago, quantity: 3 }] }));
  assert.equal(o.total, 48000);
});

test('topping duplikat dalam satu baris tidak dihitung dua kali', () => {
  const { api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 1, variant_ids: [ids.Oreo, ids.Oreo] }] }));
  assert.equal(o.total, 12000);
  assert.equal(o.items[0].variants.length, 1);
});

test('diskon: tidak boleh negatif, pecahan, > subtotal, atau saat dinonaktifkan', () => {
  const { api, ids } = boot();
  const item = [{ product_id: ids.Sago, quantity: 1 }];
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: item, discount: -1 })), 'VALIDATION');
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: item, discount: 15001 })), 'VALIDATION');
  assert.equal(ok(api('createOrder', { channel: 'OFFLINE', items: item, discount: 5000 })).total, 10000);
  ok(api('saveSettings', { values: { allow_discount: 'FALSE' } }));
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: item, discount: 1000 })), 'VALIDATION');
});

test('penjualan cash (PRD 12.A): kembalian benar, COMPLETED/PAID, stok berkurang sekali', () => {
  const { ctx, api, ids } = boot();
  const before = { bb: stockOf(ctx, 'PRODUCT', ids['Banana Bites']), oreo: stockOf(ctx, 'VARIANT', ids.Oreo) };
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Oreo] }] }));
  assert.equal(o.status, 'DRAFT');
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), before.bb, 'stok tidak berubah saat order dibuat');
  const paid = ok(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 50000 }));
  assert.equal(paid.status, 'COMPLETED');
  assert.equal(paid.payment.status, 'PAID');
  assert.equal(paid.payment.received_amount, 50000);
  assert.equal(paid.payment.change_amount, 26000);
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), before.bb - 2);
  assert.equal(stockOf(ctx, 'VARIANT', ids.Oreo), before.oreo - 2);
  const mv = rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.reference_id === o.order_id);
  assert.equal(mv.length, 2);
  assert.ok(mv.every((m) => m.movement_type === 'SALE_OUT'));
});

test('penjualan non-cash (PRD 12.B): untuk tiap metode, diterima = total, kembalian 0', () => {
  const { api, ids } = boot();
  for (const method of ['DANA', 'SHOPEEPAY', 'QRIS', 'BANK_TRANSFER']) {
    const o = ok(api('createOrder', { channel: 'GRABFOOD', items: [{ product_id: ids['Es Teler'], quantity: 1 }] }));
    const p = ok(api('recordPayment', { order_id: o.order_id, payment_method: method, received_amount: 999999 }));
    assert.equal(p.payment.amount, 18000, method);
    assert.equal(p.payment.received_amount, 18000, method);
    assert.equal(p.payment.change_amount, 0, method);
    assert.equal(p.status, 'COMPLETED');
  }
});

test('cash kurang ditolak tanpa menulis apa pun', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  assert.equal(errCode(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 14999 })), 'VALIDATION');
  assert.equal(rows(ctx, 'PAYMENTS').length, 0);
  assert.equal(ok(api('orderDetail', { order_id: o.order_id })).status, 'DRAFT');
});

test('pembayaran ganda ditolak, stok tidak terpotong dua kali', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 2 }] }));
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' }));
  const after = stockOf(ctx, 'PRODUCT', ids.Sago);
  assert.equal(errCode(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' })), 'ALREADY_PAID');
  assert.equal(errCode(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 100000 })), 'ALREADY_PAID');
  assert.equal(stockOf(ctx, 'PRODUCT', ids.Sago), after);
  assert.equal(rows(ctx, 'PAYMENTS').length, 1);
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.reference_id === o.order_id).length, 1);
});

test('createOrder idempotent dengan client_ref yang sama', () => {
  const { ctx, api, ids } = boot();
  const payload = { client_ref: 'cart-abc', channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] };
  const a = ok(api('createOrder', payload));
  const b = ok(api('createOrder', payload));
  assert.equal(a.order_id, b.order_id);
  assert.equal(b.duplicate, true);
  assert.equal(rows(ctx, 'ORDERS').length, 1);
  assert.equal(rows(ctx, 'ORDER_ITEMS').length, 1);
});

test('stok tidak cukup (PRD 12.D): ditolak, tanpa payment, tanpa potong parsial', () => {
  const { ctx, api, ids } = boot();
  // 2 baris Banana Bites (30 + 25 = 55 > 50) + Sago cukup → harus ditolak semuanya.
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [
    { product_id: ids.Sago, quantity: 1 },
    { product_id: ids['Banana Bites'], quantity: 30 },
    { product_id: ids['Banana Bites'], quantity: 25 }
  ] }));
  assert.ok(o.stock_warnings.length >= 1, 'createOrder memberi peringatan stok');
  const sagoBefore = stockOf(ctx, 'PRODUCT', ids.Sago);
  const res = api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 10000000 });
  assert.equal(errCode(res), 'INSUFFICIENT_STOCK');
  assert.match(res.error.message, /Banana Bites/);
  assert.equal(rows(ctx, 'PAYMENTS').length, 0);
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.movement_type === 'SALE_OUT').length, 0);
  assert.equal(stockOf(ctx, 'PRODUCT', ids.Sago), sagoBefore);
  assert.equal(ok(api('orderDetail', { order_id: o.order_id })).status, 'DRAFT');
});

test('stok topping tidak cukup juga menolak pembayaran', () => {
  const { api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 21, variant_ids: [ids.Keju] }] }));
  const res = api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' });
  assert.equal(errCode(res), 'INSUFFICIENT_STOCK');
  assert.match(res.error.message, /Keju/);
});

test('perubahan harga tidak mengubah histori order; harga lama dinonaktifkan', () => {
  const { ctx, api, ids } = boot();
  const old = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: old.order_id, payment_method: 'QRIS' }));
  const r = ok(api('savePrices', { product_id: ids.Sago, prices: { OFFLINE: 17000, GOFOOD: '' } }));
  assert.equal(r.changed, 1);
  const again = ok(api('orderDetail', { order_id: old.order_id }));
  assert.equal(again.items[0].unit_price, 15000);
  assert.equal(again.total, 15000);
  const fresh = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  assert.equal(fresh.total, 17000);
  const sagoPrices = rows(ctx, 'PRICES').filter((p) => p.product_id === ids.Sago && p.channel === 'OFFLINE');
  assert.equal(sagoPrices.length, 2);
  assert.equal(sagoPrices.filter((p) => p.is_active).length, 1);
  assert.equal(ok(api('prices', { product_id: ids.Sago })).prices.GOFOOD, 18000, 'channel kosong tidak diubah');
  assert.equal(errCode(api('savePrices', { product_id: ids.Sago, prices: { OFFLINE: -1 } })), 'VALIDATION');
  assert.equal(errCode(api('savePrices', { product_id: ids.Sago, prices: { OFFLINE: 1.5 } })), 'VALIDATION');
});

test('harga topping per channel bisa diubah lewat saveVariantPrices', () => {
  const { api, ids } = boot();
  ok(api('saveVariantPrices', { variant_id: ids.Oreo, prices: { SHOPEEFOOD: 4000 } }));
  const o = ok(api('createOrder', { channel: 'SHOPEEFOOD', items: [{ product_id: ids['Banana Bites'], quantity: 1, variant_ids: [ids.Oreo] }] }));
  assert.equal(o.total, 13000 + 4000);
});

test('harga channel belum diatur → PRICE_MISSING', () => {
  const { api } = boot({ demo: false });
  const cat = ok(api('categories', { type: 'PRODUCT' }))[0];
  const p = ok(api('saveProduct', { product_name: 'Pisang Coklat', category_id: cat.category_id, base_unit: 'pcs' }));
  ok(api('savePrices', { product_id: p.product_id, prices: { OFFLINE: 8000 } }));
  ok(api('adjustStock', { item_type: 'PRODUCT', item_id: p.product_id, direction: 'IN', quantity: 10, notes: 'stok awal' }));
  assert.equal(errCode(api('createOrder', { channel: 'GOFOOD', items: [{ product_id: p.product_id, quantity: 1 }] })), 'PRICE_MISSING');
  assert.equal(ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: p.product_id, quantity: 1 }] })).total, 8000);
});

test('pembatalan setelah bayar: role, alasan, stok kembali, payment REFUNDED, keluar dari omzet', () => {
  const { ctx, api, ids } = boot();
  makeUser(api, 'kasir1', 'STAFF');
  const staff = ok(api('login', { username: 'kasir1', password: 'password123' }, null)).token;
  const before = stockOf(ctx, 'PRODUCT', ids['Banana Bites']);
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 3, variant_ids: [ids.Cokelat] }] }));
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 36000 }));
  assert.equal(ok(api('dashboard', { period: 'today' })).kpi.omzet, 36000);
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, reason: 'x', confirm_order_number: o.order_number }, staff)), 'FORBIDDEN');
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, confirm_order_number: o.order_number })), 'VALIDATION');
  const c = ok(api('cancelOrder', { order_id: o.order_id, reason: 'Salah input', confirm_order_number: o.order_number }));
  assert.equal(c.status, 'CANCELLED');
  assert.equal(c.payment.status, 'REFUNDED');
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), before);
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.reference_id === o.order_id && m.movement_type === 'CANCEL_REVERSE').length, 2);
  assert.equal(ok(api('dashboard', { period: 'today' })).kpi.omzet, 0);
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, reason: 'lagi', confirm_order_number: o.order_number })), 'ALREADY_CANCELLED');
  assert.equal(rows(ctx, 'ORDERS').length, 1, 'transaksi tidak dihapus');
  assert.equal(errCode(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' })), 'ORDER_CANCELLED');
});

test('pembatalan draft oleh staff tidak menyentuh stok', () => {
  const { ctx, api, ids } = boot();
  makeUser(api, 'kasir1', 'STAFF');
  const staff = ok(api('login', { username: 'kasir1', password: 'password123' }, null)).token;
  const before = rows(ctx, 'STOCK_MOVEMENTS').length;
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }, staff));
  assert.equal(o.cashier_name, 'kasir1');
  assert.equal(ok(api('cancelOrder', { order_id: o.order_id, confirm_order_number: o.order_number }, staff)).status, 'CANCELLED');
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').length, before);
});

test('produksi menambah stok + movement PRODUCTION_IN; submit ganda tidak tercatat dua kali', () => {
  const { ctx, api, ids } = boot();
  const before = stockOf(ctx, 'PRODUCT', ids.Sago);
  const payload = { client_ref: 'prod-1', product_id: ids.Sago, quantity: 12, production_date: ctx.todayStr(), notes: 'batch pagi' };
  const a = ok(api('recordProduction', payload));
  const b = ok(api('recordProduction', payload));
  assert.equal(b.duplicate, true);
  assert.equal(stockOf(ctx, 'PRODUCT', ids.Sago), before + 12);
  assert.equal(rows(ctx, 'PRODUCTION').length, 1);
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.movement_type === 'PRODUCTION_IN').length, 1);
  assert.equal(a.balance, before + 12);
  assert.equal(errCode(api('recordProduction', { product_id: ids.Sago, quantity: 0 })), 'VALIDATION');
  assert.equal(errCode(api('recordProduction', { product_id: ids.Sago, quantity: 1, production_date: '2999-01-01' })), 'VALIDATION');
  assert.equal(ok(api('productions')).length, 1);
});

test('penyesuaian stok: wajib alasan, tidak boleh negatif, tercatat', () => {
  const { ctx, api, ids } = boot();
  assert.equal(errCode(api('adjustStock', { item_type: 'VARIANT', item_id: ids.Keju, direction: 'OUT', quantity: 1, notes: '' })), 'VALIDATION');
  assert.equal(errCode(api('adjustStock', { item_type: 'VARIANT', item_id: ids.Keju, direction: 'OUT', quantity: 21, notes: 'rusak' })), 'INSUFFICIENT_STOCK');
  const r = ok(api('adjustStock', { item_type: 'VARIANT', item_id: ids.Keju, direction: 'OUT', quantity: 2, notes: 'rusak' }));
  assert.equal(r.balance, 18);
  const mv = ok(api('stockMovements', { item_id: ids.Keju }));
  assert.equal(mv[0].movement_type, 'ADJUSTMENT_OUT');
  assert.equal(mv[0].notes, 'rusak');
  assert.equal(stockOf(ctx, 'VARIANT', ids.Keju), 18);
  ok(api('updateStockSettings', { item_type: 'VARIANT', item_id: ids.Keju, minimum_stock: 20 }));
  const st = ok(api('stock')).items.find((s) => s.item_id === ids.Keju);
  assert.equal(st.status, 'LOW');
});

test('pengeluaran: validasi, tidak dihitung sebagai penjualan, laba = omzet − pengeluaran', () => {
  const { ctx, api, ids } = boot();
  const today = ctx.todayStr();
  assert.equal(errCode(api('saveExpense', { expense_date: today, category: 'Bahan', description: 'Pisang', amount: 0, payment_method: 'CASH' })), 'VALIDATION');
  assert.equal(errCode(api('saveExpense', { expense_date: today, category: 'Tidak Ada', description: 'Pisang', amount: 1000, payment_method: 'CASH' })), 'VALIDATION');
  assert.equal(errCode(api('saveExpense', { expense_date: '2026-02-30', category: 'Bahan', description: 'Pisang', amount: 1000, payment_method: 'CASH' })), 'VALIDATION');
  const e = ok(api('saveExpense', { expense_date: today, category: 'Bahan', description: 'Pisang', amount: 50000, payment_method: 'CASH' }));
  ok(api('saveExpense', { expense_id: e.expense_id, expense_date: today, category: 'Bahan', description: 'Pisang raja', amount: 40000, payment_method: 'DANA' }));
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 2 }] }));
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 30000 }));
  const d = ok(api('dashboard', { period: 'today' }));
  assert.equal(d.kpi.omzet, 30000);
  assert.equal(d.kpi.transaksi, 1);
  assert.equal(d.kpi.pengeluaran, 40000);
  assert.equal(d.kpi.laba_bersih, -10000);
  const f = ok(api('reportFinance', { period: 'today' }));
  assert.equal(f.summary.laba_bersih, -10000);
  assert.equal(f.hpp.available, false);
  assert.deepEqual(f.expense_by_category, [{ category: 'Bahan', amount: 40000, pct: 100 }]);
  assert.equal(ok(api('expenses', { period: 'today' })).total, 40000);
});

test('laporan lintas hari: perbandingan kemarin, deret harian, grup produk + topping', () => {
  const { ctx, api, ids } = boot({ seedDaysAgo: 3 });
  const today = ctx.todayStr();
  ctx.__setClock(Date.now() - 86400000); // kemarin
  const y = ok(api('createOrder', { channel: 'WHATSAPP', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: y.order_id, payment_method: 'QRIS' }));
  ctx.__resetClock();
  assert.equal(ok(api('orderDetail', { order_id: y.order_id })).order_date, ctx.addDays(today, -1));
  const a = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Oreo] }] }));
  ok(api('recordPayment', { order_id: a.order_id, payment_method: 'CASH', received_amount: 24000 }));
  const b = ok(api('createOrder', { channel: 'GOFOOD', items: [{ product_id: ids['Banana Bites'], quantity: 1, variant_ids: [ids.Oreo] }, { product_id: ids['Es Teler'], quantity: 1 }] }));
  ok(api('recordPayment', { order_id: b.order_id, payment_method: 'SHOPEEPAY' }));
  const d = ok(api('dashboard', { period: 'today' }));
  assert.equal(d.kpi.omzet, 24000 + 15500 + 18000);
  assert.equal(d.kpi.transaksi, 2);
  assert.equal(d.kpi.transaksi_change_pct, 100);
  assert.equal(d.top_products[0].label, 'Banana Bites - Oreo');
  assert.equal(d.top_products[0].quantity, 3);
  const sales = ok(api('reportSales', { period: '7d' }));
  assert.equal(sales.daily.length, 7);
  assert.equal(sales.daily[6].date, today);
  assert.equal(sales.daily[5].omzet, 16000);
  assert.equal(sales.summary.transaksi, 3);
  const gof = sales.by_channel.find((c) => c.channel === 'GOFOOD');
  assert.equal(gof.omzet, 33500);
  const prod = ok(api('reportProducts', { period: '7d', channel: 'GOFOOD' }));
  assert.deepEqual(prod.rows.map((r) => r.label).sort(), ['Banana Bites - Oreo', 'Es Teler']);
  assert.equal(errCode(api('reportSales', { period: 'custom', date_from: '2026-10-10', date_to: '2026-10-01' })), 'INVALID_PERIOD');
});

test('riwayat order menampilkan nama produk dan bisa dicari', () => {
  const { api, ids } = boot();
  const a = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Oreo, ids.Keju] }] }));
  ok(api('recordPayment', { order_id: a.order_id, payment_method: 'QRIS' }));
  const b = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  assert.match(a.order_number, /^TRX-\d{8}-0001$/);
  assert.match(b.order_number, /^TRX-\d{8}-0002$/);
  const list = ok(api('orders', { period: 'today' })).orders;
  assert.equal(list.length, 2);
  const row = list.find((o) => o.order_id === a.order_id);
  assert.equal(row.items_summary, 'Banana Bites (Oreo, Keju) ×2');
  assert.equal(row.payment_method, 'QRIS');
  assert.equal(ok(api('orders', { period: 'today', q: 'sago' })).orders.length, 1);
  assert.equal(ok(api('orders', { period: 'today', status: 'COMPLETED' })).orders.length, 1);
  assert.equal(ok(api('orders', { period: 'today', channel: 'GOFOOD' })).orders.length, 0);
});

test('produk/topping nonaktif & topping tidak tertaut ditolak; nonaktif hilang dari katalog', () => {
  const { api, ids } = boot();
  ok(api('setProductActive', { product_id: ids.Sago, is_active: false }));
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] })), 'VALIDATION');
  assert.equal(ok(api('catalog')).products.some((p) => p.product_id === ids.Sago), false);
  ok(api('setVariantActive', { variant_id: ids.Keju, is_active: false }));
  assert.equal(ok(api('catalog')).products.find((p) => p.product_name === 'Banana Bites').variant_ids.length, 2);
  assert.equal(errCode(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 1, variant_ids: [ids.Keju] }] })), 'VALIDATION');
});

test('kelola produk: validasi, relasi topping, stok dibuat otomatis, tidak ada hapus permanen', () => {
  const { ctx, api, ids } = boot();
  const cats = ok(api('categories', { type: 'PRODUCT' }));
  assert.equal(errCode(api('saveProduct', { product_name: '', category_id: cats[0].category_id, base_unit: 'pcs' })), 'VALIDATION');
  assert.equal(errCode(api('saveProduct', { product_name: 'banana bites', category_id: cats[0].category_id, base_unit: 'pcs' })), 'DUPLICATE');
  assert.equal(errCode(api('saveProduct', { product_name: 'Baru', category_id: 'CAT-XXX', base_unit: 'pcs' })), 'VALIDATION');
  assert.equal(errCode(api('saveProduct', { product_name: 'Baru', category_id: cats[0].category_id, base_unit: 'pcs', image_url: 'http://x' })), 'VALIDATION');
  const p = ok(api('saveProduct', { product_name: 'Roti Pisang', category_id: cats[0].category_id, base_unit: 'pcs', variant_ids: [ids.Oreo], minimum_stock: 3 }));
  assert.equal(stockOf(ctx, 'PRODUCT', p.product_id), 0);
  ok(api('saveProduct', { product_id: p.product_id, product_name: 'Roti Pisang', category_id: cats[0].category_id, base_unit: 'pcs', variant_ids: [ids.Keju] }));
  const listed = ok(api('products')).find((x) => x.product_id === p.product_id);
  assert.deepEqual(listed.variant_ids, [ids.Keju]);
  assert.equal(ok(api('variants')).find((v) => v.variant_id === ids.Keju).used_by.includes('Roti Pisang'), true);
  assert.equal(typeof ctx.deleteProduct, 'undefined', 'tidak ada fungsi hapus permanen');
});

test('kategori: tidak bisa menonaktifkan kategori produk yang dipakai', () => {
  const { api } = boot();
  const cemilan = ok(api('categories', { type: 'PRODUCT' })).find((c) => c.category_name === 'Cemilan');
  assert.equal(errCode(api('setCategoryActive', { category_id: cemilan.category_id, is_active: false })), 'IN_USE');
  const k = ok(api('saveCategory', { category_name: 'Listrik', category_type: 'EXPENSE' }));
  assert.equal(errCode(api('saveCategory', { category_name: 'listrik', category_type: 'EXPENSE' })), 'DUPLICATE');
  ok(api('setCategoryActive', { category_id: k.category_id, is_active: false }));
});

test('pengaturan: hanya admin; channel/metode nonaktif ditolak saat transaksi', () => {
  const { api, ids } = boot();
  makeUser(api, 'mgr', 'MANAGER');
  const mgr = ok(api('login', { username: 'mgr', password: 'password123' }, null)).token;
  assert.equal(errCode(api('saveSettings', { values: { store_name: 'X' } }, mgr)), 'FORBIDDEN');
  assert.equal(errCode(api('saveSettings', { values: { password_hash: 'x' } })), 'VALIDATION');
  assert.equal(errCode(api('saveSettings', { values: { channels_enabled: '' } })), 'VALIDATION');
  ok(api('saveSettings', { values: { channels_enabled: 'OFFLINE,WHATSAPP', payment_methods_enabled: 'CASH,QRIS' } }));
  assert.deepEqual(ok(api('catalog')).channels, ['OFFLINE', 'WHATSAPP']);
  assert.equal(errCode(api('createOrder', { channel: 'GOFOOD', items: [{ product_id: ids.Sago, quantity: 1 }] })), 'VALIDATION');
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  assert.equal(errCode(api('recordPayment', { order_id: o.order_id, payment_method: 'DANA' })), 'VALIDATION');
  assert.equal(errCode(api('saveSettings', { values: { store_logo_url: 'javascript:alert(1)' } })), 'VALIDATION');
});

test('struk PDF & backup', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  assert.equal(errCode(api('receiptPdf', { order_id: o.order_id })), 'VALIDATION');
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 20000 }));
  const pdf = ok(api('receiptPdf', { order_id: o.order_id }));
  assert.match(pdf.base64, /^JVBER/);
  assert.match(pdf.filename, /^Struk-TRX-/);
  const html = ctx.receiptHtml_(ctx.orderDetail({ order_id: o.order_id }), ctx.getSettingsMap_());
  assert.match(html, /Rp 15\.000/);
  assert.match(html, /5\.000/);
  const bk = ok(api('backup'));
  const copy = Object.values(ctx.__mock.spreadsheets).find((s) => s.getUrl() === bk.url);
  const names = copy.getSheets().map((s) => s.getName());
  assert.ok(names.includes('ORDERS'));
  assert.ok(!names.includes('USERS'));
  assert.ok(ok(api('settings')).last_backup_at);
});

test('router: aksi tidak dikenal & error tak terduga dibungkus', () => {
  const { api, ctx } = boot({ demo: false });
  assert.equal(errCode(api('hapusSemua')), 'UNKNOWN_ACTION');
  assert.equal(ctx.__mock.isLockHeld(), false);
  const res = api('orderDetail', { order_id: 'tidak-ada' });
  assert.equal(errCode(res), 'NOT_FOUND');
});

test('lock selalu dilepas walau terjadi error di tengah', () => {
  const { api, ctx, ids } = boot();
  api('recordPayment', { order_id: 'ORD-X', payment_method: 'CASH' });
  assert.equal(ctx.__mock.isLockHeld(), false);
  api('adjustStock', { item_type: 'PRODUCT', item_id: ids.Sago, direction: 'OUT', quantity: 999, notes: 'x' });
  assert.equal(ctx.__mock.isLockHeld(), false);
});

test('sesi & publicInfo tidak membocorkan data sensitif', () => {
  const { api } = boot();
  const s = ok(api('session'));
  assert.equal(s.user.username, 'admin');
  assert.equal(s.user.password_hash, undefined);
  assert.equal(s.settings.data_mode, 'DEMO');
  const pub = ok(api('publicInfo', {}, null));
  assert.deepEqual(Object.keys(pub).sort(), ['data_mode', 'has_users', 'login_background_url', 'store_logo_url', 'store_name', 'store_tagline']);
});

test('doGet hanya memakai meta tag yang diizinkan HtmlService', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'Api.gs'), 'utf8');
  const ALLOWED = ['viewport']; // satu-satunya yang dibutuhkan & pasti diizinkan
  const used = [...src.matchAll(/addMetaTag\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(used.includes('viewport'));
  for (const name of used) assert.ok(ALLOWED.includes(name), 'meta tag tidak diizinkan Apps Script: ' + name);
});

/* ---------- Media: upload, URL, ikon, data mode ---------- */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('uploadImage: simpan ke Drive, share per file, catat di MEDIA; validasi tipe/isi/ukuran/role', () => {
  const { ctx, api, ids } = boot();
  const up = ok(api('uploadImage', { purpose: 'PRODUCT', ref_id: ids.Sago, filename: 'sago.png', mime_type: 'image/png', base64: PNG_1PX }));
  assert.match(up.url, /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
  const f = ctx.__mock.driveFiles[up.file_id];
  assert.equal(f.sharing, 'ANYONE_WITH_LINK:VIEW');
  assert.equal(f.mime, 'image/png');
  assert.equal(rows(ctx, 'MEDIA')[0].status, 'ACTIVE');
  assert.equal(errCode(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'application/pdf', base64: PNG_1PX })), 'VALIDATION');
  assert.equal(errCode(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/jpeg', base64: PNG_1PX })), 'VALIDATION', 'isi PNG dengan mime JPEG ditolak');
  assert.equal(errCode(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/png', base64: Buffer.from('bukan gambar sama sekali').toString('base64') })), 'VALIDATION');
  ok(api('saveSettings', { values: { upload_max_mb: '1' } }));
  const big = Buffer.concat([Buffer.from(PNG_1PX, 'base64'), Buffer.alloc(1100000)]).toString('base64');
  assert.match(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/png', base64: big }).error.message, /1 MB/);
  makeUser(api, 'mgr', 'MANAGER');
  const mgr = ok(api('login', { username: 'mgr', password: 'password123' }, null)).token;
  assert.equal(errCode(api('uploadImage', { purpose: 'BRAND_ICON', mime_type: 'image/png', base64: PNG_1PX }, mgr)), 'FORBIDDEN');
  ok(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/png', base64: PNG_1PX }, mgr));
});

test('ganti/hapus foto produk: file lama ke Trash + ARCHIVED; URL eksternal tidak disentuh; posisi crop tersimpan', () => {
  const { ctx, api, ids } = boot();
  const cat = ok(api('categories', { type: 'PRODUCT' }))[0];
  const a = ok(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/png', base64: PNG_1PX }));
  const base = { product_id: ids.Sago, product_name: 'Sago', category_id: cat.category_id, base_unit: 'cup' };
  ok(api('saveProduct', Object.assign({}, base, { image_url: a.url, image_position: 'top' })));
  let p = ok(api('catalog')).products.find((x) => x.product_id === ids.Sago);
  assert.equal(p.image_url, a.url);
  assert.equal(p.image_position, 'top');
  const b = ok(api('uploadImage', { purpose: 'PRODUCT', mime_type: 'image/png', base64: PNG_1PX }));
  ok(api('saveProduct', Object.assign({}, base, { image_url: b.url })));
  assert.equal(ctx.__mock.driveFiles[a.file_id].trashed, true);
  assert.equal(rows(ctx, 'MEDIA').find((m) => m.file_id === a.file_id).status, 'ARCHIVED');
  ok(api('saveProduct', Object.assign({}, base, { image_url: '' })));
  assert.equal(ctx.__mock.driveFiles[b.file_id].trashed, true);
  ok(api('saveProduct', Object.assign({}, base, { image_url: 'https://example.com/sago.jpg', image_position: 'evil;' })));
  p = ok(api('products')).find((x) => x.product_id === ids.Sago);
  assert.equal(p.image_position, 'center', 'posisi tak dikenal dinormalkan');
  assert.equal(errCode(api('saveProduct', Object.assign({}, base, { image_url: 'http://x.com/a.jpg' }))), 'VALIDATION');
  assert.equal(errCode(api('saveProduct', Object.assign({}, base, { image_url: 'javascript:alert(1)' }))), 'VALIDATION');
});

test('link Google Drive "file/d/ID/view" dinormalkan ke URL gambar langsung', () => {
  const { api } = boot({ demo: false });
  const s = ok(api('saveSettings', { values: { store_logo_url: 'https://drive.google.com/file/d/AbC_123-x/view?usp=sharing' } }));
  assert.equal(s.store.store_logo_url, 'https://drive.google.com/thumbnail?id=AbC_123-x&sz=w2000');
});

test('ikon channel & pembayaran: 10 kode bisa diatur, kembali ke default, file lama diarsipkan', () => {
  const { ctx, api } = boot({ demo: false });
  const up = ok(api('uploadImage', { purpose: 'BRAND_ICON', ref_id: 'GOFOOD', mime_type: 'image/png', base64: PNG_1PX }));
  const values = {};
  ['OFFLINE', 'WHATSAPP', 'GOFOOD', 'GRABFOOD', 'SHOPEEFOOD', 'CASH', 'DANA', 'SHOPEEPAY', 'QRIS', 'BANK_TRANSFER'].forEach((c) => { values['brand_logo_' + c] = 'https://example.com/' + c + '.png'; });
  values.brand_logo_GOFOOD = up.url;
  const s = ok(api('saveSettings', { values }));
  assert.equal(Object.keys(s.brand_logos).length, 10);
  assert.equal(s.brand_logos.GOFOOD, up.url);
  assert.notEqual(s.brand_logos.SHOPEEFOOD, s.brand_logos.SHOPEEPAY);
  const r = ok(api('saveSettings', { values: { brand_logo_GOFOOD: '' } }));
  assert.equal(r.brand_logos.GOFOOD, '');
  assert.equal(ctx.__mock.driveFiles[up.file_id].trashed, true);
});

test('data mode: hanya admin yang bisa menandai; tidak menghapus data', () => {
  const { ctx, api } = boot();
  const before = rows(ctx, 'PRODUCTS').length;
  assert.equal(ok(api('setDataMode', { mode: 'PRODUCTION' })).data_mode, 'PRODUCTION');
  assert.equal(rows(ctx, 'PRODUCTS').length, before);
  assert.equal(errCode(api('setDataMode', { mode: 'X' })), 'VALIDATION');
});

test('riwayat: order di detik yang sama tetap urut terbaru dulu (nomor transaksi)', () => {
  const { ctx, api, ids } = boot();
  const day = ctx.todayStr();
  ctx.__setClock(Date.parse(day + 'T23:59:58.000+08:00'));
  const nums = [1, 2, 3].map(() => ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] })).order_number);
  ctx.__resetClock();
  const list = ok(api('orders', { period: 'custom', date_from: day, date_to: day })).orders.map((o) => o.order_number);
  assert.deepEqual(list.slice(0, 3), nums.slice().reverse());
});

/* ---------- Sprint 2: edit/batal order, logo struk, bootstrap, cache katalog ---------- */

test('cancelOrder tanpa konfirmasi nomor transaksi ditolak (tidak bisa lewati dialog UI)', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' }));
  const stock = stockOf(ctx, 'PRODUCT', ids.Sago);
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, reason: 'x' })), 'CONFIRM_REQUIRED');
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, reason: 'x', confirm_order_number: 'TRX-LAIN' })), 'CONFIRM_REQUIRED');
  assert.equal(stockOf(ctx, 'PRODUCT', ids.Sago), stock);
  assert.equal(ok(api('orderDetail', { order_id: o.order_id })).status, 'COMPLETED');
});

test('updateOrder: hanya order belum dibayar; harga & total dihitung ulang; revisi lama tersimpan; audit trail', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }], notes: 'awal' }));
  assert.equal(o.editable, true);
  const u = ok(api('updateOrder', { order_id: o.order_id, channel: 'OFFLINE', notes: 'diubah', discount: 2000,
    items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Oreo] }, { product_id: ids['Es Teler'], quantity: 1 }] }));
  assert.equal(u.order_number, o.order_number, 'nomor transaksi tetap');
  assert.equal(u.subtotal, 24000 + 15000);
  assert.equal(u.total, 37000);
  assert.equal(u.notes, 'diubah');
  assert.equal(u.revision, 1);
  assert.equal(u.items.length, 2);
  const superseded = rows(ctx, 'ORDER_ITEMS').filter((i) => i.order_id === o.order_id + '~R0');
  assert.equal(superseded.length, 1, 'item versi lama disimpan sebagai jejak audit');
  assert.deepEqual(u.events.map((e) => e.event_type), ['CREATED', 'UPDATED']);
  assert.match(u.events[1].detail, /Rp 15\.000 → Rp 37\.000/);
  // stok tidak tersentuh oleh edit
  assert.equal(rows(ctx, 'STOCK_MOVEMENTS').filter((m) => m.reference_id === o.order_id).length, 0);
  // bayar → hanya item revisi terbaru yang memotong stok, sekali
  const bb = stockOf(ctx, 'PRODUCT', ids['Banana Bites']), sago = stockOf(ctx, 'PRODUCT', ids.Sago);
  const p = ok(api('recordPayment', { order_id: o.order_id, payment_method: 'CASH', received_amount: 50000 }));
  assert.equal(p.payment.change_amount, 13000);
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), bb - 2);
  assert.equal(stockOf(ctx, 'PRODUCT', ids.Sago), sago, 'item yang dihapus dari order tidak memotong stok');
  assert.equal(p.editable, false);
  assert.equal(errCode(api('updateOrder', { order_id: o.order_id, items: [{ product_id: ids.Sago, quantity: 1 }] })), 'NOT_EDITABLE');
  // laporan memakai revisi terbaru saja
  const d = ok(api('dashboard', { period: 'today' }));
  assert.equal(d.kpi.omzet, 37000);
  assert.equal(d.top_products.some((t) => t.product_name === 'Sago'), false);
});

test('pembatalan sudah bayar: stok dikembalikan tepat sekali, payment REFUNDED, event tercatat', () => {
  const { ctx, api, ids } = boot();
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids['Banana Bites'], quantity: 2, variant_ids: [ids.Keju] }] }));
  const bb0 = stockOf(ctx, 'PRODUCT', ids['Banana Bites']), keju0 = stockOf(ctx, 'VARIANT', ids.Keju);
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' }));
  const c = ok(api('cancelOrder', { order_id: o.order_id, reason: 'Pelanggan batal', confirm_order_number: o.order_number }));
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), bb0);
  assert.equal(stockOf(ctx, 'VARIANT', ids.Keju), keju0);
  assert.equal(errCode(api('cancelOrder', { order_id: o.order_id, reason: 'lagi', confirm_order_number: o.order_number })), 'ALREADY_CANCELLED');
  assert.equal(stockOf(ctx, 'PRODUCT', ids['Banana Bites']), bb0, 'tidak ada reversal ganda');
  assert.deepEqual(c.events.map((e) => e.event_type), ['CREATED', 'PAID', 'CANCELLED']);
  assert.equal(errCode(api('updateOrder', { order_id: o.order_id, items: [{ product_id: ids.Sago, quantity: 1 }] })), 'NOT_EDITABLE');
  assert.equal(rows(ctx, 'ORDERS').length, 1, 'tidak ada hard delete');
});

test('logo struk terpisah dari logo login; snapshot per transaksi; file logo struk lama tidak diarsipkan', () => {
  const { ctx, api, ids } = boot();
  const up1 = ok(api('uploadImage', { purpose: 'RECEIPT_LOGO', mime_type: 'image/png', base64: PNG_1PX }));
  let s = ok(api('saveSettings', { values: { store_logo_url: 'https://example.com/login.png', receipt_logo_url: up1.url } }));
  assert.equal(s.store.store_logo_url, 'https://example.com/login.png');
  assert.equal(s.receipt.receipt_logo_effective, up1.url);
  const a = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: a.order_id, payment_method: 'QRIS' }));
  const up2 = ok(api('uploadImage', { purpose: 'RECEIPT_LOGO', mime_type: 'image/png', base64: PNG_1PX }));
  ok(api('saveSettings', { values: { receipt_logo_url: up2.url } }));
  const b = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: b.order_id, payment_method: 'QRIS' }));
  assert.equal(ok(api('orderDetail', { order_id: a.order_id })).receipt_logo_url, up1.url, 'struk lama tetap logo lama');
  assert.equal(ok(api('orderDetail', { order_id: b.order_id })).receipt_logo_url, up2.url);
  assert.equal(ctx.__mock.driveFiles[up1.file_id].trashed, false);
  // data URL untuk canvas/PDF hanya untuk file terdaftar
  assert.match(ok(api('receiptLogo', { url: up1.url })).data_url, /^data:image\/png;base64,/);
  assert.equal(ok(api('receiptLogo', { url: 'https://drive.google.com/thumbnail?id=TIDAKTERDAFTAR&sz=w2000' })).data_url, null);
  assert.match(ok(api('receiptLogo', {})).data_url, /^data:image\/png;base64,iVBOR/);
  // default: kosongkan → ikut logo login
  s = ok(api('saveSettings', { values: { receipt_logo_url: '' } }));
  assert.equal(s.receipt.receipt_logo_effective, 'https://example.com/login.png');
  // PDF memuat logo
  const html = ctx.receiptHtml_(ctx.orderDetail({ order_id: a.order_id }), ctx.getSettingsMap_(), ctx.mediaDataUrl_(up1.url));
  assert.match(html, /<img src="data:image\/png;base64,/);
  assert.match(ok(api('receiptPdf', { order_id: a.order_id })).base64, /^JVBER/);
});

test('bootstrap: 1 panggilan berisi publik+sesi+katalog+dashboard; tanpa token hanya publik', () => {
  const { ctx, api, token } = boot();
  const anon = ok(api('bootstrap', { token: 'salah' }, null));
  assert.equal(anon.session, null); assert.equal(anon.catalog, null);
  assert.ok(anon.pub.store_name);
  const before = ctx.__mock.readStats.getValues;
  const b = ok(api('bootstrap', { token }, null));
  assert.equal(b.session.user.username, 'admin');
  assert.equal(b.catalog.products.length, 3);
  assert.ok(b.dashboard.kpi);
  const reads = ctx.__mock.readStats.getValues - before;
  assert.ok(reads <= 40, 'pembacaan sheet dibatasi oleh cache per eksekusi: ' + reads);
});

test('cache katalog: hit setelah dibaca, dikosongkan saat harga/stok/produk berubah; checkout tidak memakai cache', () => {
  const { ctx, api, ids } = boot();
  ok(api('catalog'));
  assert.equal(ok(api('catalog')).cache, 'hit');
  ok(api('savePrices', { product_id: ids.Sago, prices: { OFFLINE: 17000 } }));
  const c = ok(api('catalog'));
  assert.equal(c.cache, 'miss');
  assert.equal(c.products.find((p) => p.product_id === ids.Sago).prices.OFFLINE, 17000);
  assert.equal(ok(api('catalog')).cache, 'hit');
  const o = ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] }));
  ok(api('recordPayment', { order_id: o.order_id, payment_method: 'QRIS' }));
  const after = ok(api('catalog'));
  assert.equal(after.cache, 'miss', 'penjualan mengubah STOCKS → cache dikosongkan');
  assert.equal(after.products.find((p) => p.product_id === ids.Sago).stock.quantity, stockOf(ctx, 'PRODUCT', ids.Sago));
  // Ubah harga langsung di sheet (tanpa invalidasi) → checkout tetap memakai sheet, bukan cache
  ok(api('catalog'));
  const pr = rows(ctx, 'PRICES').find((p) => p.product_id === ids.Sago && p.channel === 'OFFLINE' && p.is_active);
  ctx.Db.spreadsheet().getSheetByName('PRICES').getRange(pr._row, 4).setValue(19000);
  assert.equal(ok(api('catalog')).products.find((p) => p.product_id === ids.Sago).prices.OFFLINE, 17000, 'katalog tampilan boleh usang ≤5 menit');
  assert.equal(ok(api('createOrder', { channel: 'OFFLINE', items: [{ product_id: ids.Sago, quantity: 1 }] })).total, 19000, 'checkout selalu harga sheet');
});

test('doPost (PWA): kontrak sama dengan api(), token di body, input rusak ditolak rapi', () => {
  const { ctx } = boot();
  const post = (body) => {
    const out = ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } });
    assert.equal(out.getMimeType(), 'application/json');
    return JSON.parse(out.getContent());
  };
  const pub = post({ action: 'publicInfo' });
  assert.equal(pub.ok, true);
  assert.ok(pub.data.store_name);
  const lg = post({ action: 'login', payload: { username: ADMIN.username, password: ADMIN.password } });
  assert.equal(lg.ok, true);
  const token = lg.data.token;
  const b = post({ action: 'bootstrap', payload: { token } });
  assert.equal(b.data.session.user.username, 'admin');
  assert.equal(post({ action: 'catalog', token }).ok, true);
  assert.equal(post({ action: 'catalog' }).error.code, 'AUTH_REQUIRED', 'tanpa token ditolak');
  assert.equal(post({ action: 'catalog', token: 'palsu' }).error.code, 'AUTH_REQUIRED');
  assert.equal(post('bukan json').ok, false);
  assert.equal(post('').ok, false);
  assert.equal(post({ action: 'hapusSemua', token }).error.code, 'UNKNOWN_ACTION');
  assert.equal(ctx.doPost(undefined).getContent().includes('"ok":false'), true);
});
