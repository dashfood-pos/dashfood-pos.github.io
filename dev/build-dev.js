/**
 * build-dev.js — merakit dev harness: UI asli (src/*.html) + backend asli (src/*.gs)
 * yang berjalan di browser di atas gas-mock.js. Output: dev/dist/index.html
 *
 *   node dev/build-dev.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(__dirname, 'dist');

function read(p) { return fs.readFileSync(p, 'utf8'); }

function include(name) {
  return read(path.join(SRC, name + '.html'));
}

function build() {
  const gs = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort()
    .map((f) => `\n/* ===== ${f} ===== */\n` + read(path.join(SRC, f))).join('\n');

  const gasScope = `
<script>
${read(path.join(__dirname, 'gas-mock.js'))}
</script>
<script>
window.__GAS = (function (RealDate) {
  var __off = 0;
  function FakeDate() {
    var args = Array.prototype.slice.call(arguments);
    if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + __off).toString();
    var d = args.length === 0 ? new RealDate(RealDate.now() + __off) : new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();
    Object.setPrototypeOf(d, FakeDate.prototype);
    return d;
  }
  FakeDate.prototype = Object.create(RealDate.prototype);
  FakeDate.prototype.constructor = FakeDate;
  FakeDate.now = function () { return RealDate.now() + __off; };
  FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;
  var Date = FakeDate;
  var __mock = createGasMock({ Date: FakeDate });
  var SpreadsheetApp = __mock.globals.SpreadsheetApp, LockService = __mock.globals.LockService,
      Utilities = __mock.globals.Utilities, PropertiesService = __mock.globals.PropertiesService,
      CacheService = __mock.globals.CacheService, Logger = __mock.globals.Logger, HtmlService = __mock.globals.HtmlService,
      DriveApp = __mock.globals.DriveApp;
${gs}
  return {
    mock: __mock, Db: Db,
    setClock: function (ms) { __off = ms === null ? 0 : ms - RealDate.now(); },
    fns: { api: api, setupDashFood: setupDashFood, setupInitialAdmin: setupInitialAdmin, seedDemoData: seedDemoData, todayStr: todayStr }
  };
})(window.Date);
</script>
<script>
${read(path.join(__dirname, 'dev-bridge.js'))}
</script>
`;

  let html = read(path.join(SRC, 'Index.html'));
  // Ganti scriptlet dulu, BARU sisipkan kode .gs (komentar di .gs bisa berisi contoh scriptlet).
  html = html.replace(/<\?!=\s*include\('App'\);?\s*\?>/, '%%GAS_AND_APP%%');
  html = html.replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (_, n) => include(n));
  // Di Apps Script, doGet menyisipkan publicInfo(); di harness dev-bridge mengisinya sebelum App berjalan.
  html = html.replace(/<\?!=\s*bootPublic\s*\?>/, 'window.__BOOT_PUBLIC || null');
  if (/<\?/.test(html)) throw new Error('Masih ada scriptlet Apps Script yang belum diganti');
  html = html.replace('%%GAS_AND_APP%%', () => gasScope + include('App'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(out, html);
  return out;
}

if (require.main === module) console.log('Dev harness:', build());
module.exports = { build };
