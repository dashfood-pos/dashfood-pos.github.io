/**
 * build-web.js — merakit versi PWA (untuk GitHub Pages) dari UI yang SAMA dengan Apps Script (src/*.html).
 *
 *   node tools/build-web.js            → dist-web/
 *   DF_API_URL=https://script.google.com/macros/s/XXX/exec node tools/build-web.js
 *
 * Tidak butuh npm install (hanya modul bawaan Node) supaya bisa jalan di GitHub Actions apa adanya.
 * URL API diambil dari env DF_API_URL, kalau kosong dari web/pwa.config.json → "apiUrl".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const WEB = path.join(ROOT, 'web');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function validApiUrl(u) {
  if (!u) return '';
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/.test(u)) {
    throw new Error('DF_API_URL tidak valid. Harus berbentuk https://script.google.com/macros/s/<ID>/exec (URL /exec, bukan /dev). Diterima: ' + u);
  }
  return u;
}

function build(opts = {}) {
  const cfg = JSON.parse(read(path.join(WEB, 'pwa.config.json')));
  const rawApi = opts.apiUrl !== undefined ? opts.apiUrl : (process.env.DF_API_URL || cfg.apiUrl || '').trim();
  // unsafeApiUrl hanya untuk test lokal (dev/serve-web.js); build sungguhan wajib URL /exec Apps Script.
  const apiUrl = opts.unsafeApiUrl ? rawApi : validApiUrl(rawApi);
  const out = opts.outDir || path.join(ROOT, 'dist-web');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });

  let html = read(path.join(SRC, 'Index.html'));
  html = html.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (_, n) => read(path.join(SRC, n + '.html')));
  // Di Apps Script info publik disisipkan server; di PWA diambil dari cache lokal / API (lihat boot()).
  html = html.replace(/<\?!=\s*bootPublic\s*\?>/, 'null');
  if (/<\?/.test(html)) throw new Error('Masih ada scriptlet Apps Script yang belum diganti');

  const head = [
    `<meta name="theme-color" content="${esc(cfg.themeColor)}">`,
    `<meta name="description" content="${esc(cfg.description)}">`,
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    `<meta name="apple-mobile-web-app-title" content="${esc(cfg.shortName)}">`,
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
    '<script src="config.js"></script>'
  ].join('\n  ');
  if (!html.includes('</title>')) throw new Error('Index.html tanpa <title>');
  html = html.replace('</title>', '</title>\n  ' + head);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(cfg.appName)}</title>`);
  const swReg = `<script>
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* app tetap jalan tanpa SW */ }); });
  }
</script>`;
  html = html.replace(/<\/body>\s*<\/html>\s*$/, swReg + '\n</body>\n</html>\n');

  const version = crypto.createHash('sha256').update(html + apiUrl).digest('hex').slice(0, 12);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'config.js'),
    '/* Dibuat otomatis oleh tools/build-web.js — URL Web App Apps Script (/exec). Bukan rahasia. */\n' +
    'window.DF_API_URL = ' + JSON.stringify(apiUrl) + ';\nwindow.DF_BUILD = ' + JSON.stringify(version) + ';\n');
  fs.writeFileSync(path.join(out, 'sw.js'), read(path.join(WEB, 'sw.js')).replace('__VERSION__', version));
  const manifest = {
    name: cfg.appName, short_name: cfg.shortName, description: cfg.description,
    id: './', start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: cfg.backgroundColor, theme_color: cfg.themeColor, lang: 'id',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  for (const f of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png']) {
    const p = path.join(WEB, 'icons', f);
    if (!fs.existsSync(p)) throw new Error('Ikon hilang: web/icons/' + f + ' (jalankan: node tools/make-icons.js)');
    fs.copyFileSync(p, path.join(out, 'icons', f));
  }
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  // Domain sendiri (opsional), mis. dashfood.my.id: GitHub Pages membaca file CNAME.
  const domain = (opts.customDomain !== undefined ? opts.customDomain : (process.env.DF_CUSTOM_DOMAIN || '')).trim().toLowerCase();
  if (domain) {
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain) || /github\.io$/.test(domain)) {
      throw new Error('DF_CUSTOM_DOMAIN tidak valid: ' + domain + ' (contoh benar: dashfood.my.id, tanpa https:// dan tanpa garis miring)');
    }
    fs.writeFileSync(path.join(out, 'CNAME'), domain + '\n');
  }
  // Digital Asset Links untuk APK (TWA): tanpa file ini Chrome menampilkan address bar di dalam APK.
  // File harus ada di ROOT domain (https://host/.well-known/assetlinks.json) → paling mudah bila repo bernama <username>.github.io.
  const twa = cfg.twa || {};
  if (twa.packageId && twa.sha256) {
    if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(twa.sha256)) throw new Error('twa.sha256 bukan sidik jari SHA-256 yang valid');
    fs.mkdirSync(path.join(out, '.well-known'), { recursive: true });
    fs.writeFileSync(path.join(out, '.well-known', 'assetlinks.json'), JSON.stringify([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: twa.packageId, sha256_cert_fingerprints: [twa.sha256] }
    }], null, 2));
  }
  return { out, apiUrl, version };
}

if (require.main === module) {
  const r = build();
  console.log('PWA dibuat di', r.out, '· versi', r.version);
  if (!r.apiUrl) {
    const msg = 'URL API kosong. Isi variabel DF_API_URL (GitHub: Settings → Secrets and variables → Actions → Variables) atau web/pwa.config.json → apiUrl.';
    if (process.env.CI) { console.error('GAGAL: ' + msg); process.exit(1); }
    console.warn('PERINGATAN: ' + msg + ' Tanpa ini aplikasi tidak bisa login.');
  }
  else console.log('API:', r.apiUrl);
}
module.exports = { build };
