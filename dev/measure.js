/**
 * measure.js — mengukur jumlah round-trip google.script.run, pembacaan sheet (getValues),
 * dan waktu sampai layar siap, dengan latensi buatan per panggilan (default 800 ms ≈ Apps Script).
 *   node dev/build-dev.js && node dev/measure.js [latencyMs]
 */
'use strict';
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const URL = 'file://' + path.join(__dirname, 'dist', 'index.html');
const LAT = parseInt(process.argv[2] || '800', 10);
(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(URL + '?reset=1&latency=5');
  await p.fill('input[name=username]', 'admin'); await p.fill('input[name=password]', 'admin123'); await p.click('#login-btn');
  await p.waitForSelector('[data-screen="dashboard"] .kpi');
  const res = {};
  // 1) Reload dengan sesi tersimpan → dashboard siap
  await p.goto(URL + '?latency=' + LAT);
  const t0 = Date.now();
  await p.waitForSelector('[data-screen="dashboard"] .kpi', { timeout: 60000 });
  res.reload_to_dashboard_ms = Date.now() - t0;
  res.reload_calls = await p.evaluate(() => (window.__apiLog || []).map((x) => x.action || x.fn));
  // 2) Tap Kasir → katalog siap
  const t1 = Date.now();
  await p.click('.bnav [data-tab="kasir"]');
  await p.waitForSelector('#kasir-grid .pcard', { timeout: 60000 });
  res.tap_kasir_ms = Date.now() - t1;
  await p.waitForTimeout(LAT * 2 + 200);
  res.total_calls_after_kasir = await p.evaluate(() => (window.__apiLog || []).map((x) => x.action || x.fn));
  res.sheet_reads = await p.evaluate(() => window.__GAS.mock.readStats.getValues);
  // 3) Halaman login (tanpa sesi)
  await p.evaluate(() => localStorage.removeItem('df_token'));
  await p.goto(URL + '?latency=' + LAT);
  const t2 = Date.now();
  await p.waitForSelector('[data-screen="login"] form', { timeout: 60000 });
  res.login_screen_ms = Date.now() - t2;
  console.log(JSON.stringify(res, null, 2));
  await b.close();
})();
