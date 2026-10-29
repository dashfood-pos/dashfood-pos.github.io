/**
 * serve-web.js — uji lokal versi PWA (dist-web) dengan backend .gs asli di runtime tiruan.
 *
 * Meniru perilaku Web App Apps Script semirip mungkin:
 *   - API berada di ORIGIN LAIN dari halaman (seperti script.google.com vs github.io) → menguji CORS.
 *   - POST /macros/s/TEST/exec dijawab 302 ke /macros/echo?k=… (seperti Google → googleusercontent.com),
 *     lalu GET echo mengembalikan JSON. Keduanya membawa Access-Control-Allow-Origin: *.
 *   - OPTIONS (preflight) DITOLAK 405, seperti Apps Script → klien wajib "simple request" (text/plain).
 *
 *   node dev/serve-web.js            → halaman http://localhost:4173, API http://127.0.0.1:4174
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./load-gas');

const ROOT = path.join(__dirname, '..');

function seed() {
  const ctx = loadGas();
  const props = ctx.PropertiesService.getScriptProperties();
  props.setProperty('INIT_ADMIN_USERNAME', 'admin');
  props.setProperty('INIT_ADMIN_PASSWORD', 'admin123');
  props.setProperty('INIT_ADMIN_NAME', 'Admin');
  ctx.setupInitialAdmin();
  ctx.seedDemoData();
  const tok = ctx.api('login', { username: 'admin', password: 'admin123' }).data.token;
  ctx.api('saveUser', { username: 'kasir', display_name: 'Budi', role: 'STAFF', password: 'kasir123' }, tok);
  return ctx;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function start(opts = {}) {
  const webPort = opts.webPort || 4173, apiPort = opts.apiPort || 4174;
  const dir = opts.dir || path.join(ROOT, 'dist-web');
  const ctx = opts.ctx || seed();
  const stats = { posts: 0, preflights: 0, actions: [] };
  const pending = new Map();
  let n = 0;

  const web = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });

  const api = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') { stats.preflights++; res.writeHead(405, cors); res.end(); return; }
    if (req.method === 'POST' && u.pathname === '/macros/s/TEST/exec') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        stats.posts++;
        try { stats.actions.push(JSON.parse(body).action); } catch (e) { stats.actions.push('?'); }
        const out = ctx.doPost({ postData: { contents: body, type: req.headers['content-type'] } });
        const k = String(++n);
        pending.set(k, out.getContent());
        res.writeHead(302, Object.assign({ Location: `http://127.0.0.1:${apiPort}/macros/echo?k=${k}` }, cors));
        res.end();
      });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/macros/echo') {
      const k = u.searchParams.get('k');
      const content = pending.get(k);
      pending.delete(k);
      if (!content) { res.writeHead(404, cors); res.end(); return; }
      setTimeout(() => {
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
        res.end(content);
      }, opts.latency || 0);
      return;
    }
    res.writeHead(404, cors); res.end();
  });

  return new Promise((resolve) => {
    web.listen(webPort, () => api.listen(apiPort, () => resolve({
      webUrl: `http://localhost:${webPort}/`, apiUrl: `http://127.0.0.1:${apiPort}/macros/s/TEST/exec`, stats, ctx,
      close: () => Promise.all([new Promise((r) => web.close(r)), new Promise((r) => api.close(r))])
    })));
  });
}

if (require.main === module) {
  const { build } = require('../tools/build-web.js');
  build({ apiUrl: 'http://127.0.0.1:4174/macros/s/TEST/exec', unsafeApiUrl: true });
  start().then((s) => console.log('PWA lokal:', s.webUrl, '· API tiruan:', s.apiUrl, '· login admin/admin123'));
}
module.exports = { start, seed };
