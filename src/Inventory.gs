/**
 * Inventory.gs — stok siap jual (produk & topping), mutasi, penyesuaian, produksi.
 *
 * Semua perubahan stok lewat applyStockChanges_() agar:
 * - saldo tidak pernah negatif,
 * - setiap perubahan punya baris STOCK_MOVEMENTS,
 * - penulisan dibatch.
 * Pemanggil WAJIB sudah berada di dalam withLock().
 */

function itemName_(itemType, itemId) {
  if (itemType === 'PRODUCT') {
    var p = Db.find('PRODUCTS', 'product_id', itemId);
    return p ? p.product_name : itemId;
  }
  var v = Db.find('VARIANTS', 'variant_id', itemId);
  return v ? v.variant_name : itemId;
}

/**
 * changes: [{ item_type, item_id, delta, movement_type, reference_type, reference_id, notes }]
 * Delta dengan item yang sama dijumlah dulu untuk validasi saldo.
 * Melempar INSUFFICIENT_STOCK tanpa menulis apa pun bila ada saldo yang akan negatif.
 */
function applyStockChanges_(changes, actorName, opts) {
  opts = opts || {};
  if (!changes.length) return [];
  var stocks = stockIndex_();
  var totals = {};
  changes.forEach(function (c) {
    var key = c.item_type + '|' + c.item_id;
    totals[key] = (totals[key] || 0) + c.delta;
  });
  var shortages = [];
  Object.keys(totals).forEach(function (key) {
    var s = stocks[key];
    if (!s) {
      var parts = key.split('|');
      shortages.push({ item_type: parts[0], item_id: parts[1], name: itemName_(parts[0], parts[1]),
        available: 0, required: -totals[key], reason: 'NO_STOCK_ROW' });
      return;
    }
    if (s.quantity + totals[key] < 0) {
      shortages.push({ item_type: s.item_type, item_id: s.item_id, name: itemName_(s.item_type, s.item_id),
        available: s.quantity, required: -totals[key], unit: s.unit });
    }
  });
  if (shortages.length) {
    var msg = shortages.map(function (x) {
      return x.reason === 'NO_STOCK_ROW' ? x.name + ' (stok belum diatur)'
        : x.name + ' (tersedia ' + x.available + ' ' + (x.unit || '') + ', butuh ' + x.required + ')';
    }).join(', ');
    fail('INSUFFICIENT_STOCK', (opts.shortagePrefix || 'Stok tidak cukup: ') + msg, { shortages: shortages });
  }

  var now = nowIso();
  var running = {};
  var movements = changes.filter(function (c) { return c.delta !== 0; }).map(function (c) {
    var key = c.item_type + '|' + c.item_id;
    running[key] = (running[key] === undefined ? stocks[key].quantity : running[key]) + c.delta;
    return {
      movement_id: newId('MOV'), item_type: c.item_type, item_id: c.item_id, movement_type: c.movement_type,
      quantity: Math.abs(c.delta), reference_type: c.reference_type || '', reference_id: c.reference_id || '',
      notes: optString(c.notes, 300), created_at: now, balance_after: running[key], created_by: actorName || ''
    };
  });
  var stockUpdates = Object.keys(running).map(function (key) {
    return { current: stocks[key], patch: { quantity: running[key], updated_at: now } };
  });
  Db.insertMany('STOCK_MOVEMENTS', movements);
  Db.updateMany('STOCKS', stockUpdates);
  return movements;
}

/* ---------- Baca ---------- */

function stock(payload) {
  var type = payload && payload.item_type;
  var prodMap = indexBy(Db.all('PRODUCTS'), 'product_id');
  var varMap = indexBy(Db.all('VARIANTS'), 'variant_id');
  var rows = Db.all('STOCKS').filter(function (s) { return !type || s.item_type === type; }).map(function (s) {
    var src = s.item_type === 'PRODUCT' ? prodMap[s.item_id] : varMap[s.item_id];
    var v = stockView_(s);
    return {
      stock_id: s.stock_id, item_type: s.item_type, item_id: s.item_id,
      name: src ? (src.product_name || src.variant_name) : '(item terhapus)',
      image_url: src ? src.image_url : '', image_position: src ? (src.image_position || 'center') : 'center', is_active: src ? src.is_active : false,
      quantity: v.quantity, minimum_stock: v.minimum_stock, unit: v.unit, status: v.status, updated_at: s.updated_at
    };
  });
  rows.sort(function (a, b) {
    if (a.item_type !== b.item_type) return a.item_type === 'PRODUCT' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  var low = rows.filter(function (r) { return r.is_active && (r.status === 'LOW' || r.status === 'OUT'); });
  return { items: rows, low_count: low.length };
}

function stockMovements(payload) {
  var limit = Math.min(toNumber(payload && payload.limit, 50), 300);
  var rows = Db.all('STOCK_MOVEMENTS').filter(function (m) {
    if (payload && payload.item_id && m.item_id !== payload.item_id) return false;
    if (payload && payload.item_type && m.item_type !== payload.item_type) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)) || b._row - a._row; });
  return rows.slice(0, limit).map(function (m) {
    var o = clean(m);
    o.movement_label = LABELS.MOVEMENT_TYPES[m.movement_type] || m.movement_type;
    o.direction = (m.movement_type === 'SALE_OUT' || m.movement_type === 'ADJUSTMENT_OUT') ? 'OUT' : 'IN';
    return o;
  });
}

/* ---------- Penyesuaian manual ---------- */

function adjustStock(payload, user) {
  return withLock(function () {
    var type = requireEnum(payload.item_type, ENUMS.ITEM_TYPES, 'Tipe item');
    var dir = requireEnum(payload.direction, ['IN', 'OUT'], 'Arah penyesuaian');
    var qty = requirePosInt(payload.quantity, 'Jumlah');
    var notes = requireString(payload.notes, 'Alasan penyesuaian', 300);
    var key = type + '|' + payload.item_id;
    if (!stockIndex_()[key]) fail('NOT_FOUND', 'Data stok tidak ditemukan.');
    var mv = applyStockChanges_([{
      item_type: type, item_id: payload.item_id, delta: dir === 'IN' ? qty : -qty,
      movement_type: dir === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      reference_type: 'MANUAL', reference_id: '', notes: notes
    }], user.display_name, { shortagePrefix: 'Pengurangan melebihi stok: ' });
    return { movement: mv[0], balance: mv[0].balance_after };
  });
}

function updateStockSettings(payload) {
  return withLock(function () {
    var s = Db.filter('STOCKS', function (x) { return x.item_type === payload.item_type && x.item_id === payload.item_id; })[0];
    if (!s) fail('NOT_FOUND', 'Data stok tidak ditemukan.');
    var patch = { updated_at: nowIso() };
    if (payload.minimum_stock !== undefined) patch.minimum_stock = requireNonNegInt(payload.minimum_stock, 'Stok minimum');
    return clean(Db.update('STOCKS', s, patch));
  });
}

/* ---------- Produksi ---------- */

function recordProduction(payload, user) {
  return withLock(function () {
    var clientRef = optString(payload.client_ref, 64);
    if (clientRef) {
      var dup = Db.find('PRODUCTION', 'client_ref', clientRef);
      if (dup) return { production: clean(dup), duplicate: true, balance: stockIndex_()['PRODUCT|' + dup.product_id].quantity };
    }
    var p = Db.find('PRODUCTS', 'product_id', payload.product_id);
    if (!p) fail('VALIDATION', 'Pilih produk yang valid.');
    var qty = requirePosInt(payload.quantity, 'Jumlah produksi');
    var date = payload.production_date || todayStr();
    if (!isValidDateStr(date)) fail('VALIDATION', 'Tanggal produksi tidak valid.');
    if (date > todayStr()) fail('VALIDATION', 'Tanggal produksi tidak boleh di masa depan.');
    if (!stockIndex_()['PRODUCT|' + p.product_id]) fail('NOT_FOUND', 'Data stok produk belum ada.');
    var row = {
      production_id: newId('PRD-IN'), product_id: p.product_id, quantity: qty, production_date: date,
      notes: optString(payload.notes, 300), created_at: nowIso(), client_ref: clientRef, created_by: user.display_name
    };
    Db.insert('PRODUCTION', row);
    var mv = applyStockChanges_([{
      item_type: 'PRODUCT', item_id: p.product_id, delta: qty, movement_type: 'PRODUCTION_IN',
      reference_type: 'PRODUCTION', reference_id: row.production_id, notes: row.notes
    }], user.display_name);
    return { production: row, duplicate: false, balance: mv[0].balance_after };
  });
}

function productions(payload) {
  var prodMap = indexBy(Db.all('PRODUCTS'), 'product_id');
  var limit = Math.min(toNumber(payload && payload.limit, 30), 200);
  var rows = Db.all('PRODUCTION').slice().sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at)) || b._row - a._row;
  });
  return rows.slice(0, limit).map(function (r) {
    var o = clean(r);
    var p = prodMap[r.product_id];
    o.product_name = p ? p.product_name : r.product_id;
    o.unit = p ? p.base_unit : '';
    return o;
  });
}
