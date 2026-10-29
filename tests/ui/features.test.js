/**
 * Test fitur v1.1: akses dashboard, struk gambar + WhatsApp, upload/URL foto, ikon channel, label DEMO,
 * dan jaminan tidak ada data dummy saat API gagal.
 *   node dev/build-dev.js && node --test --test-concurrency=1 tests/ui/features.test.js
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
const SHOTS = path.join(ROOT, 'screenshots', 'v1.1');
// 404 = foto lama yang sudah dipindah ke Trash masih diminta oleh tampilan sebelum re-render (fallback menangani).
const IGNORED = [/status of 404/, /fonts\.googleapis|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|invalid\.example|net::ERR_|img\.test/i];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];

let browser;
test.before(async () => { require('../../dev/build-dev.js').build(); browser = await chromium.launch(); fs.mkdirSync(SHOTS, { recursive: true }); });
test.after(async () => { if (browser) await browser.close(); });

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

/** Gambar Drive tiruan: URL thumbnail dilayani dari file yang tersimpan di DriveApp mock. */
async function routeImages(page) {
  await page.route('https://drive.google.com/thumbnail**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const b64 = await page.evaluate((fid) => {
      const f = window.__GAS && window.__GAS.mock.driveFiles[fid];
      if (!f || f.trashed) return null;
      let bin = '';
      for (let i = 0; i < f.bytes.length; i += 8192) bin += String.fromCharCode.apply(null, f.bytes.slice(i, i + 8192).map((b) => (b < 0 ? b + 256 : b)));
      return { b64: btoa(bin), mime: f.mime };
    }, id).catch(() => null);
    if (!b64) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: b64.mime, body: Buffer.from(b64.b64, 'base64') });
  });
  await page.route('https://img.test/**', (route) => {
    const u = route.request().url();
    if (u.endsWith('.png')) return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(FIX, 'ikon.png')) });
    if (u.endsWith('.jpg')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(FIX, 'produk.jpg')) });
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>halaman web</html>' });
  });
}

async function open(ctxOpts = MOBILE, query = '?reset=1&latency=30', existingCtx) {
  const ctx = existingCtx || await browser.newContext(Object.assign({ locale: 'id-ID', timezoneId: 'Asia/Makassar' }, ctxOpts));
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
  await page.fill('input[name=username]', user); await page.fill('input[name=password]', pass);
  await page.click('#login-btn');
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
async function payQris(page, productLabel = 'Tambah Sago') {
  await goTo(page, 'kasir');
  await page.waitForSelector('#kasir-grid .pcard');
  await page.click(`[data-act="quickAdd"][aria-label="${productLabel}"]`);
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await page.click('[data-act="payMethod"][data-m="CASH"]');
  await page.click('[data-act="payQuick"] >> nth=1');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt');
}
function db(page, sheet) { return page.evaluate((s) => { window.__GAS.Db.resetCache(); return window.__GAS.Db.all(s); }, sheet); }

/* ======================================================================= 1. Dashboard */

test('1. Beranda bisa dibuka 1× tap dari setiap layar non-transaksi; status aktif jelas; keranjang tidak hilang', async () => {
  for (const [label, opts] of [['ponsel', MOBILE], ['desktop', DESKTOP]]) {
    const page = await open(opts);
    await login(page);
    // isi keranjang dulu: state transaksi yang belum selesai harus bertahan
    await goTo(page, 'kasir');
    await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
    const screens = ['kasir', 'orders', 'stock', 'more', 'products', 'variants', 'prices', 'production', 'expenses', 'expenseForm', 'productForm',
      'reports', 'reportSales', 'reportProducts', 'reportFinance', 'settings', 'setStore', 'setIcons', 'setData', 'setChannels', 'setPayments', 'setReceipt', 'setUsers', 'setBackup', 'setPassword'];
    for (const sc of screens) {
      await goTo(page, sc);
      const btn = page.locator('.bnav [data-tab="dashboard"]');
      assert.equal(await btn.count(), 1, `${label}/${sc}: tombol Beranda harus ada`);
      const box = await btn.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${label}/${sc}: target Beranda ${box.width}x${box.height}`);
      await btn.click();
      await page.waitForSelector('[data-screen="dashboard"] .kpi');
      assert.equal(await page.getAttribute('.bnav [data-tab="dashboard"]', 'aria-current'), 'page');
    }
    // dari struk (setelah bayar) juga bisa
    await goTo(page, 'cart');
    assert.equal(await page.locator('.bnav').count(), 0, 'keranjang: alur transaksi tanpa bottom nav');
    assert.match(await page.textContent('[data-screen="cart"]'), /Sago/, 'keranjang tidak hilang setelah pindah-pindah layar');
    await page.context().close();
  }
});

test('1b. Dashboard gagal dimuat → pesan error + Coba lagi, tanpa angka palsu', async () => {
  const page = await open();
  await page.evaluate(() => {
    const real = window.__GAS.fns.api; window.__failDash = true;
    window.__GAS.fns.api = (a, p, t) => {
      if (a === 'dashboard' && window.__failDash) throw new Error('server sibuk (simulasi)');
      const r = real(a, p, t);
      // bootstrap juga memuat dashboard: simulasikan bagian itu gagal (server mengisi dashboard_error)
      if (a === 'bootstrap' && window.__failDash && r.ok && r.data.session) { r.data.dashboard = null; r.data.dashboard_error = 'server sibuk (simulasi)'; }
      return r;
    };
  });
  await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin123'); await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .state.error');
  assert.equal(await page.locator('.kpi').count(), 0);
  assert.match(await page.textContent('.state.error'), /server sibuk/);
  await page.evaluate(() => { window.__failDash = false; });
  await page.click('[data-act="retry"]');
  await page.waitForSelector('[data-screen="dashboard"] .kpi');
  await page.context().close();
});

/* ======================================================================= 2. Struk gambar */

test('2. Struk → gambar PNG valid & terbaca dari data transaksi tersimpan; fallback WhatsApp bila share file tidak didukung', async () => {
  const page = await open();
  await login(page);
  await payQris(page);
  // ubah state browser: gambar harus tetap memakai data server
  await page.evaluate(() => { const k = Object.keys(window.__DF.S.data).find((x) => x.startsWith('order|')); window.__DF.S.data[k].value.total = 1; });
  await page.evaluate(() => { delete navigator.canShare; navigator.canShare = undefined; });
  await page.click('[data-act="shareReceipt"]');
  await page.waitForSelector('.sheet .receipt-img');
  const info = await page.evaluate(async () => {
    const img = document.querySelector('.sheet .receipt-img');
    const buf = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    return { w: img.naturalWidth, h: img.naturalHeight, sig: Array.from(buf.slice(0, 4)), size: buf.length };
  });
  assert.deepEqual(info.sig, PNG_SIG, 'file harus PNG');
  assert.equal(info.w, 1200, 'lebar 600 px logis × 2 (tajam)');
  assert.ok(info.h > 1200 && info.size > 20000);
  // tombol jelas berbeda & fallback
  assert.ok(await page.locator('[data-act="shareImage"]').isDisabled());
  assert.match(await page.getAttribute('[data-act="shareImage"]', 'title'), /tidak mendukung/);
  assert.match(await page.textContent('.sheet .info-box'), /Unduh gambar.*Buka WhatsApp.*lampirkan/s);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet a:has-text("Unduh gambar")')]);
  assert.match(dl.suggestedFilename(), /^Struk-TRX-\d{8}-\d{4}\.png$/);
  const file = await dl.path();
  assert.deepEqual([...fs.readFileSync(file).subarray(0, 4)], PNG_SIG);
  fs.copyFileSync(file, path.join(SHOTS, 'struk_contoh.png'));
  await page.fill('#wa-num', '0812-3456-7890');
  const href = await page.getAttribute('#wa-link', 'href');
  assert.match(href, /^https:\/\/wa\.me\/6281234567890\?text=/);
  const order = (await db(page, 'ORDERS')).filter((o) => o.status === 'COMPLETED').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  assert.ok(decodeURIComponent(href).includes(order.order_number));
  assert.ok(decodeURIComponent(href).includes('Rp 15.000'), 'caption memakai total tersimpan, bukan state browser');
  await page.screenshot({ path: path.join(SHOTS, 'kirim_struk_fallback.png') });
  await page.context().close();
});

test('2b. Browser yang mendukung berbagi file: navigator.share dipanggil dengan file PNG; UI tidak mengklaim "terkirim"', async () => {
  const page = await open();
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = (d) => { window.__shared = { n: d.files.length, type: d.files[0].type, name: d.files[0].name, size: d.files[0].size, text: d.text }; return Promise.resolve(); };
  });
  await page.goto(URL_BASE + '?latency=30');
  await login(page);
  await payQris(page);
  await page.click('[data-act="shareReceipt"]');
  await page.waitForSelector('.sheet .receipt-img');
  assert.equal(await page.locator('[data-act="shareImage"]').isDisabled(), false);
  await page.click('[data-act="shareImage"]');
  await page.waitForSelector('.toast:has-text("Gambar diteruskan")');
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.n, 1); assert.equal(shared.type, 'image/png'); assert.match(shared.name, /^Struk-TRX-.*\.png$/);
  const toastText = await page.textContent('.toast:has-text("Gambar diteruskan")');
  assert.doesNotMatch(toastText, /terkirim(?! di)/i);
  assert.match(toastText, /Pastikan pesan terkirim/);
  await page.context().close();
});

/* ======================================================================= 3. Foto: upload & URL */

async function uploadVia(page, buttonSelector, fixture) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(buttonSelector)]);
  await chooser.setFiles(path.join(FIX, fixture));
}

for (const [label, opts] of [['ponsel', MOBILE], ['desktop', DESKTOP]]) {
  test(`3. Upload foto produk dari ${label}: pratinjau, tersimpan di Drive, tampil di kasir & tetap ada setelah reload`, async () => {
    const page = await open(opts);
    await login(page);
    await goTo(page, 'productForm', { id: (await db(page, 'PRODUCTS')).find((p) => p.product_name === 'Sago').product_id });
    // file palsu ditolak
    await uploadVia(page, '[data-act="imgUpload"]', 'palsu.png');
    await page.waitForFunction(() => /gagal/i.test(document.getElementById('img-image_url-msg').textContent));
    // file asli
    await uploadVia(page, '[data-act="imgUpload"]', 'produk.jpg');
    await page.waitForFunction(() => /terunggah/i.test(document.getElementById('img-image_url-msg').textContent));
    const url = await page.inputValue('input[name=image_url]');
    assert.match(url, /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
    await page.waitForFunction(() => { const i = document.querySelector('#img-image_url-prev img'); return i && i.complete && i.naturalWidth > 0; });
    await page.selectOption('[data-change="imgPosition"]', 'top');
    await page.click('button[type=submit]');
    await page.waitForSelector('.toast:has-text("Produk disimpan")');
    const media = await db(page, 'MEDIA');
    assert.equal(media.filter((m) => m.status === 'ACTIVE').length, 1);
    const fid = media[0].file_id;
    const f = await page.evaluate((id) => window.__GAS.mock.driveFiles[id], fid);
    assert.equal(f.sharing, 'ANYONE_WITH_LINK:VIEW');
    // reload: data & gambar persisten
    await page.goto(URL_BASE + '?latency=30');
    await page.waitForSelector('[data-screen="dashboard"]');
    await goTo(page, 'kasir');
    const img = page.locator('.pcard:has-text("Sago") .ph img');
    await page.waitForFunction(() => { const i = document.querySelector('.pcard-main[aria-label="Detail Sago"] img'); return i && i.complete && i.naturalWidth > 0; });
    assert.equal(await img.getAttribute('src'), url.replace('sz=w2000', 'sz=w480'), 'kartu kasir meminta ukuran 480 px, bukan 2000 px');
    assert.equal(await img.evaluate((i) => getComputedStyle(i).objectFit), 'cover');
    assert.equal(await img.evaluate((i) => getComputedStyle(i).objectPosition), '50% 15%');
    await page.screenshot({ path: path.join(SHOTS, `kasir_foto_${label}.png`) });
    // ganti foto: file lama diarsipkan
    await goTo(page, 'productForm', { id: (await db(page, 'PRODUCTS')).find((p) => p.product_name === 'Sago').product_id });
    await uploadVia(page, '[data-act="imgUpload"]', 'besar.png');
    await page.waitForFunction(() => /terunggah/i.test(document.getElementById('img-image_url-msg').textContent));
    await page.click('button[type=submit]');
    await page.waitForSelector('.toast:has-text("Produk disimpan") >> nth=-1');
    await page.waitForFunction(() => !document.querySelector('[data-screen="productForm"]'));
    const after = await db(page, 'MEDIA');
    assert.equal(after.find((m) => m.file_id === fid).status, 'ARCHIVED');
    const big = after.find((m) => m.status === 'ACTIVE');
    const dims = await page.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = u; }), big.url);
    assert.deepEqual(dims, [1600, 1000], 'gambar 3200×2000 diperkecil proporsional ke 1600 px');
    // hapus foto → fallback rapi
    await goTo(page, 'productForm', { id: (await db(page, 'PRODUCTS')).find((p) => p.product_name === 'Sago').product_id });
    await page.click('[data-act="imgRemove"]');
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-screen="productForm"]'));
    await goTo(page, 'kasir');
    assert.equal(await page.locator('.pcard:has-text("Sago") .ph-fallback').count(), 1);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

test('3b. URL foto: http ditolak, halaman web ditolak, gambar valid → pratinjau; latar & logo login tampil setelah reload', async () => {
  const page = await open();
  await login(page);
  await goTo(page, 'setStore');
  await page.click('[data-act="imgUrl"][data-field="login_background_url"]');
  await page.fill('#url-in', 'http://img.test/a.jpg'); await page.click('[data-act="urlCheck"]');
  assert.match(await page.textContent('#url-msg'), /https/);
  await page.fill('#url-in', 'https://img.test/halaman'); await page.click('[data-act="urlCheck"]');
  await page.waitForFunction(() => /gagal dimuat|bukan gambar/i.test(document.getElementById('url-msg').textContent));
  assert.ok(await page.locator('[data-act="urlUse"]').isDisabled(), 'tidak bisa dipakai sebelum valid');
  await page.fill('#url-in', 'https://img.test/latar.jpg'); await page.click('[data-act="urlCheck"]');
  await page.waitForFunction(() => /valid/i.test(document.getElementById('url-msg').textContent));
  await page.click('[data-act="urlUse"]');
  await uploadVia(page, '[data-act="imgUpload"][data-field="store_logo_url"]', 'ikon.png');
  await page.waitForFunction(() => /terunggah/i.test(document.getElementById('img-store_logo_url-msg').textContent));
  assert.equal(await page.locator('#img-store_logo_url-prev img').evaluate((i) => getComputedStyle(i).objectFit), 'contain');
  await page.click('button[type=submit]');
  await page.waitForSelector('.toast:has-text("Pengaturan disimpan")');
  // logout → halaman login memakai foto & logo baru
  await page.evaluate(() => { localStorage.removeItem('df_token'); });
  await page.goto(URL_BASE + '?latency=30');
  await page.waitForSelector('[data-screen="login"] .bgimg');
  assert.equal(await page.getAttribute('.login .bgimg', 'src'), 'https://img.test/latar.jpg');
  const visibleText = await page.evaluate(() => {
    const out = []; const w = document.createTreeWalker(document.querySelector('.login .brand'), NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const el = w.currentNode.parentElement; const r = el.getBoundingClientRect(); if (w.currentNode.textContent.trim() && r.width > 2 && r.height > 2) out.push(w.currentNode.textContent.trim()); }
    return out;
  });
  assert.deepEqual(visibleText, [], 'area branding hanya gambar logo (tanpa nama/tagline terlihat)');
  await page.waitForFunction(() => { const i = document.querySelector('.login img.brand-logo'); return i && i.naturalWidth > 0; });
  await page.screenshot({ path: path.join(SHOTS, 'login_dengan_foto.png') });
  await page.context().close();
});

/* ======================================================================= 4. DEMO */

test('4. Label DEMO tidak muncul di UI operasional meski data contoh terpasang; status hanya di Pengaturan admin', async () => {
  const page = await open();
  assert.doesNotMatch(await page.textContent('#app'), /\bDEMO\b|Mode Demo|Dummy|Sample/i);
  await login(page);
  const s = await page.evaluate(() => window.__DF.S.settings.data_mode);
  assert.equal(s, 'DEMO', 'harness memang memakai data contoh');
  for (const sc of ['dashboard', 'kasir', 'cart', 'orders', 'stock', 'more', 'products', 'reportSales', 'reportFinance', 'settings']) {
    await goTo(page, sc);
    assert.doesNotMatch(await page.textContent('#app'), /\bDEMO\b|Mode Demo|Dummy Data|Sample Transaction/i, sc);
  }
  await payQris(page);
  assert.doesNotMatch(await page.textContent('.receipt'), /DEMO|contoh/i);
  await goTo(page, 'settings');
  assert.match(await page.textContent('[data-to="setData"]'), /data contoh/);
  await page.click('[data-to="setData"]');
  await page.click('[data-act="toggleDataMode"]'); await page.click('[data-act="confirmYes"]');
  await page.waitForSelector('.toast:has-text("Status data diperbarui")');
  assert.equal((await db(page, 'SETTINGS')).find((r) => r.setting_key === 'data_mode').setting_value, 'PRODUCTION');
  await page.context().close();
  // STAFF tidak melihat baris Status Data
  const p2 = await open(MOBILE, '?latency=30');
  await login(p2, 'kasir', 'kasir123');
  await goTo(p2, 'settings');
  assert.equal(await p2.locator('[data-to="setData"]').count(), 0);
  await p2.context().close();
});

/* ======================================================================= 5. Ikon */

test('5. Ikon channel & pembayaran: upload → pratinjau → simpan → tampil di semua modul → tetap setelah reload → default', async () => {
  const page = await open();
  await login(page);
  await goTo(page, 'setIcons');
  assert.equal(await page.locator('[data-act="iconUpload"]').count(), 10, '5 channel + 5 metode');
  await uploadVia(page, '[data-act="iconUpload"][data-code="GOFOOD"]', 'ikon.png');
  await page.waitForSelector('[data-act="iconSave"][data-code="GOFOOD"]');
  await page.click('[data-act="iconSave"][data-code="GOFOOD"]');
  await page.waitForSelector('.toast:has-text("Ikon GoFood disimpan")');
  await page.click('[data-act="iconUrl"][data-code="QRIS"]');
  await page.fill('#url-in', 'https://img.test/qris.png'); await page.click('[data-act="urlCheck"]');
  await page.waitForFunction(() => /valid/i.test(document.getElementById('url-msg').textContent));
  await page.click('[data-act="urlUse"]');
  await page.click('[data-act="iconSave"][data-code="QRIS"]');
  await page.waitForSelector('.toast:has-text("Ikon QRIS disimpan")');
  const gofoodUrl = await page.evaluate(() => window.__DF.S.settings.brand_logos.GOFOOD);
  await page.screenshot({ path: path.join(SHOTS, 'pengaturan_ikon.png'), fullPage: true });

  async function expectIcon(scope, code, url) {
    const img = page.locator(`${scope} .bm-${code} img`).first();
    await img.waitFor();
    assert.equal(await img.getAttribute('src'), url.replace(/sz=w\d+/, 'sz=w160'), `${scope} ${code} (ikon diminta 160 px)`);
    assert.equal(await img.evaluate((i) => getComputedStyle(i).objectFit), 'contain');
  }
  await page.goto(URL_BASE + '?latency=30'); // reload: tersimpan di backend
  await page.waitForSelector('[data-screen="dashboard"] .kpi');
  await expectIcon('[data-screen="dashboard"]', 'GOFOOD', gofoodUrl);
  await goTo(page, 'kasir'); await expectIcon('#kasir-grid ~ *, [data-screen="kasir"]', 'GOFOOD', gofoodUrl);
  await goTo(page, 'reportSales'); await expectIcon('[data-screen="reportSales"]', 'GOFOOD', gofoodUrl);
  await goTo(page, 'kasir');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await goTo(page, 'cart'); await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await expectIcon('[data-screen="payment"]', 'QRIS', 'https://img.test/qris.png');
  // ikon gagal dimuat → fallback bawaan, ukuran kotak tetap
  await page.evaluate(() => { window.__DF.S.settings.brand_logos.DANA = 'https://img.test/rusak'; window.__DF.render(); });
  await page.waitForFunction(() => { const b = document.querySelector('[data-screen="payment"] .bm-DANA'); return b && !b.querySelector('img') && /DANA/.test(b.textContent); });
  const sizes = await page.$$eval('[data-screen="payment"] .method .bm', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert.ok(sizes.every((w) => w === sizes[0]), 'semua ikon berukuran sama: ' + sizes);
  // kembalikan default
  await goTo(page, 'setIcons');
  await page.click('[data-act="iconDefault"][data-code="GOFOOD"]'); await page.click('[data-act="confirmYes"]');
  await page.waitForSelector('.toast:has-text("Ikon bawaan dipulihkan")');
  assert.equal(await page.locator('#icon-GOFOOD .bm-GOFOOD img').count(), 0);
  const media = await db(page, 'MEDIA');
  assert.equal(media.find((m) => m.ref_id === 'GOFOOD').status, 'ARCHIVED');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

/* ======================================================================= 11. Tidak ada transaksi dummy saat API gagal */

test('11. API gagal tidak menghasilkan transaksi/katalog palsu', async () => {
  const page = await open();
  await login(page);
  await page.evaluate(() => {
    const real = window.__GAS.fns.api; window.__fail = { catalog: true, createOrder: false };
    window.__GAS.fns.api = (a, p, t) => { if (window.__fail[a]) throw new Error('gangguan jaringan (simulasi)'); return real(a, p, t); };
    window.__DF.S.catalog = null;
  });
  await goTo(page, 'kasir').catch(() => {});
  await page.waitForSelector('[data-screen="kasir"] .state.error');
  assert.equal(await page.locator('.pcard').count(), 0, 'tidak ada produk dummy');
  await page.evaluate(() => { window.__fail.catalog = false; window.__fail.createOrder = true; });
  await page.click('[data-act="retry"]');
  await page.waitForSelector('#kasir-grid .pcard');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  const before = (await db(page, 'ORDERS')).length;
  await goTo(page, 'cart'); await page.click('[data-act="checkout"]');
  await page.waitForSelector('.toast.error');
  assert.equal(await page.locator('[data-screen="payment"]').count(), 0, 'tidak lanjut ke pembayaran');
  assert.equal((await db(page, 'ORDERS')).length, before);
  await page.context().close();
});
