/**
 * Test sprint 2: logo struk terpisah, branding login, edit/batal order dengan konfirmasi,
 * jumlah round-trip saat boot, dan layout responsif (360×800, 360×740, 390×844).
 *   node dev/build-dev.js && node --test --test-concurrency=1 tests/ui/sprint2.test.js
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
const URL_BASE = 'file://' + path.join(ROOT, 'dev', 'dist', 'index.html');
const FIX = path.join(ROOT, 'tests', 'fixtures');
const SHOTS = path.join(ROOT, 'screenshots', 'sprint2');
const IGNORED = [/status of 404/, /fonts\.googleapis|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|invalid\.example|net::ERR_|img\.test/i];

let browser;
test.before(async () => { require('../../dev/build-dev.js').build(); browser = await chromium.launch(); fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { if (browser) await browser.close(); });

function mobile(w = 390, h = 844) { return { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }; }

async function routeImages(page) {
  await page.route('https://drive.google.com/thumbnail**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const f = await page.evaluate((fid) => {
      const x = window.__GAS && window.__GAS.mock.driveFiles[fid];
      if (!x || x.trashed) return null;
      let bin = ''; for (let i = 0; i < x.bytes.length; i += 8192) bin += String.fromCharCode.apply(null, x.bytes.slice(i, i + 8192).map((b) => (b < 0 ? b + 256 : b)));
      return { b64: btoa(bin), mime: x.mime };
    }, id).catch(() => null);
    if (!f) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: f.mime, body: Buffer.from(f.b64, 'base64') });
  });
  await page.route('https://img.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(FIX, 'ikon.png')) }));
}
async function open(ctxOpts = mobile(), query = '?reset=1&latency=25') {
  const ctx = await browser.newContext(Object.assign({ locale: 'id-ID', timezoneId: 'Asia/Makassar' }, ctxOpts));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await routeImages(page);
  await page.goto(URL_BASE + query);
  return page;
}
async function login(page, user = 'admin', pass = 'admin123') {
  await page.waitForSelector('[data-screen="login"]');
  await page.fill('input[name=username]', user); await page.fill('input[name=password]', pass); await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
}
async function idle(page) {
  await page.waitForFunction(() => !document.querySelector('#app .state .spinner') && !document.querySelector('#app .skel') && !document.querySelector('.refresh-bar') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 });
  await page.waitForTimeout(60);
}
async function goTo(page, name, params) {
  await page.evaluate(([n, p]) => window.__DF.go(n, p || {}), [name, params]);
  await page.waitForSelector(`[data-screen="${name}"]`); await idle(page);
}
function db(page, sheet) { return page.evaluate((s) => { window.__GAS.Db.resetCache(); return window.__GAS.Db.all(s); }, sheet); }
async function stockOf(page, name) {
  return page.evaluate((n) => { const G = window.__GAS; G.Db.resetCache(); const p = G.Db.all('PRODUCTS').find((x) => x.product_name === n); return G.Db.all('STOCKS').find((s) => s.item_id === p.product_id).quantity; }, name);
}
/** Klik lalu tunggu toast BARU (toast lama dibersihkan agar tidak salah baca). */
async function clickAndToast(page, sel, text) {
  await page.evaluate(() => { document.getElementById('toast-root').innerHTML = ''; });
  await page.click(sel);
  await page.waitForSelector(`.toast:has-text("${text}")`);
}
async function upload(page, sel, fixture) {
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]);
  await ch.setFiles(path.join(FIX, fixture));
}
async function sellSago(page, method = 'QRIS') {
  await goTo(page, 'kasir');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await goTo(page, 'cart');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await page.click(`[data-act="payMethod"][data-m="${method}"]`);
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  return page.evaluate(() => window.__DF.S.stack[1].params.id);
}

/* ======================================================================= 1. Logo struk */

test('1. Logo struk: upload → pratinjau → simpan; terpisah dari logo login; dipakai struk layar/cetak/gambar; struk lama tetap; kembali ke default', async () => {
  const page = await open();
  await login(page);
  // logo login berbeda
  await goTo(page, 'setStore');
  await page.click('[data-act="imgUrl"][data-field="store_logo_url"]');
  await page.fill('#url-in', 'https://img.test/login-logo.png'); await page.click('[data-act="urlCheck"]');
  await page.waitForFunction(() => /valid/i.test(document.getElementById('url-msg').textContent));
  await page.click('[data-act="urlUse"]'); await clickAndToast(page, 'button[type=submit]', 'Pengaturan disimpan');
  // logo struk
  await goTo(page, 'setReceipt');
  assert.match(await page.textContent('[data-act="imgUpload"][data-field="receipt_logo_url"]'), /Upload Logo/);
  await upload(page, '[data-act="imgUpload"][data-field="receipt_logo_url"]', 'ikon.png');
  await page.waitForFunction(() => /terunggah/i.test(document.getElementById('img-receipt_logo_url-msg').textContent));
  await page.waitForFunction(() => { const i = document.querySelector('#img-receipt_logo_url-prev img'); return i && i.naturalWidth > 0; });
  assert.equal(await page.locator('#img-receipt_logo_url-prev img').evaluate((i) => getComputedStyle(i).objectFit), 'contain');
  await page.screenshot({ path: path.join(SHOTS, 'pengaturan_logo_struk.png'), fullPage: true });
  await clickAndToast(page, 'form[data-submit="setReceipt"] button[type=submit]', 'Pengaturan disimpan');
  const s1 = await page.evaluate(() => window.__DF.S.settings);
  const logo1 = s1.receipt.receipt_logo_url;
  assert.match(logo1, /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
  assert.equal(s1.store.store_logo_url, 'https://img.test/login-logo.png', 'logo login tidak ikut berubah');
  // transaksi A memakai logo struk 1
  const orderA = await sellSago(page);
  const srcA = await page.getAttribute('.receipt .rcpt-logo', 'src');
  assert.equal(srcA.split('&')[0], logo1.split('&')[0]);
  await page.waitForFunction(() => { const i = document.querySelector('.receipt img.rcpt-logo'); return i && i.naturalWidth > 0; });
  // cetak memakai markup struk yang sama
  await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-root').innerHTML; }; });
  await page.click('[data-act="printReceipt"]');
  await page.waitForFunction(() => !!window.__printed);
  assert.ok((await page.evaluate(() => window.__printed)).includes(logo1.split('&')[0]));
  // gambar struk: logo diambil sebagai data URL dari server (tanpa masalah CORS)
  await page.evaluate(() => { window.__apiLog = []; });
  await page.click('[data-act="shareReceipt"]');
  await page.waitForSelector('.sheet .receipt-img');
  assert.ok((await page.evaluate(() => window.__apiLog.map((x) => x.action))).includes('receiptLogo'));
  await page.click('.sheet [data-act="closeSheet"]');
  // ganti logo struk → transaksi B pakai logo 2, transaksi A tetap logo 1
  await goTo(page, 'setReceipt');
  assert.match(await page.textContent('[data-act="imgUpload"][data-field="receipt_logo_url"]'), /Ganti Logo/);
  await upload(page, '[data-act="imgUpload"][data-field="receipt_logo_url"]', 'produk.jpg');
  await page.waitForFunction(() => /terunggah/i.test(document.getElementById('img-receipt_logo_url-msg').textContent));
  await clickAndToast(page, 'form[data-submit="setReceipt"] button[type=submit]', 'Pengaturan disimpan');
  const logo2 = await page.evaluate(() => window.__DF.S.settings.receipt.receipt_logo_url);
  assert.notEqual(logo2, logo1);
  await sellSago(page);
  assert.equal((await page.getAttribute('.receipt .rcpt-logo', 'src')).split('&')[0], logo2.split('&')[0]);
  await goTo(page, 'receipt', { id: orderA });
  assert.equal((await page.getAttribute('.receipt .rcpt-logo', 'src')).split('&')[0], logo1.split('&')[0], 'struk lama tetap memakai logo saat transaksi');
  // reload: persisten
  await page.goto(URL_BASE + '?latency=25');
  await page.waitForSelector('[data-screen="dashboard"] .kpi');
  assert.equal(await page.evaluate(() => window.__DF.S.settings.receipt.receipt_logo_url), logo2);
  // kembalikan ke default → mengikuti logo login
  await goTo(page, 'setReceipt');
  await page.click('[data-act="imgRemove"][data-field="receipt_logo_url"]');
  assert.match(await page.textContent('#img-receipt_logo_url-msg'), /default/);
  await clickAndToast(page, 'form[data-submit="setReceipt"] button[type=submit]', 'Pengaturan disimpan');
  assert.equal(await page.evaluate(() => window.__DF.S.settings.receipt.receipt_logo_effective), 'https://img.test/login-logo.png');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

/* ======================================================================= 2. Branding login */

test('2. Login: area branding hanya logo (default & kustom), rasio terjaga, tanpa nama/tagline terlihat', async () => {
  const page = await open(mobile(360, 800));
  const vis = () => page.evaluate(() => {
    const out = []; const w = document.createTreeWalker(document.querySelector('.login .brand'), NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const r = w.currentNode.parentElement.getBoundingClientRect(); if (w.currentNode.textContent.trim() && r.width > 2) out.push(w.currentNode.textContent.trim()); }
    return out;
  });
  assert.deepEqual(await vis(), []);
  assert.equal(await page.locator('.login .brand svg.brand-logo').count(), 1, 'tanpa logo kustom: logo bawaan');
  assert.ok(await page.locator('text=Masuk ke Aplikasi').isVisible(), 'judul form tetap ada');
  await page.screenshot({ path: path.join(SHOTS, 'login_default_360.png') });
  // logo kustom (persegi 512×512) → tetap persegi, contain
  await page.evaluate(() => {
    const G = window.__GAS; const t = G.fns.api('login', { username: 'admin', password: 'admin123' }).data.token;
    G.fns.api('saveSettings', { values: { store_logo_url: 'https://img.test/logo.png' } }, t);
    G.fns.api('logout', {}, t);
    window.__devPersist();
  });
  await page.goto(URL_BASE + '?latency=25');
  await page.waitForFunction(() => { const i = document.querySelector('.login img.brand-logo'); return i && i.naturalWidth > 0; });
  const box = await page.locator('.login img.brand-logo').evaluate((i) => {
    const r = i.getBoundingClientRect(); return { w: r.width, h: r.height, fit: getComputedStyle(i).objectFit, nw: i.naturalWidth, nh: i.naturalHeight };
  });
  assert.equal(box.fit, 'contain');
  assert.ok(Math.abs(box.w / box.h - box.nw / box.nh) < 0.02, 'rasio asli dipertahankan');
  assert.ok(box.w <= 260 && box.w >= 150, 'ukuran seimbang di ponsel: ' + box.w);
  assert.deepEqual(await vis(), []);
  await page.screenshot({ path: path.join(SHOTS, 'login_logo_360.png') });
  await page.context().close();
});

/* ======================================================================= 3. Edit & batal order */

test('3a. Order belum dibayar: menu ⋮, dialog konfirmasi lengkap, Batal tidak mengubah apa pun, edit dengan keranjang tersimpan', async () => {
  const page = await open();
  await login(page);
  // keranjang yang sedang berjalan harus aman
  await goTo(page, 'kasir');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await goTo(page, 'orders');
  await page.selectOption('[data-change="ordersPeriod"]', '7d');
  await idle(page);
  await page.click('[data-act="ordersStatus"][data-s="DRAFT"]');
  const draftRow = page.locator('.order-wrap').first();
  const num = (await draftRow.locator('.no').textContent()).trim();
  await draftRow.locator('[data-act="orderMenu"]').click();
  await page.waitForSelector('.sheet [data-act="editOrder"]');
  assert.equal(await page.locator('.sheet [data-act="cancelOrder"]').count(), 1);
  // menekan ⋮ tidak mengubah apa pun
  let orders = await db(page, 'ORDERS');
  const draft = orders.find((o) => o.order_number === num);
  assert.equal(draft.status, 'DRAFT');
  await page.click('.sheet [data-act="cancelOrder"]');
  await page.waitForSelector('.sheet:has-text("Batalkan order yang belum dibayar?")');
  const dlg = await page.textContent('.sheet');
  assert.ok(dlg.includes(num)); assert.match(dlg, /Es Teler/); assert.match(dlg, /Rp 3\d\.000/); assert.match(dlg, /Draft/); assert.match(dlg, /stok tidak berubah/);
  assert.equal(await page.textContent('[data-act="confirmYes"]'), 'Batalkan Order');
  await page.screenshot({ path: path.join(SHOTS, 'konfirmasi_batal_draft.png') });
  await page.click('[data-act="confirmNo"]');
  assert.equal((await db(page, 'ORDERS')).find((o) => o.order_number === num).status, 'DRAFT', 'Batal = tidak ada perubahan');
  // edit
  await page.locator('.order-wrap').first().locator('[data-act="orderMenu"]').click();
  await page.click('.sheet [data-act="editOrder"]');
  await page.waitForSelector('[data-screen="cart"] .info-box:has-text("Mode edit order")');
  assert.match(await page.textContent('.hdr-title'), new RegExp('Edit ' + num));
  await page.click('[data-act="lineQty"][data-d="1"] >> nth=0'); // Es Teler 2 → 3
  await goTo(page, 'kasir');
  assert.match(await page.textContent('[data-screen="kasir"]'), new RegExp('Menambah item ke order ' + num));
  await page.click('.pcard-main[aria-label="Detail Banana Bites"]');
  await page.click('.topping-row:has-text("Oreo") input');
  await page.click('[data-act="pdAdd"]');
  await goTo(page, 'cart');
  await page.click('[data-act="saveEdit"]');
  await page.waitForSelector('.sheet:has-text("Simpan perubahan order?")');
  await page.click('[data-act="confirmYes"]');
  await page.waitForSelector('[data-screen="order"] .kv-grid');
  const detail = await page.textContent('[data-screen="order"]');
  assert.match(detail, /Es Teler/); assert.match(detail, /Banana Bites - Oreo/); assert.match(detail, /Diedit/);
  const updated = (await db(page, 'ORDERS')).find((o) => o.order_number === num);
  assert.equal(updated.total, 3 * 16000 + 13000, 'Es Teler ×3 (WhatsApp 16.000) + Banana Bites Oreo (11.000+2.000)');
  assert.equal(updated.revision, 1);
  // keranjang sebelum edit kembali utuh
  assert.deepEqual(await page.evaluate(() => window.__DF.S.cart.map((l) => [l.qty, l.variant_ids.length])), [[1, 0]]);
  assert.equal(await page.evaluate(() => window.__DF.S.editing), null);
  await page.screenshot({ path: path.join(SHOTS, 'detail_setelah_edit.png'), fullPage: true });
  // lanjut bayar order hasil edit → stok berkurang sesuai revisi terbaru
  const bb = await stockOf(page, 'Banana Bites');
  await page.click('[data-act="resumeDraft"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await page.click('[data-act="payMethod"][data-m="QRIS"]');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  assert.equal(await stockOf(page, 'Banana Bites'), bb - 1);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('3b. Order sudah dibayar: tidak bisa diedit; batal butuh alasan; stok kembali sekali; koreksi memuat ulang item; CANCELLED tidak diproses ulang', async () => {
  const page = await open();
  await login(page);
  const s0 = await stockOf(page, 'Sago');
  const id = await sellSago(page);
  assert.equal(await stockOf(page, 'Sago'), s0 - 1);
  await goTo(page, 'order', { id });
  assert.equal(await page.locator('[data-act="editOrder"]').count(), 0, 'tidak ada edit untuk order dibayar');
  await page.click('[data-act="correctOrder"]');
  await page.waitForSelector('.sheet:has-text("Batalkan transaksi yang sudah dibayar?")');
  const dlg = await page.textContent('.sheet');
  assert.match(dlg, /DIKEMBALIKAN/); assert.match(dlg, /stok item dikembalikan satu kali/); assert.match(dlg, /Selesai/);
  await page.click('[data-act="confirmYes"]');
  assert.match(await page.textContent('#cf-err'), /wajib/);
  await page.fill('#cf-input', 'Salah channel');
  await page.click('[data-act="confirmYes"]');
  await page.waitForSelector('[data-screen="cart"]');
  assert.equal(await stockOf(page, 'Sago'), s0, 'stok kembali tepat sekali');
  assert.match(await page.textContent('[data-screen="cart"]'), /Sago/, 'koreksi: item dimuat sebagai order baru');
  const mv = (await db(page, 'STOCK_MOVEMENTS')).filter((m) => m.reference_id === id && m.movement_type === 'CANCEL_REVERSE');
  assert.equal(mv.length, 1);
  const pay = (await db(page, 'PAYMENTS')).find((p) => p.order_id === id);
  assert.equal(pay.status, 'REFUNDED');
  // CANCELLED: menu hanya lihat
  await goTo(page, 'orders');
  await page.click('[data-act="ordersStatus"][data-s="CANCELLED"]');
  await page.locator('.order-wrap').first().locator('[data-act="orderMenu"]').click();
  await page.waitForSelector('.sheet:has-text("tidak bisa diproses ulang")');
  assert.equal(await page.locator('.sheet [data-act="cancelOrder"], .sheet [data-act="editOrder"], .sheet [data-act="resumeDraft"]').count(), 0);
  // STAFF tidak bisa membatalkan transaksi dibayar dari menu
  await page.context().close();
  const p2 = await open(mobile(), '?latency=25');
  await login(p2, 'kasir', 'kasir123');
  await goTo(p2, 'orders');
  await p2.click('[data-act="ordersStatus"][data-s="COMPLETED"]');
  await p2.locator('.order-wrap').first().locator('[data-act="orderMenu"]').click();
  await p2.waitForSelector('.sheet [data-act="viewReceipt"]');
  assert.equal(await p2.locator('.sheet [data-act="cancelOrder"]').count(), 0);
  await p2.context().close();
});

/* ======================================================================= 4. Performa */

test('4. Boot: login tanpa panggilan API; reload dengan sesi = 1 panggilan (bootstrap); tidak ada panggilan ganda', async () => {
  const page = await open();
  assert.deepEqual(await page.evaluate(() => (window.__apiLog || []).map((x) => x.action)), [], 'layar login tampil tanpa round-trip');
  await login(page);
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__apiLog.map((x) => x.action));
  assert.deepEqual(calls.slice(0, 2), ['login', 'bootstrap']);
  // v1.4: setelah Beranda tampil, tab Order & Stok diambil di belakang (sekali saja) agar terbuka tanpa menunggu.
  assert.deepEqual(calls.slice(2).sort(), ['orders', 'stock']);
  // Buka ulang dengan server lambat (1,5 dtk): Beranda tampil dari data terakhir di perangkat SEBELUM server menjawab.
  const t0 = Date.now();
  await page.goto(URL_BASE + '?latency=1500');
  await page.waitForSelector('[data-screen="dashboard"] .kpi');
  const shown = Date.now() - t0;
  assert.ok(shown < 1200, 'Beranda tampil tanpa menunggu server: ' + shown + ' ms');
  await page.click('.bnav [data-tab="kasir"]');
  await page.waitForSelector('#kasir-grid .pcard');
  await page.waitForTimeout(1900);
  assert.deepEqual(await page.evaluate(() => window.__apiLog.map((x) => x.action)), ['bootstrap'], 'katalog & dashboard ikut bootstrap; kasir tidak memanggil ulang');
  await page.context().close();
});

/* ======================================================================= 5. Responsif */

const SCREENS = ['dashboard', 'kasir', 'products', 'orders', 'stock', 'settings', 'more', 'setDevice', 'reportSales'];
for (const [w, h] of [[360, 800], [360, 740], [390, 844]]) {
  test(`5. Responsif ${w}×${h}: tanpa bidang kosong, nav menempel di bawah, konten terakhir tidak tertutup`, async () => {
    const page = await open(mobile(w, h));
    // login: latar coklat sampai bawah layar
    const loginBottom = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    assert.equal(loginBottom, 'rgb(21, 17, 14)', 'latar dokumen login = gelap seperti panel login (tidak putih)');
    const shot = await page.screenshot();
    // baca piksel lewat canvas di Chromium (tanpa dependensi sharp)
    const info = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const at = (y) => Array.from(ctx.getImageData(4, y, 1, 1).data.slice(0, 3));
      return { height: img.height, px: { [img.height - 2]: at(img.height - 2), [img.height - 30]: at(img.height - 30) } };
    }, shot.toString('base64'));
    for (const y of [info.height - 2, info.height - 30]) {
      const [r, g, b] = info.px[y];
      assert.ok(r < 150 && g < 120 && b < 100, `piksel bawah login harus coklat, dapat ${r},${g},${b} @${y}`);
    }
    await login(page);
    for (const sc of SCREENS) {
      await goTo(page, sc);
      const m = await page.evaluate(() => {
        const nav = document.querySelector('.bnav').getBoundingClientRect();
        window.scrollTo(0, document.documentElement.scrollHeight);
        const els = Array.from(document.querySelectorAll('main.content > *')).filter((e) => e.getBoundingClientRect().height > 0);
        const last = els[els.length - 1];
        const lastBottom = last ? last.getBoundingClientRect().bottom : 0;
        const navTop = document.querySelector('.bnav').getBoundingClientRect().top;
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        const docW = document.documentElement.scrollWidth;
        window.scrollTo(0, 0);
        return { navBottom: nav.bottom, navH: nav.height, vh: window.innerHeight, lastBottom, navTop, htmlBg, docW, vw: window.innerWidth,
          appMin: document.getElementById('app').getBoundingClientRect().height };
      });
      assert.equal(Math.round(m.navBottom), m.vh, `${sc}: nav menempel di tepi bawah`);
      assert.ok(m.lastBottom <= m.navTop + 1, `${sc}: konten terakhir (${m.lastBottom}) tertutup nav (${m.navTop})`);
      assert.ok(m.docW <= m.vw, `${sc}: overflow horizontal`);
      assert.ok(m.appMin >= m.vh - 1, `${sc}: app mengisi tinggi layar (${m.appMin} < ${m.vh})`);
      assert.notEqual(m.htmlBg, 'rgb(0, 0, 0)');
    }
    await goTo(page, 'products');
    await page.screenshot({ path: path.join(SHOTS, `produk_${w}x${h}.png`) });
    // ubah ukuran viewport saat berjalan → layout menyesuaikan
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(200);
    assert.equal(Math.round(await page.evaluate(() => document.querySelector('.bnav').getBoundingClientRect().bottom)), 915);
    assert.equal(Math.round(await page.evaluate(() => document.getElementById('app').getBoundingClientRect().width)), 412);
    // sheet dengan form: tetap bisa discroll, tidak melebihi tinggi layar
    await page.setViewportSize({ width: w, height: Math.round(h * 0.55) }); // simulasi keyboard terbuka (resizes-content)
    await goTo(page, 'stock');
    await page.click('[data-act="stockMenu"] >> nth=0');
    await page.click('[data-act="stockAdjust"]');
    await page.waitForTimeout(400); // tunggu animasi masuk sheet selesai
    const sh = await page.evaluate(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); return { top: s.top, bottom: s.bottom, vh: window.innerHeight }; });
    assert.ok(sh.top >= 0 && sh.bottom <= sh.vh + 1, 'sheet muat di layar saat keyboard terbuka');
    await page.click('form[data-submit="adjustStock"] button[type=submit]');
    assert.ok(await page.locator('form[data-submit="adjustStock"] button[type=submit]').isVisible());
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

test('6. Tombol kembali Android: menutup sheet / mundur layar, tidak pernah keluar dari aplikasi saat ada yang bisa ditutup', async () => {
  const page = await open();
  await login(page);
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.order-wrap');
  await page.locator('.order-wrap').first().locator('[data-act="orderMenu"]').click();
  await page.waitForSelector('.sheet');
  await page.click('.sheet [data-act="openOrder"]');
  await page.waitForSelector('[data-screen="order"] .kv-grid');
  // menu → dialog → batal (alur yang sebelumnya membuat halaman keluar)
  await page.click('[data-act="cancelOrder"]');
  await page.waitForSelector('[data-act="confirmNo"]');
  await page.click('[data-act="confirmNo"]');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => !!window.__GAS), 'masih di aplikasi setelah Batal');
  assert.equal(await page.locator('[data-screen="order"]').count(), 1);
  // tombol kembali perangkat: tutup sheet
  await page.click('[data-act="viewReceipt"]').catch(() => {});
  await goTo(page, 'order', { id: await page.evaluate(() => window.__DF.S.stack[window.__DF.S.stack.length - 1].params.id) });
  await page.evaluate(() => window.__DF.ACTIONS.orderMenu({ dataset: { id: window.__DF.S.stack[window.__DF.S.stack.length - 1].params.id } }));
  await page.waitForSelector('.sheet');
  await page.goBack();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.sheet').count(), 0, 'kembali = tutup sheet');
  assert.ok(await page.evaluate(() => !!window.__GAS));
  // kembali bertahap sampai Beranda, selalu tetap di aplikasi
  for (let i = 0; i < 4; i++) {
    const onDash = await page.locator('[data-screen="dashboard"]').count();
    if (onDash) break;
    await page.goBack();
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => !!window.__GAS), 'tetap di aplikasi pada langkah ' + i);
  }
  assert.equal(await page.locator('[data-screen="dashboard"]').count(), 1);
  await page.context().close();
});
