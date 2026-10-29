/**
 * Payments.gs — pembayaran order.
 *
 * Seluruh langkah berjalan di bawah satu script lock:
 *   1. Validasi order (ada, belum dibayar, belum batal).
 *   2. Validasi metode & nominal (cash: diterima ≥ total).
 *   3. Validasi SELURUH stok cukup → bila ada yang kurang, berhenti tanpa menulis apa pun.
 *   4. Tulis PAYMENTS (status PAID).
 *   5. Tulis STOCK_MOVEMENTS (SALE_OUT) + update STOCKS (sekali per item).
 *   6. Update ORDERS → COMPLETED (ditulis terakhir).
 * Pemanggilan kedua untuk order yang sama ditolak di langkah 1 → tidak ada pembayaran/potong stok ganda.
 */

function recordPayment(payload, user) {
  return withLock(function () {
    var o = Db.find('ORDERS', 'order_id', payload.order_id);
    if (!o) fail('NOT_FOUND', 'Transaksi tidak ditemukan.');
    if (o.status === 'COMPLETED') fail('ALREADY_PAID', 'Transaksi ' + o.order_number + ' sudah dibayar.');
    if (o.status === 'CANCELLED') fail('ORDER_CANCELLED', 'Transaksi ' + o.order_number + ' sudah dibatalkan.');
    var paid = Db.filter('PAYMENTS', function (p) { return p.order_id === o.order_id && p.status === 'PAID'; });
    if (paid.length) fail('ALREADY_PAID', 'Transaksi ' + o.order_number + ' sudah memiliki pembayaran.');

    var s = getSettingsMap_();
    var method = requireEnum(payload.payment_method, ENUMS.PAYMENT_METHODS, 'Metode pembayaran');
    if (enabledList_(s.payment_methods_enabled, ENUMS.PAYMENT_METHODS).indexOf(method) === -1) {
      fail('VALIDATION', 'Metode ' + LABELS.PAYMENT_METHODS[method] + ' sedang dinonaktifkan.');
    }
    var total = o.total;
    var received, change;
    if (method === 'CASH') {
      received = Number(payload.received_amount);
      if (!isFinite(received) || Math.floor(received) !== received) fail('VALIDATION', 'Uang diterima tidak valid.');
      if (received < total) {
        fail('VALIDATION', 'Uang diterima (' + formatRupiah(received) + ') kurang dari total (' + formatRupiah(total) + ').');
      }
      change = received - total;
    } else {
      received = total;
      change = 0;
    }

    var lines = loadOrderLines_([o.order_id])[o.order_id] || [];
    if (!lines.length) fail('VALIDATION', 'Transaksi tidak memiliki item.');
    var demand = stockDemand_(lines);
    var warn = stockWarnings_(lines);
    if (warn.length) {
      fail('INSUFFICIENT_STOCK', 'Stok tidak cukup: ' + warn.map(function (w) {
        return w.name + ' (tersedia ' + w.available + ', butuh ' + w.required + ')';
      }).join(', '), { shortages: warn });
    }

    var now = nowIso();
    var payment = {
      payment_id: newId('PAY'), order_id: o.order_id, payment_method: method, amount: total,
      received_amount: received, change_amount: change, paid_at: now, status: 'PAID', created_at: now
    };
    Db.insert('PAYMENTS', payment);
    applyStockChanges_(demand.map(function (c) {
      c.movement_type = 'SALE_OUT';
      c.reference_type = 'ORDER';
      c.reference_id = o.order_id;
      c.notes = o.order_number;
      return c;
    }), user.display_name);
    // Snapshot logo struk saat transaksi selesai: struk lama tidak ikut berubah bila logo diganti.
    Db.update('ORDERS', o, { status: 'COMPLETED', completed_at: now, updated_at: now,
      receipt_logo_url: s.receipt_logo_url || s.store_logo_url || '' });
    logOrderEvent_(o.order_id, 'PAID', LABELS.PAYMENT_METHODS[method] + ' · ' + formatRupiah(total) +
      (method === 'CASH' ? ' · diterima ' + formatRupiah(received) + ' · kembali ' + formatRupiah(change) : ''), user);
    return orderDetail({ order_id: o.order_id });
  });
}
