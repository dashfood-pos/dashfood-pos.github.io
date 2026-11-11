/**
 * Test v1.7: mode Kasir (akun Kasir & aplikasi /kasir/), pengaturan printer per HP,
 * cetak ESC/POS lewat RawBT (Android) dan Bluetooth langsung (printer BLE tiruan), cetak otomatis setelah bayar.
 * Memakai versi PWA (fetch ke API tiruan), karena Bluetooth langsung tidak tersedia di link Apps Script.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');
const { build } = require('../../tools/build-web.js');
const { start } = require('../../dev/serve-web.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dev', 'dist-web-test-v17');
const IGNORED = [/fonts\.googleapis|fonts\.gstatic|net::ERR_/i];
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 11; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let browser, srv;
test.before(async () => {
  build({ apiUrl: 'http://127.0.0.1:4184/macros/s/TEST/exec', unsafeApiUrl: true, outDir: OUT });
  srv = await start({ dir: OUT, latency: 20, webPort: 4183, apiPort: 4184 });
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); if (srv) await srv.close(); });

/** Printer BLE tiruan: mencatat semua byte yang dikirim. */
function fakeBluetooth() {
  window.__bleWrites = [];
  const ch = { properties: { write: true, writeWithoutResponse: false }, writeValue: async (v) => { window.__bleWrites.push(Array.from(new Uint8Array(v.buffer || v))); } };
  const svc = { getCharacteristics: async () => [ch] };
  const dev = { id: 'dev-1', name: 'RPP02N', gatt: { connected: false, connect: async function () { this.connected = true; return { getPrimaryServices: async () => [svc] }; }, disconnect() { this.connected = false; } } };
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async (o) => { window.__bleReq = o; return dev; }, getDevices: async () => [] }, configurable: true });
}

async function open(sub = '', opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Makassar' }, opts.ctx || {}));
  if (opts.ble) await ctx.addInitScript(fakeBluetooth);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(srv.webUrl + sub);
  return page;
}
const idle = (page) => page.waitForFunction(() => !document.querySelector('#app .skel') && !document.querySelector('.refresh-bar') && !document.querySelector('#app .state .spinner') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 });
async function login(page, user, pw, screen) {
  await page.waitForSelector('[data-screen="login"]');
  await page.fill('input[name=username]', user); await page.fill('input[name=password]', pw);
  await page.click('#login-btn');
  await page.waitForSelector(`[data-screen="${screen}"]`, { timeout: 15000 });
  await idle(page);
}
async function sellSago(page) {
  await page.waitForSelector('#kasir-grid .pcard');
  await page.click('[data-act="setChannel"][data-ch="OFFLINE"]');
  await page.click('[data-act="quickAdd"][aria-label="Tambah Sago"]');
  await page.click('[data-act="openCart"] >> nth=0');
  await page.click('[data-act="checkout"]');
  await page.waitForSelector('[data-screen="payment"] .method');
  await page.click('[data-act="payQuick"] >> nth=1');
  await page.click('[data-act="payNow"]');
  await page.waitForSelector('[data-screen="receipt"] .receipt', { timeout: 15000 });
}
const navTabs = (page) => page.$$eval('.bnav .bnav-item', (b) => b.map((x) => x.dataset.tab));
const decode = (bytes) => String.fromCharCode.apply(null, bytes);
/** Buang perintah ESC/POS yang dipakai (ESC @, ESC t/a/E/d n, GS ! n, GS V m n) → teks yang tercetak per baris. */
const printedLines = (txt) => txt.replace(/\x1b@|\x1b[taEd][\s\S]|\x1d![\s\S]|\x1dV[\s\S]{2}/g, '').split('\n');

test('Akun Kasir: langsung ke Kasir, menu khusus kasir, Beranda (laba) ditolak di layar & server', async () => {
  const page = await open();
  await login(page, 'kasir', 'kasir123', 'kasir');
  assert.deepEqual(await navTabs(page), ['kasir', 'orders', 'stock', 'more']);
  await page.click('.bnav [data-tab="more"]'); await idle(page);
  const more = await page.textContent('[data-screen="more"]');
  assert.match(more, /Kasir/); assert.match(more, /Printer Struk/);
  assert.doesNotMatch(more, /Laporan|Kelola Produk|Pengeluaran/);
  await page.evaluate(() => window.__DF.go('dashboard'));
  assert.match(await page.textContent('[data-screen="dashboard"]'), /Akses dibatasi/);
  const res = await page.evaluate(async (u) => {
    const t = window.__DF.S.token;
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'dashboard', payload: { period: 'today' }, token: t }) });
    return r.json();
  }, srv.apiUrl);
  assert.equal(res.ok, false); assert.equal(res.error.code, 'FORBIDDEN');
  // Tombol kembali di layar utama kasir tidak melempar ke Beranda
  await page.evaluate(() => { window.__DF.go('stock'); window.__DF.ACTIONS.back(); });
  assert.equal(await page.evaluate(() => window.__DF.S.stack[0].name), 'kasir');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('Admin: tetap menu lengkap + info Aplikasi Kasir; aplikasi /kasir/ memaksa mode kasir & punya manifest sendiri', async () => {
  const page = await open();
  await login(page, 'admin', 'admin123', 'dashboard');
  assert.deepEqual(await navTabs(page), ['dashboard', 'orders', 'kasir', 'stock', 'more']);
  await page.click('.bnav [data-tab="more"]'); await idle(page);
  await page.click('[data-act="kasirAppInfo"]');
  assert.match(await page.textContent('.sheet'), /http:\/\/localhost:4183\/kasir\//);
  await page.context().close();

  const k = await open('kasir/');
  assert.equal(await k.getAttribute('link[rel=manifest]', 'href'), 'manifest.webmanifest');
  const m = await k.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.equal(m.short_name, 'DF Kasir');
  for (const i of m.icons) assert.equal(await k.evaluate(async (src) => (await fetch(src)).status, i.src), 200, i.src);
  assert.match(await k.textContent('[data-screen="login"]'), /Masuk ke Kasir/);
  await login(k, 'admin', 'admin123', 'kasir');
  assert.deepEqual(await navTabs(k), ['kasir', 'orders', 'stock', 'more']);
  await k.click('.bnav [data-tab="more"]'); await idle(k);
  assert.equal(await k.getAttribute('a.menu-row', 'href'), 'http://localhost:4183/');
  assert.deepEqual(k.errors, []);
  await k.context().close();
});

test('RawBT (Android): cetak otomatis setelah bayar mengirim ESC/POS 58 mm yang benar', async () => {
  const page = await open('', { ctx: { userAgent: ANDROID_UA } });
  await login(page, 'kasir', 'kasir123', 'kasir');
  await page.evaluate(() => { window.__sent = []; window.__DF.print.io.openUrl = (u) => window.__sent.push(u); });
  await page.click('.bnav [data-tab="more"]'); await idle(page);
  await page.click('[data-to="printer"]'); await idle(page);
  assert.equal(await page.getAttribute('.prn-opt.on', 'data-v'), 'rawbt', 'Android → RawBT bawaan');
  await page.click('[data-act="prnMethod"][data-v="rawbt"]');
  await page.check('[data-change="prnAuto"]');
  await page.click('[data-act="prnTest"]');
  let sent = await page.evaluate(() => window.__sent);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^intent:base64,[A-Za-z0-9+/=]+#Intent;scheme=rawbt;package=ru\.a402d\.rawbtprinter;/);
  const test1 = Buffer.from(sent[0].match(/base64,([^#]+)/)[1], 'base64');
  assert.deepEqual([...test1.subarray(0, 2)], [0x1b, 0x40], 'reset printer');
  assert.match(test1.toString('latin1'), /CETAK-UJI/);

  await page.click('.bnav [data-tab="kasir"]');
  await sellSago(page);
  await page.waitForFunction(() => window.__sent.length === 2);
  sent = await page.evaluate(() => window.__sent);
  const bytes = Buffer.from(sent[1].match(/base64,([^#]+)/)[1], 'base64');
  const txt = bytes.toString('latin1');
  const order = srv.ctx.Db.all('ORDERS').slice(-1)[0];
  assert.match(txt, new RegExp(order.order_number));
  assert.match(txt, /Sago/); assert.match(txt, /TOTAL/); assert.match(txt, /Kembali/);
  assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 0x42, 0x00], 'potong kertas di akhir');
  const lines = printedLines(txt);
  assert.ok(lines.every((l) => l.length <= 32), 'tidak ada baris > 32 karakter: ' + lines.filter((l) => l.length > 32).join('|'));
  // Tombol Cetak di struk memakai cara yang sama
  await page.click('[data-act="printReceipt"]');
  assert.equal((await page.evaluate(() => window.__sent)).length, 3);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('Bluetooth langsung: pilih printer BLE, cetak uji 80 mm terkirim per potongan', async () => {
  const page = await open('', { ble: true });
  await login(page, 'kasir', 'kasir123', 'kasir');
  await page.evaluate(() => window.__DF.go('printer')); await idle(page);
  await page.click('[data-act="prnMethod"][data-v="ble"]');
  await page.click('[data-act="prnPaper"][data-v="80"]');
  await page.click('[data-act="prnConnect"]');
  await page.waitForSelector('text=RPP02N');
  const req = await page.evaluate(() => window.__bleReq);
  assert.equal(req.acceptAllDevices, true);
  assert.ok(req.optionalServices.includes('000018f0-0000-1000-8000-00805f9b34fb'));
  await page.click('[data-act="prnTest"]');
  await page.waitForFunction(() => window.__bleWrites.length > 0 && document.querySelector('.toast'));
  const all = [].concat(...await page.evaluate(() => window.__bleWrites));
  assert.ok((await page.evaluate(() => window.__bleWrites)).every((w) => w.length <= 180), 'potongan ≤ 180 byte');
  const txt = decode(all);
  assert.match(txt, /CETAK-UJI/);
  const lines = printedLines(txt);
  assert.ok(lines.some((l) => l.length > 32 && l.length <= 48), 'lebar 80 mm dipakai (48 karakter)');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('df_printer'))), { method: 'ble', paper: 80, auto: false, bleName: 'RPP02N', bleId: 'dev-1' });
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
