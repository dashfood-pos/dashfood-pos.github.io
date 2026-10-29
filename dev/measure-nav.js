/**
 * measure-nav.js — waktu dari ketuk menu sampai ISI layar tampil (bukan skeleton), dengan latensi API tiruan.
 *   node dev/measure-nav.js [latencyMs] [path/ke/dev/dist/index.html]
 * Skenario: login → tunggu 3 dtk di Beranda → Order → Stok → Kasir → Beranda → Order → Stok (kunjungan ke-2)
 * → reload aplikasi → Order → Stok (sesi baru, cache perangkat).
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const latency = +(process.argv[2] || 800);
const file = process.argv[3] || path.join(__dirname, 'dist', 'index.html');

(async () => {
  if (!process.argv[3]) require('./build-dev.js').build();
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + file + '?reset=1&latency=' + latency);
  await page.waitForSelector('[data-screen="login"]');
  await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin123'); await page.click('#login-btn');
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const ready = { orders: '.order-row, .state h3', stock: '[data-screen="stock"] .list-item, [data-screen="stock"] .state h3', kasir: '#kasir-grid .pcard', dashboard: '[data-screen="dashboard"] .kpi' };
  async function tap(tab) {
    const t0 = Date.now();
    await page.click(`.bnav [data-tab="${tab}"]`);
    await page.waitForFunction(([t, sel]) => document.querySelector(`[data-screen="${t}"]`) && !document.querySelector('#app .skel') && document.querySelector(sel), [tab, ready[tab]], { timeout: 30000 });
    return Date.now() - t0;
  }
  const out = {};
  for (const [label, tab] of [['Order (1)', 'orders'], ['Stok (1)', 'stock'], ['Kasir', 'kasir'], ['Beranda', 'dashboard'], ['Order (2)', 'orders'], ['Stok (2)', 'stock']]) out[label] = await tap(tab);
  await page.goto('file://' + file + '?latency=' + latency);
  const t0 = Date.now();
  await page.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 30000 });
  out['Buka ulang → Beranda'] = Date.now() - t0;
  out['Order (sesi baru)'] = await tap('orders');
  out['Stok (sesi baru)'] = await tap('stock');
  console.log(JSON.stringify({ latency, file: path.basename(path.dirname(path.dirname(file))), ms: out }, null, 2));
  await b.close();
})();
