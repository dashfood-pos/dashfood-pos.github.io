/**
 * Orders.gs — pembuatan order, riwayat, detail, pembatalan, struk PDF.
 *
 * Rumus (AUDIT_REPORT §6):
 *   topping_total (per unit) = Σ additional_price topping terpilih
 *   line_total               = (unit_price + topping_total) × quantity
 *   ORDER_ITEM_VARIANTS.quantity = quantity item (porsi topping terpakai)
 *   ORDER_ITEM_VARIANTS.subtotal = additional_price × quantity
 *   subtotal order           = Σ line_total
 *   total                    = subtotal − discount   (0 ≤ discount ≤ subtotal)
 */

var MAX_ORDER_LINES = 50;
var MAX_LINE_QTY = 999;

/**
 * Menghitung harga order dari data master (backend authoritative).
 * Mengabaikan harga apa pun yang dikirim browser.
 */
function priceOrder_(channel, items) {
  if (!items || !items.length) fail('VALIDATION', 'Keranjang kosong.');
  if (items.length > MAX_ORDER_LINES) fail('VALIDATION', 'Maksimal ' + MAX_ORDER_LINES + ' baris item per order.');
  var prodMap = indexBy(Db.all('PRODUCTS'), 'product_id');
  var varMap = indexBy(Db.all('VARIANTS'), 'variant_id');
  var pPrices = activeProductPrices_();
  var vPrices = activeVariantPrices_();
  var links = productVariantLinks_();
  var subtotal = 0;
  var lines = items.map(function (it, idx) {
    var p = prodMap[it.product_id];
    if (!p || !p.is_active) fail('VALIDATION', 'Produk pada baris ' + (idx + 1) + ' tidak tersedia.');
    var qty = Number(it.quantity);
    if (!isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty || qty > MAX_LINE_QTY) {
      fail('VALIDATION', 'Jumlah ' + p.product_name + ' harus 1–' + MAX_LINE_QTY + '.');
    }
    var price = (pPrices[p.product_id] || {})[channel];
    if (price === undefined || price === null) {
      fail('PRICE_MISSING', 'Harga ' + p.product_name + ' untuk ' + LABELS.CHANNELS[channel] + ' belum diatur.');
    }
    var allowed = links[p.product_id] || [];
    var seen = {};
    var vids = (it.variant_ids || []).map(String).filter(function (id) {
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
    var vlines = vids.map(function (vid) {
      var v = varMap[vid];
      if (!v || !v.is_active) fail('VALIDATION', 'Topping tidak tersedia untuk ' + p.product_name + '.');
      if (allowed.indexOf(vid) === -1) fail('VALIDATION', 'Topping ' + v.variant_name + ' tidak berlaku untuk ' + p.product_name + '.');
      var add = (vPrices[vid] || {})[channel];
      if (add === undefined || add === null) {
        fail('PRICE_MISSING', 'Harga topping ' + v.variant_name + ' untuk ' + LABELS.CHANNELS[channel] + ' belum diatur.');
      }
      return { variant_id: vid, variant_name: v.variant_name, additional_price: add, quantity: qty, subtotal: add * qty };
    });
    var toppingTotal = vlines.reduce(function (s, v) { return s + v.additional_price; }, 0);
    var lineTotal = (price + toppingTotal) * qty;
    subtotal += lineTotal;
    return {
      product_id: p.product_id, product_name: p.product_name, quantity: qty, unit_price: price,
      topping_total: toppingTotal, line_total: lineTotal, notes: optString(it.notes, 200), variants: vlines
    };
  });
  return { lines: lines, subtotal: subtotal };
}

/** Kebutuhan stok: produk = qty; tiap topping = 1 porsi per unit. */
function stockDemand_(lines) {
  var changes = [];
  lines.forEach(function (l) {
    changes.push({ item_type: 'PRODUCT', item_id: l.product_id, delta: -l.quantity });
    (l.variants || []).forEach(function (v) {
      changes.push({ item_type: 'VARIANT', item_id: v.variant_id, delta: -v.quantity });
    });
  });
  return changes;
}

function stockWarnings_(lines) {
  var stocks = stockIndex_();
  var need = {};
  stockDemand_(lines).forEach(function (c) {
    var k = c.item_type + '|' + c.item_id;
    need[k] = (need[k] || 0) - c.delta;
  });
  var warn = [];
  Object.keys(need).forEach(function (k) {
    var s = stocks[k];
    var avail = s ? s.quantity : 0;
    if (avail < need[k]) {
      var parts = k.split('|');
      warn.push({ item_type: parts[0], item_id: parts[1], name: itemName_(parts[0], parts[1]), available: avail,
        required: need[k], unit: s ? s.unit : '' });
    }
  });
  return warn;
}

/** Audit trail order: CREATED, UPDATED, PAID, CANCELLED. Pemanggil berada di dalam withLock. */
function logOrderEvent_(orderId, type, detail, user) {
  Db.insert('ORDER_EVENTS', {
    event_id: newId('EVT'), order_id: orderId, event_type: type, detail: optString(detail, 1000),
    created_at: nowIso(), created_by: user ? user.display_name : ''
  });
}

function nextOrderNumber_(dateStr) {
  var prefix = CONFIG.ORDER_PREFIX + '-' + compactDate(dateStr) + '-';
  var max = 0;
  Db.all('ORDERS').forEach(function (o) {
    if (String(o.order_number).indexOf(prefix) === 0) {
      var n = parseInt(String(o.order_number).substring(prefix.length), 10);
      if (n > max) max = n;
    }
  });
  var next = String(max + 1);
  while (next.length < 4) next = '0' + next;
  return prefix + next;
}

function createOrder(payload, user) {
  return withLock(function () {
    var clientRef = optString(payload.client_ref, 64);
    if (clientRef) {
      var existing = Db.find('ORDERS', 'client_ref', clientRef);
      if (existing) {
        var d = orderDetail({ order_id: existing.order_id });
        d.duplicate = true;
        return d;
      }
    }
    var s = getSettingsMap_();
    var channel = requireEnum(payload.channel, ENUMS.CHANNELS, 'Channel');
    if (enabledList_(s.channels_enabled, ENUMS.CHANNELS).indexOf(channel) === -1) {
      fail('VALIDATION', 'Channel ' + LABELS.CHANNELS[channel] + ' sedang dinonaktifkan.');
    }
    var priced = priceOrder_(channel, payload.items);
    var discount = toNumber(payload.discount, 0);
    if (discount !== 0 && !toBool(s.allow_discount)) fail('VALIDATION', 'Diskon tidak diizinkan.');
    if (discount < 0 || Math.floor(discount) !== discount) fail('VALIDATION', 'Diskon harus bilangan bulat ≥ 0.');
    if (discount > priced.subtotal) fail('VALIDATION', 'Diskon tidak boleh melebihi subtotal.');

    var now = nowIso(), date = todayStr();
    var order = {
      order_id: newId('ORD'), order_number: nextOrderNumber_(date),
      external_order_id: optString(payload.external_order_id, 60), order_date: date, order_time: nowTimeStr(),
      channel: channel, status: 'DRAFT', subtotal: priced.subtotal, discount: discount,
      total: priced.subtotal - discount, notes: optString(payload.notes, 300), created_at: now, updated_at: now,
      client_ref: clientRef, cashier_id: user.user_id, cashier_name: user.display_name,
      completed_at: '', cancelled_at: '', cancel_reason: '', receipt_logo_url: '', revision: 0
    };
    var itemRows = [], varRows = [];
    priced.lines.forEach(function (l) {
      var oiId = newId('OIT');
      itemRows.push({ order_item_id: oiId, order_id: order.order_id, product_id: l.product_id, quantity: l.quantity,
        unit_price: l.unit_price, topping_total: l.topping_total, line_total: l.line_total, notes: l.notes,
        created_at: now, product_name: l.product_name });
      l.variants.forEach(function (v) {
        varRows.push({ id: newId('OIV'), order_item_id: oiId, variant_id: v.variant_id, quantity: v.quantity,
          additional_price: v.additional_price, subtotal: v.subtotal, created_at: now, variant_name: v.variant_name });
      });
    });
    // Item ditulis lebih dulu; header order terakhir, sehingga order tidak pernah tampil tanpa item.
    Db.insertMany('ORDER_ITEMS', itemRows);
    Db.insertMany('ORDER_ITEM_VARIANTS', varRows);
    Db.insert('ORDERS', order);
    logOrderEvent_(order.order_id, 'CREATED', 'Total ' + formatRupiah(order.total) + ' · ' + itemsSummary_(priced.lines.map(function (l) {
      return { product_name: l.product_name, quantity: l.quantity, variant_label: variantLabel_(l.variants) };
    })), user);
    var detail = orderDetail({ order_id: order.order_id });
    detail.duplicate = false;
    detail.stock_warnings = stockWarnings_(priced.lines);
    return detail;
  });
}

/* ---------- Baca ---------- */

function variantLabel_(vars) {
  return vars.length ? vars.map(function (v) { return v.variant_name; }).join(', ') : '';
}

function loadOrderLines_(orderIds) {
  var idSet = {};
  orderIds.forEach(function (id) { idSet[id] = true; });
  var items = Db.filter('ORDER_ITEMS', function (i) { return idSet[i.order_id]; });
  var itemIds = {};
  items.forEach(function (i) { itemIds[i.order_item_id] = true; });
  var vars = groupBy(Db.filter('ORDER_ITEM_VARIANTS', function (v) { return itemIds[v.order_item_id]; }), 'order_item_id');
  var byOrder = {};
  items.forEach(function (i) {
    var o = clean(i);
    o.variants = (vars[i.order_item_id] || []).map(clean);
    o.variant_label = variantLabel_(o.variants);
    (byOrder[i.order_id] = byOrder[i.order_id] || []).push(o);
  });
  return byOrder;
}

function itemsSummary_(lines) {
  return (lines || []).map(function (l) {
    return l.product_name + (l.variant_label ? ' (' + l.variant_label + ')' : '') + ' ×' + l.quantity;
  }).join(', ');
}

function orders(payload) {
  payload = payload || {};
  var range = resolvePeriod(payload);
  var q = optString(payload.q, 60).toLowerCase();
  var list = Db.filter('ORDERS', function (o) {
    if (o.order_date < range.from || o.order_date > range.to) return false;
    if (payload.channel && o.channel !== payload.channel) return false;
    if (payload.status && o.status !== payload.status) return false;
    return true;
  });
  var lines = loadOrderLines_(list.map(function (o) { return o.order_id; }));
  var pays = groupBy(Db.all('PAYMENTS'), 'order_id');
  var out = list.map(function (o) {
    var summary = itemsSummary_(lines[o.order_id]);
    var pay = (pays[o.order_id] || []).filter(function (p) { return p.status === 'PAID' || p.status === 'REFUNDED'; })[0];
    return {
      order_id: o.order_id, order_number: o.order_number, external_order_id: o.external_order_id,
      order_date: o.order_date, order_time: o.order_time, channel: o.channel, channel_label: LABELS.CHANNELS[o.channel],
      status: o.status, status_label: LABELS.ORDER_STATUSES[o.status], total: o.total, items_summary: summary,
      item_count: (lines[o.order_id] || []).reduce(function (s, l) { return s + l.quantity; }, 0),
      payment_method: pay ? pay.payment_method : '', created_at: o.created_at
    };
  }).filter(function (o) {
    if (!q) return true;
    return o.order_number.toLowerCase().indexOf(q) !== -1 || o.items_summary.toLowerCase().indexOf(q) !== -1 ||
      String(o.external_order_id).toLowerCase().indexOf(q) !== -1;
  });
  // created_at presisi per detik → urutan kedua nomor transaksi agar order di detik yang sama tetap urut.
  out.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at)) || String(b.order_number).localeCompare(String(a.order_number));
  });
  return { range: range, orders: out };
}

function orderDetail(payload) {
  var o = Db.find('ORDERS', 'order_id', payload.order_id);
  if (!o) fail('NOT_FOUND', 'Transaksi tidak ditemukan.');
  var lines = loadOrderLines_([o.order_id])[o.order_id] || [];
  var payments = Db.filter('PAYMENTS', function (p) { return p.order_id === o.order_id; }).map(clean);
  var d = clean(o);
  d.channel_label = LABELS.CHANNELS[o.channel];
  d.status_label = LABELS.ORDER_STATUSES[o.status];
  d.items = lines;
  d.items_summary = itemsSummary_(lines);
  d.payments = payments.map(function (p) {
    p.payment_method_label = LABELS.PAYMENT_METHODS[p.payment_method] || p.payment_method;
    return p;
  });
  d.payment = d.payments.filter(function (p) { return p.status === 'PAID' || p.status === 'REFUNDED'; })[0] || null;
  d.events = Db.filter('ORDER_EVENTS', function (e) { return e.order_id === o.order_id; }).map(clean)
    .sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
  d.editable = (o.status === 'DRAFT' || o.status === 'CONFIRMED') && !d.payments.some(function (p) { return p.status === 'PAID'; });
  return d;
}

/* ---------- Pembatalan ---------- */

function cancelOrder(payload, user) {
  return withLock(function () {
    var o = Db.find('ORDERS', 'order_id', payload.order_id);
    if (!o) fail('NOT_FOUND', 'Transaksi tidak ditemukan.');
    if (o.status === 'CANCELLED') fail('ALREADY_CANCELLED', 'Transaksi sudah dibatalkan.');
    // Proteksi backend: pemanggil harus menyebut nomor transaksi yang dibatalkan (dikirim oleh dialog konfirmasi).
    if (String(payload.confirm_order_number || '') !== o.order_number) {
      fail('CONFIRM_REQUIRED', 'Konfirmasi pembatalan tidak valid. Ulangi dari dialog konfirmasi.');
    }
    var reason = optString(payload.reason, 300);
    var now = nowIso();
    var hasPaid = Db.filter('PAYMENTS', function (p) { return p.order_id === o.order_id && p.status === 'PAID'; }).length > 0;
    if ((o.status === 'DRAFT' || o.status === 'CONFIRMED') && !hasPaid) {
      Db.update('ORDERS', o, { status: 'CANCELLED', cancelled_at: now, cancel_reason: reason || 'Order belum dibayar dibatalkan',
        updated_at: now });
      logOrderEvent_(o.order_id, 'CANCELLED', 'Belum dibayar · stok tidak berubah' + (reason ? ' · ' + reason : ''), user);
      return orderDetail({ order_id: o.order_id });
    }
    // COMPLETED → butuh role & alasan, stok dikembalikan
    requireRole_(user, 'MANAGER');
    if (!reason) fail('VALIDATION', 'Alasan pembatalan wajib diisi.');
    var sold = Db.filter('STOCK_MOVEMENTS', function (m) {
      return m.reference_type === 'ORDER' && m.reference_id === o.order_id && m.movement_type === 'SALE_OUT';
    });
    var reversed = Db.filter('STOCK_MOVEMENTS', function (m) {
      return m.reference_type === 'ORDER' && m.reference_id === o.order_id && m.movement_type === 'CANCEL_REVERSE';
    });
    if (reversed.length) fail('ALREADY_CANCELLED', 'Stok untuk transaksi ini sudah pernah dikembalikan.');
    applyStockChanges_(sold.map(function (m) {
      return { item_type: m.item_type, item_id: m.item_id, delta: m.quantity, movement_type: 'CANCEL_REVERSE',
        reference_type: 'ORDER', reference_id: o.order_id, notes: 'Batal ' + o.order_number + ': ' + reason };
    }), user.display_name);
    var paid = Db.filter('PAYMENTS', function (p) { return p.order_id === o.order_id && p.status === 'PAID'; });
    Db.updateMany('PAYMENTS', paid.map(function (p) { return { current: p, patch: { status: 'REFUNDED' } }; }));
    Db.update('ORDERS', o, { status: 'CANCELLED', cancelled_at: now, cancel_reason: reason, updated_at: now });
    logOrderEvent_(o.order_id, 'CANCELLED', 'Sudah dibayar · ' + formatRupiah(o.total) + ' dikembalikan · stok ' + sold.length +
      ' item dikembalikan · ' + reason, user);
    return orderDetail({ order_id: o.order_id });
  });
}

/**
 * Edit order yang BELUM dibayar. Harga dihitung ulang dari master (order belum final).
 * Baris item lama tidak dihapus: order_id-nya diberi akhiran ~R<n> (revisi lama) sebagai jejak audit,
 * dan perubahan dicatat di ORDER_EVENTS. Order yang sudah dibayar tidak bisa diedit.
 */
function updateOrder(payload, user) {
  return withLock(function () {
    var o = Db.find('ORDERS', 'order_id', payload.order_id);
    if (!o) fail('NOT_FOUND', 'Transaksi tidak ditemukan.');
    if (o.status !== 'DRAFT' && o.status !== 'CONFIRMED') {
      fail('NOT_EDITABLE', 'Order ' + o.order_number + ' berstatus ' + LABELS.ORDER_STATUSES[o.status] +
        ' dan tidak bisa diedit. Gunakan pembatalan untuk mengoreksi transaksi yang sudah dibayar.');
    }
    if (Db.filter('PAYMENTS', function (p) { return p.order_id === o.order_id && p.status === 'PAID'; }).length) {
      fail('NOT_EDITABLE', 'Order sudah memiliki pembayaran dan tidak bisa diedit.');
    }
    var s = getSettingsMap_();
    var channel = requireEnum(payload.channel || o.channel, ENUMS.CHANNELS, 'Channel');
    if (enabledList_(s.channels_enabled, ENUMS.CHANNELS).indexOf(channel) === -1) fail('VALIDATION', 'Channel sedang dinonaktifkan.');
    var priced = priceOrder_(channel, payload.items);
    var discount = toNumber(payload.discount, 0);
    if (discount !== 0 && !toBool(s.allow_discount)) fail('VALIDATION', 'Diskon tidak diizinkan.');
    if (discount < 0 || Math.floor(discount) !== discount) fail('VALIDATION', 'Diskon harus bilangan bulat ≥ 0.');
    if (discount > priced.subtotal) fail('VALIDATION', 'Diskon tidak boleh melebihi subtotal.');

    var before = orderDetail({ order_id: o.order_id });
    var rev = toNumber(o.revision, 0) + 1;
    var now = nowIso();
    var oldItems = Db.filter('ORDER_ITEMS', function (i) { return i.order_id === o.order_id; });
    Db.updateMany('ORDER_ITEMS', oldItems.map(function (i) { return { current: i, patch: { order_id: o.order_id + '~R' + (rev - 1) } }; }));
    var itemRows = [], varRows = [];
    priced.lines.forEach(function (l) {
      var oiId = newId('OIT');
      itemRows.push({ order_item_id: oiId, order_id: o.order_id, product_id: l.product_id, quantity: l.quantity,
        unit_price: l.unit_price, topping_total: l.topping_total, line_total: l.line_total, notes: l.notes,
        created_at: now, product_name: l.product_name });
      l.variants.forEach(function (v) {
        varRows.push({ id: newId('OIV'), order_item_id: oiId, variant_id: v.variant_id, quantity: v.quantity,
          additional_price: v.additional_price, subtotal: v.subtotal, created_at: now, variant_name: v.variant_name });
      });
    });
    Db.insertMany('ORDER_ITEMS', itemRows);
    Db.insertMany('ORDER_ITEM_VARIANTS', varRows);
    Db.update('ORDERS', o, {
      channel: channel, subtotal: priced.subtotal, discount: discount, total: priced.subtotal - discount,
      notes: optString(payload.notes, 300), external_order_id: optString(payload.external_order_id, 60),
      revision: rev, updated_at: now
    });
    logOrderEvent_(o.order_id, 'UPDATED', 'Revisi ' + rev + ': ' + formatRupiah(before.total) + ' → ' + formatRupiah(priced.subtotal - discount) +
      ' · sebelum: ' + before.items_summary, user);
    var d = orderDetail({ order_id: o.order_id });
    d.stock_warnings = stockWarnings_(priced.lines);
    return d;
  });
}

/* ---------- Struk PDF ---------- */

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function receiptHtml_(d, s, logoSrc) {
  function num(n) { return formatRupiah(n).replace('Rp ', ''); }
  var rows = d.items.map(function (i) {
    return '<tr><td>' + escHtml_(i.product_name) + (i.variant_label ? '<br><small>+ ' + escHtml_(i.variant_label) + '</small>' :
      '') + '</td><td class="r">' + i.quantity + '</td><td class="r">' + num(i.unit_price + i.topping_total) +
      '</td><td class="r">' + num(i.line_total) + '</td></tr>';
  }).join('');
  var p = d.payment;
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;font-size:11px;color:#222;width:280px;margin:0 auto}' +
    'h1{font-size:16px;text-align:center;margin:4px 0}.c{text-align:center}.r{text-align:right}' +
    'table{width:100%;border-collapse:collapse}td,th{padding:2px 0;vertical-align:top}' +
    'hr{border:0;border-top:1px dashed #999;margin:6px 0}small{color:#666}</style></head><body>' +
    (logoSrc ? '<div class="c"><img src="' + logoSrc + '" style="max-width:72px;max-height:72px;object-fit:contain"></div>' : '') +
    '<h1>' + escHtml_(s.store_name) + '</h1><div class="c">' + escHtml_(s.store_tagline) + '<br>' +
    escHtml_(s.store_address) + (s.store_phone ? '<br>Telp. ' + escHtml_(s.store_phone) : '') + '</div><hr>' +
    '<table><tr><td>No. Transaksi</td><td class="r">' + escHtml_(d.order_number) + '</td></tr>' +
    '<tr><td>Tanggal</td><td class="r">' + escHtml_(d.order_date + ' ' + d.order_time) + '</td></tr>' +
    '<tr><td>Channel</td><td class="r">' + escHtml_(d.channel_label) + '</td></tr>' +
    '<tr><td>Kasir</td><td class="r">' + escHtml_(d.cashier_name) + '</td></tr></table><hr>' +
    '<table><tr><th align="left">Item</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Total</th></tr>' +
    rows + '</table><hr><table>' +
    '<tr><td>Subtotal</td><td class="r">' + num(d.subtotal) + '</td></tr>' +
    '<tr><td>Diskon</td><td class="r">' + num(d.discount) + '</td></tr>' +
    '<tr><td><b>Total</b></td><td class="r"><b>' + formatRupiah(d.total) + '</b></td></tr></table><hr>' +
    (p ? '<table><tr><td>Pembayaran</td><td class="r">' + escHtml_(p.payment_method_label) + '</td></tr>' +
      '<tr><td>Uang Diterima</td><td class="r">' + num(p.received_amount) + '</td></tr>' +
      '<tr><td>Kembalian</td><td class="r">' + num(p.change_amount) + '</td></tr></table><hr>' : '') +
    (d.status === 'CANCELLED' ? '<p class="c"><b>DIBATALKAN</b></p>' : '') +
    '<p class="c">' + escHtml_(s.receipt_footer).replace(/\n/g, '<br>') + '</p></body></html>';
}

function receiptPdf(payload) {
  var d = orderDetail(payload);
  if (d.status !== 'COMPLETED' && d.status !== 'CANCELLED') fail('VALIDATION', 'Struk hanya tersedia untuk transaksi yang sudah dibayar.');
  var s = getSettingsMap_();
  var logoSrc = null;
  if (toBool(s.receipt_show_logo)) {
    var url = d.receipt_logo_url || s.receipt_logo_url || s.store_logo_url;
    logoSrc = url ? (mediaDataUrl_(url) || escHtml_(url)) : DEFAULT_LOGO_DATA_URL;
  }
  var blob = Utilities.newBlob(receiptHtml_(d, s, logoSrc), 'text/html', d.order_number + '.html').getAs('application/pdf');
  return {
    filename: 'Struk-' + d.order_number + '.pdf', mime: 'application/pdf',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}
