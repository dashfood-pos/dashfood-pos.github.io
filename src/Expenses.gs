/**
 * Expenses.gs — pengeluaran usaha. Tidak pernah dihitung sebagai penjualan.
 * EXPENSES.category menyimpan NAMA kategori (sesuai schema PRD) sebagai snapshot.
 */

function expenses(payload) {
  payload = payload || {};
  var range = resolvePeriod(payload);
  var rows = Db.filter('EXPENSES', function (e) {
    if (e.expense_date < range.from || e.expense_date > range.to) return false;
    if (payload.category && e.category !== payload.category) return false;
    return true;
  }).map(function (e) {
    var o = clean(e);
    o.payment_method_label = LABELS.PAYMENT_METHODS[e.payment_method] || e.payment_method;
    return o;
  });
  rows.sort(function (a, b) {
    return b.expense_date.localeCompare(a.expense_date) || String(b.created_at).localeCompare(String(a.created_at));
  });
  var total = rows.reduce(function (s, e) { return s + e.amount; }, 0);
  return { range: range, items: rows, total: total };
}

function saveExpense(payload, user) {
  return withLock(function () {
    var date = payload.expense_date;
    if (!isValidDateStr(date)) fail('VALIDATION', 'Tanggal pengeluaran tidak valid.');
    if (date > todayStr()) fail('VALIDATION', 'Tanggal pengeluaran tidak boleh di masa depan.');
    var catName = requireString(payload.category, 'Kategori', 40);
    var cat = Db.filter('CATEGORIES', function (c) {
      return c.category_type === 'EXPENSE' && c.category_name === catName;
    })[0];
    if (!cat) fail('VALIDATION', 'Kategori pengeluaran tidak dikenal.');
    var description = requireString(payload.description, 'Keterangan', 120);
    var amount = Number(payload.amount);
    if (!isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) fail('VALIDATION', 'Nominal harus bilangan bulat > 0.');
    var method = requireEnum(payload.payment_method, ENUMS.PAYMENT_METHODS, 'Metode pembayaran');
    var now = nowIso();
    if (payload.expense_id) {
      var cur = Db.find('EXPENSES', 'expense_id', payload.expense_id);
      if (!cur) fail('NOT_FOUND', 'Pengeluaran tidak ditemukan.');
      if (!cat.is_active && cur.category !== catName) fail('VALIDATION', 'Kategori sudah tidak aktif.');
      return clean(Db.update('EXPENSES', cur, {
        expense_date: date, category: catName, description: description, amount: amount, payment_method: method,
        notes: optString(payload.notes, 300), updated_at: now
      }));
    }
    if (!cat.is_active) fail('VALIDATION', 'Kategori sudah tidak aktif.');
    var row = {
      expense_id: newId('EXP'), expense_date: date, category: catName, description: description, amount: amount,
      payment_method: method, notes: optString(payload.notes, 300), created_at: now, updated_at: now,
      created_by: user.display_name
    };
    Db.insert('EXPENSES', row);
    return row;
  });
}
