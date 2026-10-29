/**
 * Test versi PWA (GitHub Pages): dist-web + backend .gs asli lewat HTTP fetch (bukan google.script.run).
 * Server API tiruan berada di origin lain dan meniru 302 Apps Script + menolak preflight (lihat dev/serve-web.js).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { build } = require('../../tools/build-web.js');
const { start } = require('../../dev/serve-web.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dev', 'dist-web-test');
const SHOTS = path.join(ROOT, 'screenshots', 'pwa');
const IGNORED = [/fonts\.googleapis|fonts\.gstatic|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::ERR_/i];

let browser, srv;
test.before(async () => {
  build({ apiUrl: 'http://127.0.0.1:4174/macros/s/TEST/exec', unsafeApiUrl: true, outDir: OUT });
  srv = await start({ dir: OUT, latency: 60 });
  browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (srv) await srv.close(); });

async function open(w = 360, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(srv.webUrl);
  return page;
}
const idle = (page) => page.waitForFunction(() => !document.querySelector('#app .skel') && !document.querySelector('.refresh-bar') && !document.querySelector('#app .state .spinner') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 });

async function login(page, user = 'admin', pw = 'admin123') {
  await page.waitForSelector('[data-screen="login"]');
  await page.fill('input[name=username]', user);
  await page.fill('input[name=password]', pw);
  await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
}

test('PWA: manifest valid, ikon ada, service worker aktif, meta theme-color', async () => {
  const page = await open();
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  assert.equal(href, 'manifest.webmanifest');
  const m = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of m.icons) {
    const st = await page.evaluate(async (src) => { const r = await fetch(src); return r.status + ' ' + r.headers.get('content-type'); }, i.src);
    assert.match(st, /^200 image\/png/, i.src);
  }
  const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active ? r.active.state : 'none'; });
  assert.match(swState, /activat/);
  assert.ok(await page.$('meta[name="theme-color"]'));
  // APK (TWA): Digital Asset Links tersedia dengan paket & sidik jari dari web/pwa.config.json
  const al = await page.evaluate(async () => { const r = await fetch('.well-known/assetlinks.json'); return { st: r.status, j: await r.json() }; });
  const cfg = require('../../web/pwa.config.json');
  assert.equal(al.st, 200);
  assert.equal(al.j[0].target.package_name, cfg.twa.packageId);
  assert.deepEqual(al.j[0].target.sha256_cert_fingerprints, [cfg.twa.sha256]);
  assert.deepEqual(al.j[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('PWA: login → dashboard → kasir → bayar lewat fetch; tanpa preflight; stok terpotong sekali', async () => {
  const before = { posts: srv.stats.posts, pre: srv.stats.preflights };
  const page = await open();
  await page.waitForSelector('[data-screen="login"]');
  await page.screenshot({ path: path.join(SHOTS, '01_login.png') });
  await login(page);
  await idle(page);
  await page.screenshot({ path: path.join(SHOTS, '02_dashboard.png') });
  const sagoId = srv.ctx.Db.all('PRODUCTS').find((p) => p.product_name === 'Sago').product_id;
  const stock = () => srv.ctx.Db.all('STOCKS').find((s) => s.item_type === 'PRODUCT' && s.item_id === sagoId).quantity;
  srv.ctx.Db.resetCache();
  const s0 = stock();
  await page.click('.bnav [data-tab="kasir"]');
  await page.waitForSelector('#kasir-grid .pcard');
  await page.click('[data-act="setChannel"][data-ch="OFFLINE"]');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.screenshot({ path: path.join(SHOTS, '03_kasir.png') });
  await page.click('[data-act="openCart"] >> nth=0');
  await page.waitForSelector('[data-screen="cart"]');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await page.click('[data-act="payQuick"] >> nth=1');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt', { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, '04_struk.png') });
  srv.ctx.Db.resetCache();
  assert.equal(stock(), s0 - 2, 'stok Sago berkurang tepat 2 (sekali potong)');
  const paid = srv.ctx.Db.all('PAYMENTS').filter((p) => p.status === 'PAID');
  const lastOrder = srv.ctx.Db.all('ORDERS').slice(-1)[0];
  assert.equal(lastOrder.status, 'COMPLETED');
  assert.equal(paid.filter((p) => p.order_id === lastOrder.order_id).length, 1, 'satu pembayaran');
  assert.equal(srv.stats.preflights - before.pre, 0, 'tidak ada preflight CORS (Apps Script menolak OPTIONS)');
  assert.ok(srv.stats.posts - before.posts >= 4);
  assert.ok(srv.stats.actions.includes('createOrder') && srv.stats.actions.includes('recordPayment'));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('PWA: reload memakai sesi tersimpan (1 panggilan bootstrap), info publik dari cache', async () => {
  const page = await open();
  await login(page);
  await idle(page);
  // tunggu pengambilan latar (Order & Stok) selesai dan tersimpan di perangkat
  await page.waitForFunction(() => Object.keys(localStorage).filter((k) => k.indexOf('df_dc|') === 0 && /orders|stock/.test(k)).length >= 2, null, { timeout: 10000 });
  const n0 = srv.stats.actions.length;
  await page.reload();
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && srv.stats.actions.length === n0; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(400);
  assert.deepEqual(srv.stats.actions.slice(n0), ['bootstrap'], 'buka ulang: 1 panggilan (data lain dari perangkat)');
  assert.ok(await page.evaluate(() => !!localStorage.getItem('df_pub')), 'info publik disimpan untuk layar login berikutnya');
  // logout → login tampil langsung dari cache (tanpa menunggu publicInfo)
  await page.evaluate(() => { localStorage.removeItem('df_token'); });
  await page.reload();
  await page.waitForSelector('[data-screen="login"]', { timeout: 3000 });
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('PWA: offline → app tetap terbuka dengan data terakhir + pesan; tanpa data tersimpan → layar error + Coba lagi', async () => {
  const page = await open();
  await login(page);
  await idle(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // pastikan halaman dikendalikan SW
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.context().setOffline(true);
  await page.reload();
  // 1) Ada data di perangkat: Beranda tetap tampil + peringatan, bukan layar kosong
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
  await page.waitForSelector('.toast:has-text("Belum terhubung")', { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, '05_offline.png') });
  // 2) Belum ada data di perangkat: layar error yang jelas
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => /^df_(dc|bootc)/.test(k)).forEach((k) => localStorage.removeItem(k)); });
  await page.reload();
  await page.waitForSelector('.state.error', { timeout: 15000 });
  assert.match(await page.textContent('.state.error'), /Gagal terhubung|offline/i);
  await page.context().setOffline(false);
  await page.click('.state.error [data-act="retry"]');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
  await page.context().close();
});

test('PWA: deployment salah (respon HTML login Google) → pesan yang bisa ditindaklanjuti', async () => {
  const page = await open();
  await page.route('**/macros/s/TEST/exec', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in - Google Accounts</html>', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.state.error', { timeout: 15000 });
  assert.match(await page.textContent('.state.error'), /Anyone/);
  await page.context().close();
});

test('PWA: tampilan 360×800 — nav menempel di bawah, tombol + di kanan bawah kartu, tanpa overflow', async () => {
  const page = await open(360, 800);
  await login(page);
  await page.click('.bnav [data-tab="kasir"]');
  await page.waitForSelector('#kasir-grid .pcard');
  const m = await page.evaluate(() => {
    const card = document.querySelector('.pcard').getBoundingClientRect();
    const add = document.querySelector('.pcard .add').getBoundingClientRect();
    const nav = document.querySelector('.bnav').getBoundingClientRect();
    return { cardR: card.right, cardB: card.bottom, addR: add.right, addB: add.bottom, addT: add.top, cardT: card.top,
      navB: nav.bottom, vh: innerHeight, ow: document.documentElement.scrollWidth - innerWidth };
  });
  assert.ok(m.cardR - m.addR <= 14 && m.cardB - m.addB <= 14, 'tombol + di pojok kanan bawah kartu');
  assert.ok(m.addT - m.cardT > (m.cardB - m.cardT) / 2, 'tombol + di setengah bawah kartu');
  assert.equal(Math.round(m.navB), m.vh, 'nav menempel di bawah layar');
  assert.ok(m.ow <= 0, 'tanpa scroll horizontal');
  await page.context().close();
});
