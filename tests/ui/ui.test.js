/**
 * Test UI end-to-end Dash Food di Chromium headless (Playwright) memakai dev harness:
 * UI asli + backend .gs asli di atas runtime tiruan Apps Script.
 *
 *   node dev/build-dev.js && node --test tests/ui/ui.test.js
 *
 * Screenshot disimpan di screenshots/<viewport>/.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/npm-tools/node_modules/playwright'); }
const { chromium } = playwright;

const ROOT = path.join(__dirname, '..', '..');
const URL = 'file://' + path.join(ROOT, 'dev', 'dist', 'index.html');
const SHOTS = path.join(ROOT, 'screenshots');
const IGNORED_CONSOLE = [/fonts\.googleapis|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|invalid\.example|net::ERR_/i];

const USERS = { admin: 'admin123', manager: 'manager123', kasir: 'kasir123' };

let browser;
test.before(async () => {
  require('../../dev/build-dev.js').build();
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); });

async function open(opts = {}) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID',
    timezoneId: 'Asia/Makassar'
  }, opts.context || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL + '?reset=1&latency=' + (opts.latency || 40));
  await page.waitForSelector('[data-screen="login"]');
  page.errors = errors;
  return page;
}

async function login(page, user = 'admin') {
  await page.fill('input[name=username]', user);
  await page.fill('input[name=password]', USERS[user]);
  await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
}

async function idle(page) {
  await page.waitForFunction(() => !document.querySelector('#app .state .spinner') && !document.querySelector('#app .skel') && !document.querySelector('.refresh-bar') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 });
  await page.waitForTimeout(80);
}

async function goTo(page, name, params) {
  await page.evaluate(([n, p]) => window.__DF.go(n, p || {}), [name, params]);
  await page.waitForSelector(`[data-screen="${name}"]`);
  await idle(page);
}

async function shot(page, folder, name) {
  fs.mkdirSync(path.join(SHOTS, folder), { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, folder, name + '.png'), fullPage: true });
}

/** Mengembalikan daftar kontrol interaktif yang tidak punya aksi nyata. */
async function deadControls(page) {
  return page.evaluate(() => {
    const DF = window.__DF;
    const out = [];
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    document.querySelectorAll('#app button, #app [role=button], #app a, #sheet-root button, #sheet-root a').forEach((el) => {
      if (!visible(el)) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
        const why = el.getAttribute('title') || el.textContent.trim();
        if (!why) out.push('disabled tanpa alasan: ' + el.outerHTML.slice(0, 120));
        return;
      }
      const act = el.getAttribute('data-act');
      if (act) { if (!DF.ACTIONS[act]) out.push('handler tidak ada: ' + act); return; }
      if (el.tagName === 'A' && el.getAttribute('href')) return;
      if (el.type === 'submit' && el.form && el.form.dataset.submit) { if (!DF.SUBMITS[el.form.dataset.submit]) out.push('submit tanpa handler: ' + el.form.dataset.submit); return; }
      const host = el.closest('[data-act]');
      if (host && !host.classList.contains('sheet-backdrop')) return; // bagian dari kontrol lain
      out.push('tombol tanpa aksi: ' + el.outerHTML.slice(0, 140));
    });
    document.querySelectorAll('[data-input],[data-change]').forEach((el) => {
      if (el.dataset.input && !DF.INPUTS[el.dataset.input]) out.push('input handler tidak ada: ' + el.dataset.input);
      if (el.dataset.change && !DF.CHANGES[el.dataset.change]) out.push('change handler tidak ada: ' + el.dataset.change);
    });
    return out;
  });
}

/** Overflow horizontal, teks terlalu kecil, dan touch target terlalu kecil. */
async function layoutAudit(page) {
  return page.evaluate(() => {
    const res = { overflowX: document.documentElement.scrollWidth - window.innerWidth, smallText: [], smallTargets: [] };
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      // .bm = tile brand: dekoratif, selalu didampingi label teks ≥12px dan aria-label; akan diganti logo resmi.
      if (!el || seen.has(el) || el.closest('svg') || el.closest('.bm')) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.5) res.smallText.push(fs + 'px: ' + t.textContent.trim().slice(0, 30));
    }
    document.querySelectorAll('#app [data-act], #app button, #app input[type=checkbox], #app select').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('svg') || el.disabled) return;
      if (el.matches('.input-wrap .input-action, .btn-text.xs')) return; // pengecualian terdokumentasi
      const target = el.closest('label') || el;
      const tr = target.getBoundingClientRect();
      if (Math.min(tr.width, tr.height) < 36) res.smallTargets.push(Math.round(tr.width) + 'x' + Math.round(tr.height) + ' ' + (el.dataset.act || el.tagName) + ' ' + (el.textContent || '').trim().slice(0, 20));
    });
    return res;
  });
}

async function backendStock(page, name) {
  return page.evaluate((n) => {
    const G = window.__GAS; G.Db.resetCache();
    const p = G.Db.all('PRODUCTS').find((x) => x.product_name === n) || null;
    const v = p ? null : G.Db.all('VARIANTS').find((x) => x.variant_name === n);
    const id = p ? p.product_id : v.variant_id;
    return G.Db.all('STOCKS').find((s) => s.item_id === id).quantity;
  }, name);
}

async function openKasir(page) {
  await page.click('.bnav [data-tab="kasir"]');
  await page.waitForSelector('#kasir-grid .pcard');
}

/* ======================================================================= */

test('21 screen dirender di ponsel 390×844: tanpa error, tanpa overflow, tanpa tombol mati', async () => {
  const page = await open();
  await shot(page, '390', '01_login');
  assert.deepEqual(await deadControls(page), []);
  await login(page);
  const screens = [
    ['dashboard', {}, '02_dashboard'], ['kasir', {}, '03_kasir'], ['product', 'Banana Bites', '04_detail_produk'],
    ['cart', null, '05_keranjang'], ['payment', null, '06_pembayaran'], ['receipt', null, '07_struk'],
    ['orders', {}, '08_riwayat'], ['order', null, '09_detail_transaksi'], ['products', {}, '10_produk'],
    ['variants', {}, '11_topping'], ['prices', {}, '12_harga'], ['stock', {}, '13_stok'], ['production', {}, '14_produksi'],
    ['expenses', {}, '15_pengeluaran'], ['expenseForm', {}, '16_tambah_pengeluaran'], ['reportSales', {}, '17_laporan_penjualan'],
    ['reportProducts', {}, '18_laporan_produk'], ['reportFinance', {}, '19_laporan_keuangan'], ['settings', {}, '20_pengaturan'],
    ['more', {}, '21_lainnya']
  ];
  const report = {};
  for (const [name, params, file] of screens) {
    if (name === 'product') {
      await openKasir(page);
      await page.click('.pcard-main[aria-label="Detail Banana Bites"]');
      await page.waitForSelector('[data-screen="product"]');
      await page.click('.topping-row:has-text("Oreo") input');
      await page.click('[data-act="pdQty"][data-d="1"]');
    } else if (name === 'cart') {
      await page.click('[data-act="pdAdd"]');
      await page.waitForSelector('[data-screen="kasir"]');
      await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
      await page.click('[data-act="openCart"] >> nth=0');
      await page.waitForSelector('[data-screen="cart"]');
    } else if (name === 'payment') {
      await page.click('[data-act="checkout"]');
      await page.waitForSelector('[data-screen="payment"] .method');
      await page.click('[data-act="payQuick"] >> nth=1');
    } else if (name === 'receipt') {
      await page.click('[data-act="payNow"]');
      await page.waitForSelector('[data-screen="receipt"] .receipt');
    } else if (name === 'order') {
      await page.click('.order-row >> nth=0');
      await page.waitForSelector('[data-screen="order"] .kv-grid');
    } else {
      await goTo(page, name, params);
    }
    await idle(page);
    await shot(page, '390', file);
    const dead = await deadControls(page);
    const audit = await layoutAudit(page);
    report[file] = audit;
    assert.deepEqual(dead, [], `${file}: kontrol tanpa aksi`);
    assert.ok(audit.overflowX <= 0, `${file}: overflow horizontal ${audit.overflowX}px`);
    assert.deepEqual(audit.smallText, [], `${file}: teks < 11.5px`);
    assert.deepEqual(audit.smallTargets, [], `${file}: touch target < 36px`);
  }
  fs.writeFileSync(path.join(SHOTS, '390', '_layout_audit.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('PRD 12.A penjualan cash via UI: topping, qty, kembalian, stok berkurang sekali, struk', async () => {
  const page = await open();
  await login(page);
  const bbBefore = await backendStock(page, 'Banana Bites');
  const oreoBefore = await backendStock(page, 'Oreo');
  await openKasir(page);
  await page.click('[data-act="setChannel"][data-ch="OFFLINE"]');
  await page.click('.pcard-main[aria-label="Detail Banana Bites"]');
  await page.click('.topping-row:has-text("Oreo") input');
  await page.click('[data-act="pdQty"][data-d="1"]');
  assert.match(await page.textContent('[data-act="pdAdd"]'), /Rp 24\.000/);
  await page.click('[data-act="pdAdd"]');
  // katalog di atas, keranjang di bawah (ponsel)
  const g = await page.locator('#kasir-grid').boundingBox();
  const c = await page.locator('#kasir-cart').boundingBox();
  assert.ok(c.y > g.y + g.height - 1, 'keranjang harus di bawah katalog');
  await page.click('[data-act="openCart"] >> nth=0');
  assert.match(await page.textContent('#cart-totals'), /Rp 24\.000/);
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"]');
  assert.match(await page.textContent('.pay-total'), /Rp 24\.000/);
  await page.fill('#pay-recv', '50000');
  assert.match(await page.textContent('#pay-change'), /Rp 26\.000/);
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  const r = await page.textContent('.receipt');
  assert.match(r, /Oreo/);
  assert.match(r, /50\.000/);
  assert.match(r, /26\.000/);
  assert.match(r, /Rp 24\.000/);
  assert.equal(await backendStock(page, 'Banana Bites'), bbBefore - 2);
  assert.equal(await backendStock(page, 'Oreo'), oreoBefore - 2);
  // struk & PDF
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="downloadPdf"]')]);
  assert.match(dl.suggestedFilename(), /^Struk-TRX-.*\.pdf$/);
  await page.click('[data-act="shareReceipt"]');
  await page.waitForSelector('.sheet .receipt-img');
  assert.deepEqual(await deadControls(page), []);
  await page.click('[data-act="closeSheet"]');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('PRD 12.B non-cash: tidak meminta uang diterima, pembayaran = total, tanpa kembalian', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"]');
  await page.click('[data-act="payMethod"][data-m="QRIS"]');
  assert.equal(await page.locator('#pay-recv').count(), 0);
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  const pay = await page.evaluate(() => { const G = window.__GAS; G.Db.resetCache(); const p = G.Db.all('PAYMENTS'); return p[p.length - 1]; });
  assert.equal(pay.payment_method, 'QRIS');
  assert.equal(pay.received_amount, pay.amount);
  assert.equal(pay.change_amount, 0);
  await page.context().close();
});

test('PRD 12.C produk tanpa topping tidak menampilkan daftar topping', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  for (const name of ['Sago', 'Es Teler']) {
    await page.click(`.pcard-main[aria-label="Detail ${name}"]`);
    await page.waitForSelector('[data-screen="product"]');
    assert.equal(await page.locator('.topping-row').count(), 0, name);
    assert.equal(await page.locator('text=Pilih Topping').count(), 0, name);
    await page.click('[data-act="back"]');
  }
  await page.context().close();
});

test('PRD 12.D stok tidak cukup: UI memperingatkan; backend menolak tanpa potong parsial', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  const sago = await backendStock(page, 'Sago');
  // UI: menambah melebihi stok diblokir
  await page.click('.pcard-main[aria-label="Detail Sago"]');
  for (let i = 1; i <= sago; i++) await page.click('[data-act="pdQty"][data-d="1"]');
  assert.ok(await page.locator('.info-box.danger').isVisible());
  assert.ok(await page.locator('[data-act="pdAdd"]').isDisabled());
  await page.click('[data-act="back"]');
  // Backend: kasir lain menghabiskan stok setelah order dibuat
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"]');
  const before = await page.evaluate(() => { const G = window.__GAS; G.Db.resetCache(); return { pay: G.Db.all('PAYMENTS').length, mv: G.Db.all('STOCK_MOVEMENTS').length }; });
  await page.evaluate((q) => {
    const G = window.__GAS;
    const t = G.fns.api('login', { username: 'admin', password: 'admin123' }).data.token;
    const id = G.Db.all('PRODUCTS').find((p) => p.product_name === 'Sago').product_id;
    G.fns.api('adjustStock', { item_type: 'PRODUCT', item_id: id, direction: 'OUT', quantity: q, notes: 'tes: habis di kasir lain' }, t);
  }, sago);
  await page.click('[data-act="payMethod"][data-m="QRIS"]');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('.sheet:has-text("Stok tidak cukup")');
  const after = await page.evaluate(() => { const G = window.__GAS; G.Db.resetCache(); return { pay: G.Db.all('PAYMENTS').length, mv: G.Db.all('STOCK_MOVEMENTS').length }; });
  assert.equal(after.pay, before.pay, 'tidak ada payment');
  assert.equal(after.mv, before.mv + 1, 'hanya movement penyesuaian dari kasir lain');
  assert.equal(await backendStock(page, 'Sago'), 0);
  await page.context().close();
});

test('ketuk ganda "Selesaikan Transaksi" tidak menghasilkan pembayaran ganda', async () => {
  const page = await open({ latency: 300 });
  await login(page);
  await openKasir(page);
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"]');
  await page.click('[data-act="payMethod"][data-m="DANA"]');
  const before = await page.evaluate(() => { window.__GAS.Db.resetCache(); return window.__GAS.Db.all('PAYMENTS').length; });
  await page.evaluate(() => { const b = document.querySelector('[data-act="payNow"]'); b.click(); b.click(); window.__DF.ACTIONS.payNow(); });
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  const after = await page.evaluate(() => { window.__GAS.Db.resetCache(); return window.__GAS.Db.all('PAYMENTS').length; });
  assert.equal(after, before + 1);
  await page.context().close();
});

test('ganti channel menghitung ulang harga & memberi notifikasi', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  await page.click('[data-act="setChannel"][data-ch="OFFLINE"]');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  assert.match(await page.textContent('.cart-bar'), /Rp 15\.000/);
  await page.click('[data-act="setChannel"][data-ch="GOFOOD"]');
  await page.waitForSelector('.toast:has-text("Rp 15.000 → Rp 18.000")');
  assert.match(await page.textContent('.cart-bar'), /Rp 18\.000/);
  await page.context().close();
});

test('PRD 12.E riwayat menampilkan nomor, waktu, channel, status, total, dan nama produk', async () => {
  const page = await open();
  await login(page);
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.order-row');
  const first = await page.textContent('.order-row >> nth=0');
  assert.match(first, /TRX-\d{8}-\d{4}/);
  assert.match(first, /Rp /);
  assert.match(first, /(Banana Bites|Sago|Es Teler)/);
  await page.fill('[data-input="ordersSearch"]', 'es teler');
  await page.waitForTimeout(300);
  const rows = await page.locator('.order-row').allTextContents();
  assert.ok(rows.length > 0 && rows.every((r) => /Es Teler/i.test(r)));
  await page.context().close();
});

test('pembatalan transaksi selesai oleh admin mengembalikan stok', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"]');
  await page.click('[data-act="payMethod"][data-m="QRIS"]');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  const s1 = await backendStock(page, 'Sago');
  await goTo(page, 'orders');
  await page.click('.order-row >> nth=0');
  await page.waitForSelector('[data-screen="order"] .kv-grid');
  await page.click('[data-act="cancelOrder"]');
  await page.click('[data-act="confirmYes"]');
  assert.match(await page.textContent('#cf-err'), /wajib/);
  await page.fill('#cf-input', 'Pelanggan batal');
  await page.click('[data-act="confirmYes"]');
  await page.waitForSelector('.info-box.danger:has-text("Pelanggan batal")');
  assert.equal(await backendStock(page, 'Sago'), s1 + 1);
  await page.context().close();
});

test('operasional: tambah produk → atur harga → produksi → muncul di kasir', async () => {
  const page = await open();
  await login(page);
  await goTo(page, 'products');
  await page.click('[data-act="nav"][data-to="productForm"]');
  await page.waitForSelector('form[data-submit="saveProduct"]');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('#form-err'), /wajib/);
  await page.fill('[name=product_name]', 'Pisang Keju Lumer');
  await page.check('label.check:has-text("Keju") input');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-screen="prices"] form[data-submit="savePrices"]');
  await page.fill('#pr-OFFLINE', '12000');
  await page.fill('#pr-GOFOOD', '15000');
  await page.click('button[type=submit]');
  await page.waitForSelector('.toast:has-text("harga diperbarui")');
  await goTo(page, 'production');
  const val = await page.$eval('[name=product_id]', (sel) => [...sel.options].find((o) => /Pisang Keju Lumer/.test(o.text)).value);
  await page.selectOption('[name=product_id]', val);
  await page.fill('[name=quantity]', '10');
  await page.click('button[type=submit]');
  await page.waitForSelector('.toast:has-text("Stok sekarang 10")');
  await goTo(page, 'kasir');
  await page.click('[data-act="setChannel"][data-ch="OFFLINE"]');
  const card = await page.textContent('.pcard:has-text("Pisang Keju Lumer")');
  assert.match(card, /Mulai Rp 12\.000/);
  assert.match(card, /Stok 10/);
  await page.click('[data-act="setChannel"][data-ch="WHATSAPP"]');
  assert.match(await page.textContent('.pcard:has-text("Pisang Keju Lumer")'), /belum diatur/);
  assert.ok(await page.locator('.pcard:has-text("Pisang Keju Lumer") .add').isDisabled());
  await page.context().close();
});

test('pengeluaran & penyesuaian stok lewat form', async () => {
  const page = await open();
  await login(page);
  await goTo(page, 'expenses');
  await page.click('[data-act="nav"][data-to="expenseForm"] >> nth=0');
  await page.waitForSelector('form[data-submit="saveExpense"]');
  await page.selectOption('[name=category]', 'Packaging');
  await page.fill('[name=description]', 'Cup plastik');
  await page.fill('[name=amount]', '45000');
  assert.equal(await page.inputValue('[name=amount]'), '45.000');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-screen="expenses"] .list-item:has-text("Cup plastik")');
  await page.click('.bnav [data-tab="stock"]');
  await page.click('[data-act="stockMenu"] >> nth=0');
  await page.click('[data-act="stockAdjust"]');
  await page.fill('[name=quantity]', '3');
  await page.click('form[data-submit="adjustStock"] button[type=submit]');
  assert.match(await page.textContent('#form-err'), /Alasan/);
  await page.fill('[name=notes]', 'Stok opname');
  await page.click('form[data-submit="adjustStock"] button[type=submit]');
  await page.waitForSelector('.toast:has-text("Stok diperbarui")');
  await page.click('[data-act="stockMenu"] >> nth=0');
  await page.click('[data-act="stockHistory"]');
  await page.waitForSelector('.sheet .list-item:has-text("Stok opname")');
  await page.context().close();
});

test('form di dalam bottom sheet benar-benar tersubmit (kategori baru)', async () => {
  const page = await open();
  await login(page);
  await goTo(page, 'setCategories', { type: 'EXPENSE' });
  await page.click('[data-act="catEdit"]:not([data-id]) >> nth=0');
  await page.fill('.sheet [name=category_name]', 'Listrik');
  await page.click('.sheet button[type=submit]');
  await page.waitForSelector('[data-screen="setCategories"] .list-item:has-text("Listrik")');
  await page.context().close();
});

test('role STAFF: menu manajer terkunci dengan alasan, halaman admin ditolak', async () => {
  const page = await open();
  await login(page, 'kasir');
  await page.click('.bnav [data-tab="more"]');
  const locked = await page.locator('.menu-row[disabled]').count();
  assert.ok(locked >= 5);
  assert.deepEqual(await deadControls(page), []);
  await goTo(page, 'products');
  await page.waitForSelector('text=Akses dibatasi');
  await page.click('.bnav [data-tab="stock"]');
  await page.waitForSelector('[data-act="stockMenu"]');
  assert.equal(await page.locator('[data-to="production"]').count(), 0);
  await page.context().close();
});

test('state error + retry, dan fallback gambar rusak', async () => {
  const page = await open();
  await login(page);
  await openKasir(page);
  // Es Teler punya URL gambar rusak di data demo → fallback muncul
  await page.waitForSelector('.pcard:has-text("Es Teler") .ph-fallback');
  // Simulasikan server gagal untuk aksi "orders"
  await page.evaluate(() => {
    const real = window.__GAS.fns.api;
    window.__failOrders = true;
    window.__GAS.fns.api = function (a, p, t) { if (a === 'orders' && window.__failOrders) throw new Error('timeout simulasi'); return real(a, p, t); };
    // Pemuatan PERTAMA (belum ada data di memori/perangkat; buang hasil prefetch) → harus tampil state error.
    const S = window.__DF.S;
    Object.keys(S.data).forEach((k) => { if (k.indexOf('orders') === 0) delete S.data[k]; });
    Object.keys(localStorage).filter((k) => k.indexOf('df_dc|') === 0).forEach((k) => localStorage.removeItem(k));
  });
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.state.error:has-text("Gagal")');
  await page.evaluate(() => { window.__failOrders = false; });
  await page.click('[data-act="retry"]');
  await page.waitForSelector('.order-row');
  // Data SUDAH ada lalu penyegaran gagal → daftar lama tetap tampil + peringatan (tidak berubah jadi layar error).
  const before = await page.locator('.order-row').count();
  await page.evaluate(() => { window.__failOrders = true; Object.values(window.__DF.S.data).forEach((d) => { d.stale = true; }); });
  await page.click('.bnav [data-tab="dashboard"]');
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.toast:has-text("Gagal memperbarui")');
  assert.equal(await page.locator('.order-row').count(), before);
  assert.equal(await page.locator('.state.error').count(), 0);
  await page.context().close();
});

for (const vp of [{ w: 360, h: 800 }, { w: 390, h: 844 }, { w: 412, h: 915 }]) {
  test(`PRD 12.F ponsel ${vp.w}×${vp.h}: lebar penuh, kasir 1 kolom, KPI 2 kolom, nav tidak menutupi konten`, async () => {
    const page = await open({ context: { viewport: { width: vp.w, height: vp.h } } });
    await login(page);
    const appW = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().width);
    assert.equal(Math.round(appW), vp.w);
    const tops = await page.$$eval('.kpi', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(tops[0], tops[1]); assert.ok(tops[2] > tops[0]);
    await shot(page, String(vp.w), 'dashboard');
    await openKasir(page);
    const g = await page.locator('#kasir-grid').boundingBox();
    const c = await page.locator('#kasir-cart').boundingBox();
    assert.ok(c.y >= g.y + g.height - 1);
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.screen.has-nav')).paddingBottom));
    assert.ok(pad >= 64, 'konten harus memberi ruang untuk bottom nav');
    await shot(page, String(vp.w), 'kasir');
    const a = await layoutAudit(page);
    assert.ok(a.overflowX <= 0);
    await page.context().close();
  });
}

test('Chrome Android "Desktop Site" (viewport 980px, layar 412px): UI di-zoom dan tetap layout ponsel', async () => {
  const page = await open({ context: { viewport: { width: 980, height: 2178 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: false, hasTouch: true } });
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (!coarse) { test.skip('Chromium headless tidak mengemulasikan pointer:coarse di konteks ini'); await page.context().close(); return; }
  await login(page);
  const st = await page.evaluate(() => ({ cls: document.documentElement.className, zoom: getComputedStyle(document.documentElement).zoom }));
  assert.match(st.cls, /zoom-fix/);
  assert.ok(parseFloat(st.zoom) > 2);
  await openKasir(page);
  const navLeft = await page.evaluate(() => getComputedStyle(document.querySelector('.bnav')).bottom);
  assert.equal(navLeft, '0px', 'bottom nav tetap di bawah (bukan rail desktop)');
  await shot(page, 'desktop-site', 'kasir');
  await page.context().close();
});

test('tablet 820×1180 & desktop 1440×900: layout dua panel, rail navigasi, tanpa sidebar hitam', async () => {
  for (const [w, h, folder] of [[820, 1180, 'tablet'], [1440, 900, 'desktop']]) {
    const page = await open({ context: { viewport: { width: w, height: h }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } });
    await login(page);
    await shot(page, folder, 'dashboard');
    await openKasir(page);
    await shot(page, folder, 'kasir');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(bg, 'rgb(0, 0, 0)');
    if (w >= 960) {
      const g = await page.locator('#kasir-grid').boundingBox();
      const c = await page.locator('#kasir-cart').boundingBox();
      assert.ok(c.x > g.x + g.width - 1, 'desktop: keranjang di samping katalog');
    }
    assert.ok((await layoutAudit(page)).overflowX <= 0);
    await page.context().close();
  }
});
