/**
 * Reports.gs — dashboard & laporan. Semua angka dihitung dari sheet transaksi.
 *
 * Definisi:
 * - Penjualan diakui = order berstatus COMPLETED (order DIBATALKAN tidak dihitung).
 * - Omzet = Σ ORDERS.total (setelah diskon) dari penjualan diakui, berdasarkan order_date.
 * - Pengeluaran = Σ EXPENSES.amount berdasarkan expense_date.
 * - Laba bersih sederhana = Omzet − Pengeluaran. BUKAN laba akuntansi (tanpa HPP, pajak, biaya platform).
 * - Pendapatan per produk = Σ line_total (sebelum diskon order).
 */

var METRIC_DEFINITIONS = {
  omzet: 'Total nilai transaksi berstatus Selesai (setelah diskon) pada periode ini.',
  transaksi: 'Jumlah transaksi berstatus Selesai.',
  pengeluaran: 'Total pengeluaran yang dicatat pada periode ini.',
  laba_bersih: 'Omzet dikurangi pengeluaran tercatat. Belum memperhitungkan HPP, pajak, dan potongan/komisi platform, jadi bukan laba akuntansi.',
  pendapatan_produk: 'Nilai baris item sebelum diskon order.',
  hpp: 'Belum tersedia: data biaya per produk belum dicatat di sistem.'
};

function completedOrders_(from, to, channel) {
  return Db.filter('ORDERS', function (o) {
    return o.status === 'COMPLETED' && o.order_date >= from && o.order_date <= to && (!channel || o.channel === channel);
  });
}

function sumTotal_(orders) {
  return orders.reduce(function (s, o) { return s + o.total; }, 0);
}

function pctChange_(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function expensesIn_(from, to) {
  return Db.filter('EXPENSES', function (e) { return e.expense_date >= from && e.expense_date <= to; });
}

function byChannel_(orders) {
  var s = getSettingsMap_();
  var enabled = enabledList_(s.channels_enabled, ENUMS.CHANNELS);
  var omzet = sumTotal_(orders);
  var map = {};
  ENUMS.CHANNELS.forEach(function (ch) { map[ch] = { channel: ch, label: LABELS.CHANNELS[ch], omzet: 0, count: 0 }; });
  orders.forEach(function (o) { map[o.channel].omzet += o.total; map[o.channel].count += 1; });
  return ENUMS.CHANNELS.filter(function (ch) { return enabled.indexOf(ch) !== -1 || map[ch].count > 0; })
    .map(function (ch) {
      var r = map[ch];
      r.pct = omzet ? Math.round((r.omzet / omzet) * 1000) / 10 : 0;
      return r;
    });
}

function productRows_(orders) {
  var lines = loadOrderLines_(orders.map(function (o) { return o.order_id; }));
  var prodMap = indexBy(Db.all('PRODUCTS'), 'product_id');
  var agg = {};
  Object.keys(lines).forEach(function (oid) {
    lines[oid].forEach(function (l) {
      var key = l.product_id + '|' + l.variant_label;
      var p = prodMap[l.product_id];
      if (!agg[key]) {
        agg[key] = {
          product_id: l.product_id, product_name: l.product_name, variant_label: l.variant_label,
          label: l.product_name + (l.variant_label ? ' - ' + l.variant_label : ''),
          image_url: p ? p.image_url : '', image_position: p ? (p.image_position || 'center') : 'center', unit: p ? p.base_unit : '', quantity: 0, revenue: 0
        };
      }
      agg[key].quantity += l.quantity;
      agg[key].revenue += l.line_total;
    });
  });
  return Object.keys(agg).map(function (k) { return agg[k]; });
}

function dashboard(payload) {
  var range = resolvePeriod(payload || { period: 'today' });
  var cur = completedOrders_(range.from, range.to);
  var prev = completedOrders_(range.prev_from, range.prev_to);
  var omzet = sumTotal_(cur), prevOmzet = sumTotal_(prev);
  var exp = expensesIn_(range.from, range.to).reduce(function (s, e) { return s + e.amount; }, 0);
  var top = productRows_(cur).sort(function (a, b) { return b.quantity - a.quantity || b.revenue - a.revenue; }).slice(0, 5);
  var st = stock({});
  return {
    range: range,
    kpi: {
      omzet: omzet, omzet_change_pct: pctChange_(omzet, prevOmzet),
      transaksi: cur.length, transaksi_change_pct: pctChange_(cur.length, prev.length),
      pengeluaran: exp, laba_bersih: omzet - exp
    },
    by_channel: byChannel_(cur),
    top_products: top,
    low_stock: st.items.filter(function (r) { return r.is_active && (r.status === 'LOW' || r.status === 'OUT'); }),
    definitions: METRIC_DEFINITIONS,
    data_mode: getSettingsMap_().data_mode
  };
}

function reportSales(payload) {
  payload = payload || {};
  var range = resolvePeriod(payload);
  if (range.days > 366) fail('INVALID_PERIOD', 'Rentang laporan maksimal 366 hari.');
  var channel = payload.channel || '';
  if (channel) requireEnum(channel, ENUMS.CHANNELS, 'Channel');
  var cur = completedOrders_(range.from, range.to, channel);
  var prev = completedOrders_(range.prev_from, range.prev_to, channel);
  var daily = {};
  for (var i = 0; i < range.days; i++) daily[addDays(range.from, i)] = { date: addDays(range.from, i), omzet: 0, count: 0 };
  cur.forEach(function (o) { daily[o.order_date].omzet += o.total; daily[o.order_date].count += 1; });
  var pays = indexBy(Db.filter('PAYMENTS', function (p) { return p.status === 'PAID'; }), 'order_id');
  var byMethod = {};
  ENUMS.PAYMENT_METHODS.forEach(function (m) { byMethod[m] = { method: m, label: LABELS.PAYMENT_METHODS[m], omzet: 0, count: 0 }; });
  cur.forEach(function (o) {
    var p = pays[o.order_id];
    if (p) { byMethod[p.payment_method].omzet += o.total; byMethod[p.payment_method].count += 1; }
  });
  var omzet = sumTotal_(cur);
  var cancelled = Db.filter('ORDERS', function (o) {
    return o.status === 'CANCELLED' && o.completed_at && o.order_date >= range.from && o.order_date <= range.to &&
      (!channel || o.channel === channel);
  });
  return {
    range: range, channel: channel,
    summary: {
      omzet: omzet, omzet_change_pct: pctChange_(omzet, sumTotal_(prev)), transaksi: cur.length,
      transaksi_change_pct: pctChange_(cur.length, prev.length),
      rata_rata: cur.length ? Math.round(omzet / cur.length) : 0,
      diskon: cur.reduce(function (s, o) { return s + o.discount; }, 0),
      dibatalkan_setelah_bayar: cancelled.length
    },
    daily: Object.keys(daily).sort().map(function (k) { return daily[k]; }),
    by_channel: byChannel_(cur),
    by_method: ENUMS.PAYMENT_METHODS.map(function (m) { return byMethod[m]; }).filter(function (m) { return m.count > 0; }),
    definitions: METRIC_DEFINITIONS
  };
}

function reportProducts(payload) {
  payload = payload || {};
  var range = resolvePeriod(payload);
  var channel = payload.channel || '';
  if (channel) requireEnum(channel, ENUMS.CHANNELS, 'Channel');
  var cur = completedOrders_(range.from, range.to, channel);
  var rows = productRows_(cur).sort(function (a, b) { return b.revenue - a.revenue || b.quantity - a.quantity; });
  var totalRevenue = rows.reduce(function (s, r) { return s + r.revenue; }, 0);
  rows.forEach(function (r) { r.pct = totalRevenue ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0; });
  var byProduct = {};
  rows.forEach(function (r) {
    var b = byProduct[r.product_id] || (byProduct[r.product_id] = { product_id: r.product_id, product_name: r.product_name,
      unit: r.unit, quantity: 0, revenue: 0 });
    b.quantity += r.quantity;
    b.revenue += r.revenue;
  });
  return {
    range: range, channel: channel, rows: rows,
    by_product: Object.keys(byProduct).map(function (k) { return byProduct[k]; })
      .sort(function (a, b) { return b.revenue - a.revenue; }),
    total_revenue: totalRevenue, total_quantity: rows.reduce(function (s, r) { return s + r.quantity; }, 0),
    definitions: METRIC_DEFINITIONS
  };
}

function reportFinance(payload) {
  var range = resolvePeriod(payload || {});
  var cur = completedOrders_(range.from, range.to);
  var omzet = sumTotal_(cur);
  var exps = expensesIn_(range.from, range.to);
  var expTotal = exps.reduce(function (s, e) { return s + e.amount; }, 0);
  var byCat = {};
  exps.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  var prevOmzet = sumTotal_(completedOrders_(range.prev_from, range.prev_to));
  var prevExp = expensesIn_(range.prev_from, range.prev_to).reduce(function (s, e) { return s + e.amount; }, 0);
  return {
    range: range,
    summary: {
      omzet: omzet, pengeluaran: expTotal, laba_bersih: omzet - expTotal, transaksi: cur.length,
      omzet_change_pct: pctChange_(omzet, prevOmzet), pengeluaran_change_pct: pctChange_(expTotal, prevExp),
      laba_bersih_prev: prevOmzet - prevExp
    },
    expense_by_category: Object.keys(byCat).map(function (k) {
      return { category: k, amount: byCat[k], pct: expTotal ? Math.round((byCat[k] / expTotal) * 1000) / 10 : 0 };
    }).sort(function (a, b) { return b.amount - a.amount; }),
    by_channel: byChannel_(cur),
    hpp: { available: false, reason: METRIC_DEFINITIONS.hpp },
    definitions: METRIC_DEFINITIONS
  };
}
