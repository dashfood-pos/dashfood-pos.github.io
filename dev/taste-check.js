/**
 * taste-check.js — pemeriksa "anti-slop" di browser sungguhan untuk layar aplikasi Dash Food.
 * Menerapkan house rules dari skill tasteskill v2 yang relevan untuk app (skill aslinya untuk landing page,
 * script inspect.mjs-nya tidak tersedia), ditambah aturan proyek:
 *
 *   FAIL  gradien (kecuali scrim foto login) · bayangan pada elemen diam · font selain Inter · emoji
 *         · huruf kapital kecil ber-tracking · warna violet/indigo · overflow horizontal
 *         · kontras teks < 4.5:1 (teks besar < 3:1) · angka KPI tidak sejajar dalam satu baris kartu
 *
 *   node dev/taste-check.js            → semua layar × {terang, gelap} × {oranye: 360/390/800, 4 aksen lain: 390}
 * Hasil: dev/taste-report.json + ringkasan di konsol. Exit code 1 bila ada FAIL.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

const FLOATING = ['.bnav', '.cart-bar', '.toast', '.sheet', '.detail-hero .float', '.boot-skel .sk-nav', '.sheet-backdrop'];

async function audit(page) {
  return page.evaluate((FLOATING) => {
    const out = { fails: [], kpiRows: [] };
    const fail = (rule, el, extra) => {
      const id = el ? (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase()) : '';
      out.fails.push(rule + (id ? ' @ ' + id : '') + (extra ? ' · ' + extra : ''));
    };
    const parse = (c) => { const m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = (c) => { const a = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const bgOf = (el) => {
      let layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
        if (getComputedStyle(e).backgroundImage !== 'none' && e.tagName !== 'BUTTON') return null; // gambar di belakang: lewati
      }
      if (!layers.length) layers.push(parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]);
      let c = layers.pop();
      while (layers.length) { const t = layers.pop(); c = [0, 1, 2].map((i) => t[i] * t[3] + c[i] * (1 - t[3])).concat(1); }
      return c;
    };
    const hue = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 };
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; const l = (mx + mn) / 2; return { h, s: d / (1 - Math.abs(2 * l - 1)) }; };
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
    const isFloating = (el) => FLOATING.some((s) => el.closest(s));
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (/gradient/.test(cs.backgroundImage) && !el.matches('.login .bgshade')) fail('gradien', el);
      if (cs.boxShadow !== 'none' && !isFloating(el) && !el.matches(':focus-visible')) fail('bayangan pada elemen diam', el, cs.boxShadow.slice(0, 40));
      if (cs.filter && /drop-shadow/.test(cs.filter)) fail('glow/drop-shadow', el);
      if (cs.textTransform === 'uppercase' && parseFloat(cs.fontSize) < 14) fail('huruf kapital kecil', el);
      if (/^(svg|path|use|circle|rect|line|polyline|g|text)$/i.test(el.tagName)) continue;
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && fam !== 'Inter') fail('font bukan Inter', el, fam);
      for (const prop of ['color', 'backgroundColor']) {
        const c = parse(cs[prop]);
        if (c && c[3] > 0.2) { const { h, s } = hue(c); if (h >= 245 && h <= 290 && s > 0.3) fail('warna violet/indigo', el, prop + ' ' + cs[prop]); }
      }
      // teks langsung di elemen ini
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join(' ').trim();
      if (!own) continue;
      if (emoji.test(own)) fail('emoji', el, own.slice(0, 20));
      if (el.closest('.bm, .receipt, [disabled], .sr-only, .ph-fallback, .demo-pill') || el.matches('option')) continue;
      if (parseFloat(cs.opacity) < 1 || el.closest('[aria-disabled="true"]')) continue;
      const fg = parse(cs.color), bg = bgOf(el);
      if (!fg || !bg) continue;
      const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const cr = ratio(fg, bg);
      if (cr < (large ? 3 : 4.5)) fail('kontras ' + cr.toFixed(2) + ':1', el, own.slice(0, 24));
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) fail('overflow horizontal', null, (document.documentElement.scrollWidth - innerWidth) + 'px');
    // KPI simetris: angka di baris kartu yang sama harus punya posisi atas & ukuran huruf sama
    document.querySelectorAll('.kpi-grid').forEach((g) => {
      const rows = {};
      g.querySelectorAll('.kpi').forEach((k) => {
        const top = Math.round(k.getBoundingClientRect().top);
        const v = k.querySelector('.value');
        if (!v) return;
        (rows[top] = rows[top] || []).push({ off: Math.round(v.getBoundingClientRect().top - top), fs: getComputedStyle(v).fontSize, clip: v.scrollWidth > v.clientWidth + 1 });
      });
      Object.values(rows).forEach((row) => {
        out.kpiRows.push(row);
        if (new Set(row.map((x) => x.off)).size > 1) fail('angka KPI tidak sejajar', null, JSON.stringify(row.map((x) => x.off)));
        if (new Set(row.map((x) => x.fs)).size > 1) fail('ukuran angka KPI berbeda', null, JSON.stringify(row.map((x) => x.fs)));
        if (row.some((x) => x.clip)) fail('angka KPI terpotong', null);
      });
    });
    return out;
  }, FLOATING);
}

async function run() {
  require('./build-dev.js').build();
  const browser = await chromium.launch();
  const report = {};
  let total = 0;
  // Oranye (default) di 3 ukuran; aksen lain di 390×844. Semua di tema terang & gelap.
  const combos = [];
  for (const theme of ['light', 'dark']) {
    for (const vp of [[360, 800], [390, 844], [800, 1280]]) combos.push([theme, 'orange', vp]);
    for (const acc of ['green', 'blue', 'maroon', 'brown']) combos.push([theme, acc, [390, 844]]);
  }
  for (const [theme, accent, [w, h]] of combos) {
    {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
      const page = await ctx.newPage();
      await page.addInitScript(([t, a]) => { try { localStorage.setItem('df_theme', JSON.stringify(t)); localStorage.setItem('df_accent', JSON.stringify(a)); } catch (e) { /* no-op */ } }, [theme, accent]);
      await page.goto('file://' + path.join(ROOT, 'dev', 'dist', 'index.html') + '?reset=1&latency=5');
      const idle = () => page.waitForFunction(() => !document.querySelector('#app .skel') && !document.querySelector('#app .state .spinner') && !document.querySelector('.refresh-bar') && !document.querySelector('.btn .spinner'), null, { timeout: 15000 }).then(() => page.waitForTimeout(60));
      const check = async (name) => {
        await idle();
        await page.evaluate(() => { document.getElementById('toast-root').innerHTML = ''; if (document.activeElement) document.activeElement.blur(); });
        const r = await audit(page);
        const k = `${theme} ${accent} ${w}x${h} ${name}`;
        report[k] = r;
        total += r.fails.length;
      };
      await page.waitForSelector('[data-screen="login"]');
      await check('login');
      await page.fill('input[name=username]', 'admin'); await page.fill('input[name=password]', 'admin123'); await page.click('#login-btn');
      await page.waitForSelector('[data-screen="dashboard"] .kpi');
      await check('dashboard');
      await page.click('.bnav [data-tab="kasir"]'); await page.waitForSelector('#kasir-grid .pcard');
      await check('kasir');
      await page.click('.pcard-main[aria-label="Detail Banana Bites"]'); await page.waitForSelector('[data-screen="product"]');
      await check('product');
      await page.click('[data-act="pdAdd"]'); await page.waitForSelector('[data-screen="kasir"]');
      await check('kasir+keranjang');
      await page.click('[data-act="openCart"] >> nth=0'); await page.waitForSelector('[data-screen="cart"]');
      await check('cart');
      await page.click('[data-act="checkout"]'); await page.waitForSelector('[data-screen="payment"] .method');
      await page.click('[data-act="payQuick"] >> nth=1');
      await check('payment');
      await page.click('[data-act="payNow"]'); await page.waitForSelector('[data-screen="receipt"] .receipt');
      await check('receipt');
      for (const s of ['orders', 'products', 'variants', 'prices', 'stock', 'production', 'expenses', 'expenseForm', 'reportSales', 'reportProducts', 'reportFinance', 'settings', 'more']) {
        await page.evaluate((n) => window.__DF.go(n, {}), s);
        await page.waitForSelector(`[data-screen="${s}"]`);
        await check(s);
      }
      await page.click('.order-row >> nth=0').catch(() => {});
      await page.evaluate(() => window.__DF.go('orders', {}));
      await page.click('.order-row >> nth=0'); await page.waitForSelector('[data-screen="order"] .kv-grid');
      await check('order');
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'taste-report.json'), JSON.stringify(report, null, 2));
  const byRule = {};
  for (const [k, r] of Object.entries(report)) for (const f of r.fails) { const rule = f.split(' @ ')[0].replace(/ [\d.]+:1/, ''); (byRule[rule] = byRule[rule] || []).push(k + ' → ' + f); }
  console.log(`Layar diperiksa: ${Object.keys(report).length} · FAIL: ${total}`);
  for (const [rule, list] of Object.entries(byRule)) { console.log(`\n${rule} (${list.length})`); list.slice(0, 8).forEach((x) => console.log('  ' + x)); }
  process.exitCode = total ? 1 : 0;
}
if (require.main === module) run();
module.exports = { audit };
