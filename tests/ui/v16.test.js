/**
 * Test v1.6: filter "Bulan lalu" di Beranda, periode mingguan/bulanan di laporan, grafik baru,
 * kesimpulan singkat, dan unduh laporan Excel (.xlsx) & PDF.
 *   node dev/build-dev.js && node --test tests/ui/v16.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const URL_BASE = 'file://' + path.join(ROOT, 'dev', 'dist', 'index.html');
const IGNORED = [/fonts\.googleapis|net::ERR_|status of 404/i];
let browser;
test.before(async () => { require('../../dev/build-dev.js').build(); browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function open(theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Makassar', acceptDownloads: true, colorScheme: theme || 'light' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(URL_BASE + '?reset=1&latency=10');
  await page.waitForSelector('[data-screen="login"]');
  // Riwayat 40 hari: harga demo dimundurkan agar order lama sah, lalu order & pengeluaran per hari.
  await page.evaluate(() => {
    const G = window.__GAS, api = G.fns.api, DAY = 86400000, now = Date.now();
    const tok = api('login', { username: 'admin', password: 'admin123' }).data.token;
    const sh = G.Db.spreadsheet().getSheetByName('PRICES');
    G.Db.resetCache(); G.Db.all('PRICES').forEach((r) => sh.getRange(r._row, 5).setValue('2020-01-01')); G.Db.resetCache();
    const prods = api('catalog', {}, tok).data.products.filter((p) => !p.variant_ids.length);
    for (let d = 40; d >= 0; d--) {
      G.setClock(now - d * DAY - 3600000);
      prods.forEach((p) => api('recordProduction', { product_id: p.product_id, quantity: 10, production_date: G.fns.todayStr() }, tok));
      for (let i = 0; i < 1 + (d % 4); i++) {
        const o = api('createOrder', { channel: i % 2 ? 'GOFOOD' : 'OFFLINE', items: [{ product_id: prods[i % prods.length].product_id, quantity: 1 }] }, tok);
        api('recordPayment', { order_id: o.data.order_id, payment_method: 'CASH', received_amount: 100000 }, tok);
      }
      if (d % 5 === 0) api('saveExpense', { expense_date: G.fns.todayStr(), category: 'Bahan', description: 'Belanja', amount: 20000 + d * 1000, payment_method: 'CASH' }, tok);
    }
    G.setClock(null);
  });
  await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin123');
  await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 15000 });
  return page;
}
async function idle(page) {
  await page.waitForFunction(() => !document.querySelector('#app .skel') && !document.querySelector('#app .state .spinner') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 });
  await page.waitForTimeout(60);
}
async function goTo(page, name) { await page.evaluate((n) => window.__DF.go(n, {}), name); await page.waitForSelector(`[data-screen="${name}"]`); await idle(page); }

test('Beranda: filter Bulan lalu (dan periode evaluasi lain) menampilkan rentang & angka bulan lalu', async () => {
  const page = await open();
  const opts = await page.$$eval('[data-change="dashPeriod"] option', (o) => o.map((x) => x.value));
  for (const v of ['today', 'yesterday', '7d', 'week', 'last_week', 'month', 'last_month']) assert.ok(opts.includes(v), 'opsi ' + v);
  await page.selectOption('[data-change="dashPeriod"]', 'last_month'); await idle(page);
  const range = await page.textContent('.dash-range');
  assert.match(range, /Bulan lalu: 1–\d{2} \w{3} \d{4}/);
  const expect = await page.evaluate(() => {
    const r = window.__GAS.fns.api('dashboard', { period: 'last_month' }, window.__DF.S.token).data;
    return r.kpi.omzet;
  });
  assert.ok(expect > 0, 'ada omzet bulan lalu');
  const shown = await page.textContent('.kpi .value');
  assert.equal(shown.replace(/\D/g, ''), String(expect));
  assert.match(await page.textContent('.dash-hdr'), /Evaluasi bulan lalu/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('Laporan: chip periode, kesimpulan singkat, grafik bisa diketuk, per hari/per minggu', async () => {
  const page = await open();
  await goTo(page, 'reportSales');
  assert.equal(await page.getAttribute('[data-act="repPeriod"].active', 'data-p'), 'week', 'default Minggu ini');
  await page.click('[data-act="repPeriod"][data-p="last_month"]'); await idle(page);
  assert.match(await page.textContent('.rep-head'), /Bulan lalu · 1–\d{2} \w{3} \d{4}[\s\S]*Dibandingkan dengan Bulan sebelumnya/);
  assert.ok(await page.$$eval('.insights li', (l) => l.length) >= 2, 'kesimpulan singkat');
  // bulan > 14 hari → otomatis per minggu (5 batang)
  assert.equal(await page.getAttribute('[data-act="repGran"].active', 'data-g'), 'week');
  assert.equal(await page.$$eval('#c-sales rect[data-act="chartPoint"]', (r) => r.length), 5);
  await page.click('[data-act="repGran"][data-g="day"]'); await idle(page);
  const n = await page.$$eval('#c-sales rect[data-act="chartPoint"]', (r) => r.length);
  assert.ok(n >= 28 && n <= 31, 'per hari: ' + n);
  await page.click('#c-sales rect[data-act="chartPoint"][data-i="2"]');
  assert.match(await page.textContent('#c-sales .c-detail'), /3 \w{3}[\s\S]*Omzet[\s\S]*Rp/);
  assert.ok(await page.$('#c-wd svg'), 'grafik hari paling ramai');
  assert.ok(await page.$('#c-sales .c-prev'), 'penanda periode sebelumnya');
  // Keuangan: 2 grafik + batang rugi/untung
  await goTo(page, 'reportFinance');
  assert.ok(await page.$('#c-fin .c-s1') && await page.$('#c-fin .c-s2'), 'omzet & pengeluaran');
  assert.ok(await page.$('#c-laba .c-good'), 'batang untung');
  // Produk: batang per produk + penanda periode lalu
  await goTo(page, 'reportProducts');
  assert.ok(await page.$$eval('.rank-bars .rb', (r) => r.length) >= 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'tanpa scroll horizontal');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('Unduh laporan: Excel (.xlsx) & PDF valid untuk penjualan, produk, keuangan', async () => {
  const page = await open('dark');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-v16-'));
  await page.evaluate(() => { window.__DF.S.rep.period = 'last_week'; });
  for (const [scr, kind, sheets] of [['reportSales', 'sales', ['Ringkasan', 'Omzet Harian', 'Pola Hari', 'Channel', 'Metode Bayar', 'Transaksi']],
    ['reportProducts', 'products', ['Ringkasan', 'Per Produk', 'Per Varian']], ['reportFinance', 'finance', ['Ringkasan', 'Arus Harian', 'Kategori Pengeluaran', 'Channel', 'Daftar Pengeluaran']]]) {
    await goTo(page, scr);
    for (const fmt of ['xlsx', 'pdf']) {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-act="repExport"][data-kind="${kind}"][data-fmt="${fmt}"]`)]);
      assert.match(dl.suggestedFilename(), new RegExp('^Dash-Food_Laporan-[A-Za-z]+_\\d{4}-\\d{2}-\\d{2}_sd_\\d{4}-\\d{2}-\\d{2}\\.' + fmt + '$'));
      const f = path.join(dir, dl.suggestedFilename()); await dl.saveAs(f);
      const buf = fs.readFileSync(f);
      if (fmt === 'pdf') {
        assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
        const txt = buf.toString('latin1');
        assert.match(txt, /%%EOF$/);
        const xref = +txt.match(/startxref\n(\d+)/)[1];
        assert.equal(txt.substr(xref, 4), 'xref', 'offset xref benar');
        assert.match(txt, /Kesimpulan singkat/);
        assert.match(txt, /Periode: Minggu lalu \\\(\d+/);
      } else {
        assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip');
        const s = buf.toString('utf8');
        sheets.forEach((n) => assert.ok(s.includes('<sheet name="' + n + '"'), kind + ' sheet ' + n));
        assert.match(s, /formatCode="&quot;Rp&quot;/);
      }
    }
    await idle(page);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
