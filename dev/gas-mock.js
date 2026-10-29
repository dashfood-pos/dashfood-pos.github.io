/**
 * gas-mock.js — runtime tiruan Google Apps Script untuk test lokal & dev harness.
 *
 * Berjalan di Node (vm context) maupun browser. BUKAN kode produksi.
 * Meniru perilaku penting Google Sheets:
 *  - string angka → number, "yyyy-MM-dd" → Date, "HH:mm" → Date (1899-12-30), "TRUE"/"FALSE" → boolean,
 *    KECUALI kolom berformat teks '@'.
 *  - getLastRow/getLastColumn mengabaikan sel kosong.
 * LockService meniru satu eksekusi (single-thread) dan melempar bila lock dipegang ganda.
 */
(function (root) {
  'use strict';

  /* ---------- SHA-256 sinkron (untuk Utilities.computeDigest) ---------- */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1,
    0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3,
    0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb,
    0xbef9a3f7, 0xc67178f2];
  function sha256Bytes(bytes) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length;
    var msg = bytes.slice();
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var bitLen = l * 8;
    for (var s = 7; s >= 0; s--) msg.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 0xff);
    var w = new Array(64);
    for (var i = 0; i < msg.length; i += 64) {
      for (var t = 0; t < 16; t++) {
        w[t] = (msg[i + t * 4] << 24) | (msg[i + t * 4 + 1] << 16) | (msg[i + t * 4 + 2] << 8) | msg[i + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = [];
    h.forEach(function (v) { out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); });
    return out.map(function (b2) { return b2 > 127 ? b2 - 256 : b2; }); // signed seperti Apps Script
  }

  function minimalPdf(text) {
    var safe = String(text).replace(/[()\\]/g, '');
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 226 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    var stream = 'BT /F1 9 Tf 10 280 Td (' + safe.substring(0, 80) + ') Tj ET';
    objs[3] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    var pdf = '%PDF-1.4\n', offsets = [];
    objs.forEach(function (o, i) { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { pdf += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return utf8Bytes(pdf);
  }

  function createGasMock(opts) {
    opts = opts || {};
    var DateCtor = opts.Date || Date;
    var TZ_OFFSET = '+08:00';
    var idCounter = 0;
    var readStats = { getValues: 0 };

    function convertForSheet(v, isText) {
      if (v === null || v === undefined) return '';
      if (isText) return v;
      if (typeof v !== 'string') return v;
      if (v === '') return '';
      if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return Number(v);
      if (/^(TRUE|FALSE)$/i.test(v)) return v.toUpperCase() === 'TRUE';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new DateCtor(v + 'T00:00:00' + TZ_OFFSET);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(v)) return new DateCtor(v);
      if (/^\d{1,2}:\d{2}$/.test(v)) return new DateCtor('1899-12-30T' + (v.length === 4 ? '0' + v : v) + ':00' + TZ_OFFSET);
      return v;
    }

    function Sheet(name, ss) {
      this._name = name;
      this._ss = ss;
      this._data = [];
      this._textCols = {};
      this._maxRows = 1000;
    }
    Sheet.prototype.getName = function () { return this._name; };
    Sheet.prototype.setName = function (n) { this._name = n; return this; };
    Sheet.prototype.getMaxRows = function () { return Math.max(this._maxRows, this._data.length); };
    Sheet.prototype.setFrozenRows = function () { return this; };
    Sheet.prototype.getLastRow = function () {
      for (var r = this._data.length - 1; r >= 0; r--) {
        var row = this._data[r] || [];
        for (var c = 0; c < row.length; c++) if (row[c] !== '' && row[c] !== null && row[c] !== undefined) return r + 1;
      }
      return 0;
    };
    Sheet.prototype.getLastColumn = function () {
      var max = 0;
      this._data.forEach(function (row) {
        for (var c = (row || []).length - 1; c >= 0; c--) {
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) { if (c + 1 > max) max = c + 1; break; }
        }
      });
      return max;
    };
    Sheet.prototype.getRange = function (row, col, numRows, numCols) {
      if (typeof row !== 'number') throw new Error('Mock hanya mendukung getRange(row, col, numRows, numCols)');
      return new Range(this, row, col, numRows || 1, numCols || 1);
    };
    Sheet.prototype.getDataRange = function () {
      return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    };
    Sheet.prototype.appendRow = function (values) {
      var r = this.getLastRow() + 1;
      this.getRange(r, 1, 1, values.length).setValues([values]);
      return this;
    };
    Sheet.prototype.copyTo = function (ss) {
      var copy = ss.insertSheet('Copy of ' + this._name);
      copy._data = this._data.map(function (r) { return r.slice(); });
      copy._textCols = JSON.parse(JSON.stringify(this._textCols));
      return copy;
    };

    function Range(sheet, row, col, nr, nc) {
      if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('Range tidak valid: ' + [row, col, nr, nc].join(','));
      this._s = sheet; this._r = row; this._c = col; this._nr = nr; this._nc = nc;
    }
    Range.prototype.getValues = function () {
      readStats.getValues++;
      var out = [];
      for (var i = 0; i < this._nr; i++) {
        var src = this._s._data[this._r - 1 + i] || [];
        var row = [];
        for (var j = 0; j < this._nc; j++) {
          var v = src[this._c - 1 + j];
          row.push(v === undefined || v === null ? '' : (v instanceof DateCtor ? new DateCtor(v.getTime()) : v));
        }
        out.push(row);
      }
      return out;
    };
    Range.prototype.getValue = function () { return this.getValues()[0][0]; };
    Range.prototype.setValues = function (values) {
      if (values.length !== this._nr) throw new Error('setValues: jumlah baris ' + values.length + ' ≠ range ' + this._nr);
      for (var i = 0; i < this._nr; i++) {
        if (values[i].length !== this._nc) throw new Error('setValues: jumlah kolom ' + values[i].length + ' ≠ range ' + this._nc);
        var rIdx = this._r - 1 + i;
        while (this._s._data.length <= rIdx) this._s._data.push([]);
        var row = this._s._data[rIdx];
        for (var j = 0; j < this._nc; j++) {
          var cIdx = this._c - 1 + j;
          while (row.length <= cIdx) row.push('');
          var isText = rIdx >= 1 && !!this._s._textCols[cIdx + 1];
          row[cIdx] = convertForSheet(values[i][j], isText);
        }
      }
      return this;
    };
    Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
    Range.prototype.setNumberFormat = function (fmt) {
      if (fmt === '@') for (var j = 0; j < this._nc; j++) this._s._textCols[this._c + j] = true;
      return this;
    };
    Range.prototype.setFontWeight = function () { return this; };
    Range.prototype.setBackground = function () { return this; };

    function Spreadsheet(id, name) {
      this._id = id; this._name = name; this._sheets = [];
    }
    Spreadsheet.prototype.getId = function () { return this._id; };
    Spreadsheet.prototype.getName = function () { return this._name; };
    Spreadsheet.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; };
    Spreadsheet.prototype.getSheets = function () { return this._sheets.slice(); };
    Spreadsheet.prototype.getSheetByName = function (n) {
      for (var i = 0; i < this._sheets.length; i++) if (this._sheets[i]._name === n) return this._sheets[i];
      return null;
    };
    Spreadsheet.prototype.insertSheet = function (n) {
      if (this.getSheetByName(n)) throw new Error('Sheet sudah ada: ' + n);
      var s = new Sheet(n, this);
      this._sheets.push(s);
      return s;
    };
    Spreadsheet.prototype.deleteSheet = function (s) {
      this._sheets = this._sheets.filter(function (x) { return x !== s; });
    };

    var spreadsheets = {};
    var active = new Spreadsheet('MOCK-ACTIVE', 'Dash Food (mock)');
    spreadsheets[active._id] = active;

    var SpreadsheetApp = {
      getActiveSpreadsheet: function () { return active; },
      openById: function (id) {
        if (!spreadsheets[id]) throw new Error('Spreadsheet tidak ditemukan: ' + id);
        return spreadsheets[id];
      },
      create: function (name) {
        var ss = new Spreadsheet('MOCK-' + (++idCounter), name);
        ss.insertSheet('Sheet1');
        spreadsheets[ss._id] = ss;
        return ss;
      },
      flush: function () {},
      getUi: function () { throw new Error('UI tidak tersedia di mock'); }
    };

    var lockHeld = false;
    var lockStats = { acquired: 0 };
    var LockService = {
      getScriptLock: function () {
        return {
          waitLock: function () {
            if (lockHeld) throw new Error('Mock: lock sudah dipegang (nested lock terdeteksi)');
            lockHeld = true; lockStats.acquired++;
          },
          tryLock: function () { if (lockHeld) return false; lockHeld = true; lockStats.acquired++; return true; },
          releaseLock: function () { lockHeld = false; },
          hasLock: function () { return lockHeld; }
        };
      }
    };

    function pad(n, l) { n = String(n); while (n.length < (l || 2)) n = '0' + n; return n; }
    function partsInTz(date, tz) {
      var f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset'
      });
      var o = {};
      f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
      var off = (o.timeZoneName || 'GMT+00:00').replace('GMT', '') || '+00:00';
      return { y: o.year, M: o.month, d: o.day, H: o.hour === '24' ? '00' : o.hour, m: o.minute, s: o.second, off: off };
    }
    var Utilities = {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: function (alg, text) { return sha256Bytes(utf8Bytes(String(text))); },
      getUuid: function () {
        var c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
        if (c) return c;
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
          var r = Math.random() * 16 | 0;
          return (ch === 'x' ? r : (r & 3 | 8)).toString(16);
        });
      },
      formatDate: function (date, tz, pattern) {
        var p = partsInTz(date, tz);
        var out = '', i = 0;
        while (i < pattern.length) {
          var ch = pattern.charAt(i);
          if (ch === "'") {
            var j = pattern.indexOf("'", i + 1);
            out += pattern.substring(i + 1, j);
            i = j + 1;
            continue;
          }
          var run = ch;
          while (pattern.charAt(i + run.length) === ch) run += ch;
          switch (run) {
            case 'yyyy': out += p.y; break;
            case 'MM': out += p.M; break;
            case 'dd': out += p.d; break;
            case 'HH': out += p.H; break;
            case 'mm': out += p.m; break;
            case 'ss': out += p.s; break;
            case 'XXX': out += p.off; break;
            default: out += run;
          }
          i += run.length;
        }
        return out;
      },
      base64Encode: function (bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] < 0 ? bytes[i] + 256 : bytes[i]);
        if (typeof btoa === 'function') return btoa(bin);
        return Buffer.from(bin, 'binary').toString('base64');
      },
      base64Decode: function (b64) {
        var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        if (!/^[A-Za-z0-9+/=\s]*$/.test(b64)) throw new Error('Invalid base64');
        var out = [];
        for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i); out.push(c > 127 ? c - 256 : c); }
        return out;
      },
      newBlob: function (data, mime, name) {
        var isBytes = Array.isArray(data);
        return {
          getBytes: function () { return isBytes ? data.slice() : utf8Bytes(String(data)); },
          getDataAsString: function () { return String(data); },
          getContentType: function () { return mime; },
          getName: function () { return name; },
          getAs: function (target) {
            if (target !== 'application/pdf') throw new Error('Mock hanya mendukung konversi PDF');
            var text = 'DASH FOOD DEV MOCK PDF - ' + (name || '');
            return { getBytes: function () { return minimalPdf(text); }, getContentType: function () { return target; } };
          }
        };
      }
    };

    function store() {
      var data = {};
      return {
        getProperty: function (k) { return data.hasOwnProperty(k) ? data[k] : null; },
        setProperty: function (k, v) { data[k] = String(v); return this; },
        deleteProperty: function (k) { delete data[k]; return this; },
        getProperties: function () { var o = {}; for (var k in data) o[k] = data[k]; return o; },
        getKeys: function () { return Object.keys(data); },
        _data: data
      };
    }
    var scriptProps = store();
    var PropertiesService = { getScriptProperties: function () { return scriptProps; } };

    var cacheData = {};
    var CacheService = {
      getScriptCache: function () {
        return {
          get: function (k) {
            var e = cacheData[k];
            if (!e) return null;
            if (e.exp < DateCtor.now()) { delete cacheData[k]; return null; }
            return e.v;
          },
          put: function (k, v, ttl) { cacheData[k] = { v: String(v), exp: DateCtor.now() + (ttl || 600) * 1000 }; },
          remove: function (k) { delete cacheData[k]; }
        };
      }
    };

    /* ---------- DriveApp (penyimpanan file di memori) ---------- */
    var driveFiles = {}, driveFolders = {};
    function DFile(id) { this._id = id; }
    DFile.prototype.getId = function () { return this._id; };
    DFile.prototype.getName = function () { return driveFiles[this._id].name; };
    DFile.prototype.getMimeType = function () { return driveFiles[this._id].mime; };
    DFile.prototype.getUrl = function () { return 'https://drive.google.com/file/d/' + this._id + '/view'; };
    DFile.prototype.setSharing = function (access, perm) { driveFiles[this._id].sharing = access + ':' + perm; return this; };
    DFile.prototype.setTrashed = function (t) { driveFiles[this._id].trashed = !!t; return this; };
    DFile.prototype.isTrashed = function () { return driveFiles[this._id].trashed; };
    DFile.prototype.getBlob = function () { var f = driveFiles[this._id]; return Utilities.newBlob(f.bytes.slice(), f.mime, f.name); };
    function DFolder(id) { this._id = id; }
    DFolder.prototype.getId = function () { return this._id; };
    DFolder.prototype.getName = function () { return driveFolders[this._id].name; };
    DFolder.prototype.createFile = function (blob) {
      var id = 'FILE' + (++idCounter) + Math.random().toString(36).slice(2, 8);
      driveFiles[id] = { bytes: blob.getBytes(), mime: blob.getContentType(), name: blob.getName(), folder: this._id, trashed: false, sharing: 'PRIVATE' };
      return new DFile(id);
    };
    var DriveApp = {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
      Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
      createFolder: function (name) { var id = 'FOLDER' + (++idCounter); driveFolders[id] = { name: name }; return new DFolder(id); },
      getFolderById: function (id) { if (!driveFolders[id]) throw new Error('Folder tidak ditemukan'); return new DFolder(id); },
      getFileById: function (id) { if (!driveFiles[id]) throw new Error('File tidak ditemukan'); return new DFile(id); }
    };

    var logs = [];
    var Logger = { log: function (m) { logs.push(String(m)); } };

    var HtmlService = {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: function () { throw new Error('HtmlService tidak tersedia di mock'); },
      createHtmlOutputFromFile: function () { throw new Error('HtmlService tidak tersedia di mock'); }
    };
    // ContentService (doPost JSON untuk PWA)
    var ContentService = {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (txt) {
        var out = { _content: String(txt), _mime: 'text/plain',
          setMimeType: function (m) { out._mime = m; return out; },
          getContent: function () { return out._content; }, getMimeType: function () { return out._mime; } };
        return out;
      }
    };

    return {
      globals: {
        SpreadsheetApp: SpreadsheetApp, LockService: LockService, Utilities: Utilities,
        PropertiesService: PropertiesService, CacheService: CacheService, Logger: Logger, HtmlService: HtmlService,
        DriveApp: DriveApp, ContentService: ContentService
      },
      driveFiles: driveFiles,
      readStats: readStats,
      activeSpreadsheet: active,
      spreadsheets: spreadsheets,
      lockStats: lockStats,
      isLockHeld: function () { return lockHeld; },
      logs: logs,
      sha256Hex: function (s) {
        return sha256Bytes(utf8Bytes(s)).map(function (b) { b = b < 0 ? b + 256 : b; return (b < 16 ? '0' : '') + b.toString(16); }).join('');
      },
      snapshot: function () {
        var o = {};
        active._sheets.forEach(function (s) {
          o[s._name] = { data: s._data.map(function (r) { return r.map(function (v) { return v instanceof DateCtor ? { __date: v.getTime() } : v; }); }), text: s._textCols };
        });
        return { sheets: o, props: scriptProps.getProperties(), drive: { files: driveFiles, folders: driveFolders } };
      },
      restore: function (snap) {
        active._sheets = [];
        Object.keys(snap.sheets).forEach(function (n) {
          var s = active.insertSheet(n);
          s._data = snap.sheets[n].data.map(function (r) { return r.map(function (v) { return v && v.__date ? new DateCtor(v.__date) : v; }); });
          s._textCols = snap.sheets[n].text || {};
        });
        Object.keys(snap.props || {}).forEach(function (k) { scriptProps.setProperty(k, snap.props[k]); });
        if (snap.drive) {
          Object.keys(snap.drive.files || {}).forEach(function (k) { driveFiles[k] = snap.drive.files[k]; });
          Object.keys(snap.drive.folders || {}).forEach(function (k) { driveFolders[k] = snap.drive.folders[k]; });
        }
      }
    };
  }

  root.createGasMock = createGasMock;
})(typeof globalThis !== 'undefined' ? globalThis : this);
