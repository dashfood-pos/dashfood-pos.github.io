/**
 * Test v1.4: tema gelap/terang, KPI simetris, navigasi tanpa menunggu (stale-while-revalidate + prefetch),
 * fokus input bertahan saat data diperbarui di belakang.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const URL = 'file://' + path.join(ROOT, 'dev', 'dist', 'index.html');
let browser;
test.before(async () => { require('../../dev/build-dev.js').build(); browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function open(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Makassar' }, opts));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(URL + '?reset=1&latency=' + (opts.latency || 40));
  await page.waitForSelector('[data-screen="login"]');
  return page;
}
async function login(page) {
  await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin123');
  await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
}
const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('Tema: Otomatis mengikuti HP, pilihan Gelap/Terang tersimpan dan tidak berkedip saat dibuka ulang', async () => {
  const page = await open({ colorScheme: 'dark' });
  await login(page);
  assert.equal(await bg(page), 'rgb(18, 16, 14)', 'Otomatis + HP gelap → gelap');
  await page.click('.bnav [data-tab="more"]');
  await page.click('[data-act="setTheme"][data-v="light"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
  assert.equal(await bg(page), 'rgb(242, 241, 238)');
  await page.click('[data-act="setTheme"][data-v="dark"]');
  assert.equal(await bg(page), 'rgb(18, 16, 14)');
  assert.equal(await page.getAttribute('[data-act="setTheme"][data-v="dark"]', 'aria-checked'), 'true');
  // dibuka ulang: atribut tema sudah terpasang sebelum App berjalan (skrip di <head>)
  await page.goto(URL + '?latency=40');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  await page.click('.bnav [data-tab="more"]');
  await page.click('[data-act="setTheme"][data-v="auto"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), null);
  // struk tetap kertas putih di tema gelap
  await page.evaluate(() => window.__DF.go('orders'));
  await page.waitForSelector('.order-row');
  const id = await page.getAttribute('.order-row >> nth=0', 'data-id');
  await page.evaluate((i) => window.__DF.go('receipt', { id: i }), id);
  await page.waitForSelector('[data-screen="receipt"] .receipt');
  assert.equal(await bg(page), 'rgb(18, 16, 14)', 'Otomatis + HP gelap');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.receipt')).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.receipt')).color), 'rgb(26, 22, 19)');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('KPI simetris: angka sejajar & sama besar di semua kartu, juga saat angkanya sangat panjang', async () => {
  const page = await open();
  await login(page);
  // ukur setelah font selesai dimuat (Inter bisa masih diunduh saat online)
  const measure = () => page.evaluate(async () => {
    await document.fonts.ready; await new Promise((r) => requestAnimationFrame(r));
    const cards = [...document.querySelectorAll('.kpi-grid .kpi')];
    return cards.map((k) => { const v = k.querySelector('.value'); const r = k.getBoundingClientRect();
      return { row: Math.round(r.top), off: Math.round(v.getBoundingClientRect().top - r.top), fs: getComputedStyle(v).fontSize, clipped: v.scrollWidth > v.clientWidth + 1 }; });
  });
  let m = await measure();
  assert.equal(new Set(m.map((x) => x.off)).size, 1, 'jarak angka dari atas kartu sama: ' + JSON.stringify(m));
  assert.equal(new Set(m.map((x) => x.fs)).size, 1);
  // angka sangat panjang di satu kartu → SEMUA angka mengecil bersama, tidak ada yang terpotong
  await page.evaluate(() => {
    const d = window.__DF.S.data['dash|today'];
    d.value.kpi.omzet = 123456789; d.value.kpi.laba_bersih = 98765432; d.at = Date.now();
    window.__DF.render();
  });
  m = await measure();
  assert.equal(new Set(m.map((x) => x.fs)).size, 1, 'ukuran angka sama di semua kartu: ' + JSON.stringify(m.map((x) => x.fs)));
  assert.ok(parseFloat(m[0].fs) < 22, 'angka diperkecil agar muat');
  assert.ok(m.every((x) => !x.clipped), 'tidak ada angka terpotong');
  assert.equal(new Set(m.map((x) => x.off)).size, 1);
  await page.context().close();
});

test('Navigasi: Order & Stok terbuka tanpa skeleton setelah Beranda (prefetch); kunjungan ulang langsung tampil', async () => {
  const page = await open({ latency: 600 });
  await login(page);
  await page.waitForTimeout(1600); // prefetch latar selesai
  for (const tab of ['orders', 'stock', 'orders']) {
    const t0 = Date.now();
    await page.click(`.bnav [data-tab="${tab}"]`);
    const sawSkeleton = await page.evaluate(() => !!document.querySelector('#app .skel'));
    assert.equal(sawSkeleton, false, tab + ': tidak ada skeleton');
    assert.ok(Date.now() - t0 < 400, tab + ' tampil < 400 ms dengan latensi server 600 ms');
  }
  await page.context().close();
});

test('Stale-while-revalidate: data lama tampil + bar penyegaran, lalu diganti data baru tanpa layar kosong', async () => {
  const page = await open({ latency: 500 });
  await login(page);
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.order-row');
  const before = await page.locator('.order-row').count();
  // transaksi baru masuk dari perangkat lain (langsung ke backend)
  await page.evaluate(() => {
    const api = window.__GAS.fns.api;
    const tok = JSON.parse(localStorage.getItem('df_token'));
    const cat = api('catalog', {}, tok).data;
    const p = cat.products.find((x) => x.product_name === 'Sago');
    api('createOrder', { channel: 'OFFLINE', items: [{ product_id: p.product_id, quantity: 1 }], client_ref: 'ext-' + Date.now() }, tok);
  });
  await page.evaluate(() => { Object.keys(window.__DF.S.data).forEach((k) => { if (k.indexOf('orders') === 0) window.__DF.S.data[k].at = 0; }); });
  await page.click('.bnav [data-tab="dashboard"]');
  await page.click('.bnav [data-tab="orders"]');
  assert.equal(await page.locator('.order-row').count(), before, 'data lama tampil seketika');
  await page.waitForSelector('.refresh-bar', { state: 'attached', timeout: 2000 });
  await page.waitForFunction((n) => document.querySelectorAll('.order-row').length === n + 1, before, { timeout: 5000 });
  await page.waitForSelector('.refresh-bar', { state: 'detached', timeout: 5000 });
  await page.context().close();
});

test('Fokus & isi input bertahan saat layar diperbarui di belakang', async () => {
  const page = await open();
  await login(page);
  await page.click('.bnav [data-tab="orders"]');
  await page.waitForSelector('.order-row');
  const sel = 'input[type=search], input[data-input]';
  await page.click(sel);
  await page.keyboard.type('TRX-2');
  await page.evaluate(() => window.__DF.render());
  const st = await page.evaluate(() => ({ tag: document.activeElement.tagName, val: document.activeElement.value, pos: document.activeElement.selectionStart }));
  assert.equal(st.tag, 'INPUT');
  assert.equal(st.val, 'TRX-2');
  assert.equal(st.pos, 5);
  await page.context().close();
});

test('Keluar: cache data di perangkat dihapus', async () => {
  const page = await open();
  await login(page);
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.indexOf('df_dc|') === 0)));
  await page.click('.bnav [data-tab="more"]');
  await page.click('[data-act="logout"]');
  await page.click('.sheet [data-act="confirmOk"], .sheet .btn-primary');
  await page.waitForSelector('[data-screen="login"]');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^df_(dc|bootc)/.test(k)).length), 0);
  await page.context().close();
});

test('Tema warna: 5 aksen, tersimpan, dipasang sebelum App jalan, bisa digabung dengan mode gelap', async () => {
  const page = await open();
  await login(page);
  await page.click('.bnav [data-tab="more"]');
  assert.equal(await page.locator('[data-act="setAccent"]').count(), 5);
  assert.equal(await page.getAttribute('[data-act="setAccent"][data-v="orange"]', 'aria-checked'), 'true', 'default oranye');
  const fab = () => page.evaluate(() => getComputedStyle(document.querySelector('.bnav-item.fab .fab-ic')).backgroundColor);
  const chipOn = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-strong').trim());
  assert.equal(await fab(), 'rgb(242, 107, 15)');
  for (const [v, strong, brand] of [['green', '#167A44', 'rgb(31, 157, 87)'], ['blue', '#1F5FD6', 'rgb(47, 111, 237)'], ['maroon', '#A3263D', 'rgb(192, 51, 77)'], ['brown', '#7A4E31', 'rgb(154, 100, 64)']]) {
    await page.click(`[data-act="setAccent"][data-v="${v}"]`);
    assert.equal(await page.getAttribute('html', 'data-accent'), v);
    assert.equal(await chipOn(), strong);
    assert.equal(await fab(), brand);
    assert.equal(await page.getAttribute(`[data-act="setAccent"][data-v="${v}"]`, 'aria-checked'), 'true');
  }
  // biru + gelap → teks aksen versi terang untuk latar gelap
  await page.click('[data-act="setAccent"][data-v="blue"]');
  await page.click('[data-act="setTheme"][data-v="dark"]');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-ink').trim()), '#8DB4FF');
  // buka ulang: aksen sudah terpasang dari skrip <head>
  await page.goto(URL + '?latency=40');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-accent')), 'blue');
  await page.waitForSelector('[data-screen="dashboard"] .kpi');
  await page.click('.bnav [data-tab="more"]');
  await page.click('[data-act="setAccent"][data-v="orange"]');
  assert.equal(await page.getAttribute('html', 'data-accent'), null);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
