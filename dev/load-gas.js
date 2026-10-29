/**
 * load-gas.js — memuat seluruh src/*.gs ke vm context Node di atas gas-mock.js.
 * Urutan file sengaja dibalik (Api.gs lebih dulu) untuk menguji bahwa kode
 * tidak bergantung pada urutan eksekusi file di Apps Script.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const MOCK = path.join(__dirname, 'gas-mock.js');

function gsFiles() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort().reverse();
}

function loadGas(options = {}) {
  const ctx = vm.createContext({ console, crypto: globalThis.crypto, Buffer, Intl });
  // Jam yang bisa digeser untuk test lintas hari.
  vm.runInContext(`
    (function () {
      var RealDate = Date;
      var offset = 0;
      function FakeDate() {
        var args = Array.prototype.slice.call(arguments);
        if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + offset).toString();
        var d = args.length === 0 ? new RealDate(RealDate.now() + offset) : new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();
        Object.setPrototypeOf(d, FakeDate.prototype);
        return d;
      }
      FakeDate.prototype = Object.create(RealDate.prototype);
      FakeDate.prototype.constructor = FakeDate;
      FakeDate.now = function () { return RealDate.now() + offset; };
      FakeDate.UTC = RealDate.UTC;
      FakeDate.parse = RealDate.parse;
      globalThis.Date = FakeDate;
      globalThis.__setClock = function (isoOrMs) {
        var target = typeof isoOrMs === 'number' ? isoOrMs : new RealDate(isoOrMs).getTime();
        offset = target - RealDate.now();
      };
      globalThis.__resetClock = function () { offset = 0; };
    })();
  `, ctx);
  vm.runInContext(fs.readFileSync(MOCK, 'utf8'), ctx, { filename: 'gas-mock.js' });
  vm.runInContext('var __mock = createGasMock({ Date: Date }); Object.assign(globalThis, __mock.globals);', ctx);
  for (const f of gsFiles()) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  if (options.setup !== false) {
    vm.runInContext('setupDashFood()', ctx);
  }
  return ctx;
}

/**
 * Memanggil api() seperti google.script.run: hasil wajib bisa diserialisasi
 * (Apps Script mengembalikan null untuk objek Date) — test gagal bila ada Date.
 */
function callApi(ctx, action, payload, token) {
  const res = ctx.api(action, payload || {}, token || null);
  assertSerializable(res, action);
  return JSON.parse(JSON.stringify(res));
}

function assertSerializable(v, where, seen = new Set()) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') throw new Error(`Return ${where} berisi function`);
    return;
  }
  if (Object.prototype.toString.call(v) === '[object Date]') throw new Error(`Return ${where} berisi Date (tidak didukung google.script.run)`);
  if (seen.has(v)) throw new Error(`Return ${where} berisi referensi melingkar`);
  seen.add(v);
  for (const k of Object.keys(v)) assertSerializable(v[k], `${where}.${k}`, seen);
  seen.delete(v);
}

module.exports = { loadGas, callApi, gsFiles };
