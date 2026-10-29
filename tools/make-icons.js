/**
 * make-icons.js — membuat ikon PWA (192, 512, maskable, apple-touch) dari logo.
 *
 *   node tools/make-icons.js                    → pakai logo pisang bawaan (src/Icons.html #logo-banana)
 *   node tools/make-icons.js path/ke/logo.png   → pakai logo resmi toko (disarankan PNG persegi, latar transparan)
 *   node tools/make-icons.js logo.png "#FFFFFF" → warna latar ikon (default gelap #15110E seperti layar login)
 *
 * Butuh Playwright (sudah dipakai untuk test UI). Hasil di web/icons/ (PWA) dan android/app/src/main/res/ (APK).
 * Commit file PNG-nya ke GitHub, sehingga GitHub Actions tidak perlu Playwright.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'icons');
const logoPath = process.argv[2];
const bg = process.argv[3] || '#15110E';

function logoMarkup() {
  if (logoPath) {
    const buf = fs.readFileSync(logoPath);
    const ext = path.extname(logoPath).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `<img src="data:${mime};base64,${buf.toString('base64')}" style="width:100%;height:100%;object-fit:contain">`;
  }
  const icons = fs.readFileSync(path.join(ROOT, 'src', 'Icons.html'), 'utf8');
  const m = icons.match(/<symbol id="logo-banana" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/);
  if (!m) throw new Error('Simbol #logo-banana tidak ditemukan');
  return `<svg viewBox="${m[1]}" style="width:100%;height:100%">${m[2]}</svg>`;
}

async function render(page, size, logoScale, radius, file) {
  const html = `<!doctype html><html><body style="margin:0">
  <div style="width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:${radius}px;overflow:hidden;
    background:${bg}">
    <div style="width:${Math.round(size * logoScale)}px;height:${Math.round(size * logoScale)}px">${logoMarkup()}</div>
  </div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage();
  await render(page, 192, 0.68, 0, 'icon-192.png');
  await render(page, 512, 0.68, 0, 'icon-512.png');
  await render(page, 512, 0.52, 0, 'maskable-512.png'); // zona aman maskable: logo di lingkaran 80%
  await render(page, 180, 0.66, 0, 'apple-touch-icon.png');
  // Ikon APK (Android TWA): mipmap legacy + foreground adaptive icon (zona aman 66%) + gambar splash.
  const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(RES, 'mipmap-' + d);
    fs.mkdirSync(dir, { recursive: true });
    await render(page, Math.round(48 * k), 0.68, 0, path.relative(OUT, path.join(dir, 'ic_launcher.png')));
    await render(page, Math.round(108 * k), 0.46, 0, path.relative(OUT, path.join(dir, 'ic_launcher_foreground.png')));
  }
  fs.mkdirSync(path.join(RES, 'drawable'), { recursive: true });
  await render(page, 384, 0.6, 0, path.relative(OUT, path.join(RES, 'drawable', 'splash.png')));
  await b.close();
  console.log('Ikon dibuat di', OUT, logoPath ? '(dari ' + logoPath + ')' : '(logo bawaan)');
})();
