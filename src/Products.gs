/**
 * Products.gs — kategori, produk, topping/varian, relasi produk↔topping, harga per channel, katalog kasir.
 */

/* ---------- Harga ---------- */

/** Peta harga aktif produk: { product_id: { CHANNEL: base_price } } */
function activeProductPrices_() {
  var today = todayStr();
  var best = {};
  Db.all('PRICES').forEach(function (p) {
    if (!p.is_active) return;
    if (p.effective_from && p.effective_from > today) return;
    var key = p.product_id + '|' + p.channel;
    var cur = best[key];
    if (!cur || String(p.effective_from) > String(cur.effective_from) ||
      (p.effective_from === cur.effective_from && String(p.created_at) > String(cur.created_at))) {
      best[key] = p;
    }
  });
  var out = {};
  Object.keys(best).forEach(function (k) {
    var p = best[k];
    (out[p.product_id] = out[p.product_id] || {})[p.channel] = p.base_price;
  });
  return out;
}

/** Peta harga tambahan topping aktif: { variant_id: { CHANNEL: additional_price } } */
function activeVariantPrices_() {
  var best = {};
  Db.all('VARIANT_PRICES').forEach(function (p) {
    if (!p.is_active) return;
    var key = p.variant_id + '|' + p.channel;
    if (!best[key] || String(p.created_at) > String(best[key].created_at)) best[key] = p;
  });
  var out = {};
  Object.keys(best).forEach(function (k) {
    var p = best[k];
    (out[p.variant_id] = out[p.variant_id] || {})[p.channel] = p.additional_price;
  });
  return out;
}

function priceMapFor_(map, id) {
  var src = map[id] || {};
  var o = {};
  ENUMS.CHANNELS.forEach(function (ch) { o[ch] = src[ch] === undefined ? null : src[ch]; });
  return o;
}

/** Relasi aktif: { product_id: [variant_id,...] } */
function productVariantLinks_() {
  var out = {};
  Db.all('PRODUCT_VARIANTS').forEach(function (l) {
    if (!l.is_active) return;
    (out[l.product_id] = out[l.product_id] || []).push(l.variant_id);
  });
  return out;
}

function stockIndex_() {
  var out = {};
  Db.all('STOCKS').forEach(function (s) { out[s.item_type + '|' + s.item_id] = s; });
  return out;
}

function stockView_(s) {
  if (!s) return { quantity: 0, minimum_stock: 0, unit: '', tracked: false, status: 'UNSET' };
  var status = s.quantity <= 0 ? 'OUT' : (s.quantity <= s.minimum_stock ? 'LOW' : 'OK');
  return { quantity: s.quantity, minimum_stock: s.minimum_stock, unit: s.unit, tracked: true, status: status,
    updated_at: s.updated_at };
}

/* ---------- Katalog kasir ---------- */

function catalog() {
  return cachedCatalog_(buildCatalog_);
}

function buildCatalog_() {
  var s = getSettingsMap_();
  var cats = Db.filter('CATEGORIES', function (c) { return c.category_type === 'PRODUCT' && c.is_active; });
  var catMap = indexBy(Db.all('CATEGORIES'), 'category_id');
  var pPrices = activeProductPrices_();
  var vPrices = activeVariantPrices_();
  var links = productVariantLinks_();
  var stocks = stockIndex_();
  var variantRows = Db.filter('VARIANTS', function (v) { return v.is_active; });
  var variants = {};
  variantRows.forEach(function (v) {
    variants[v.variant_id] = {
      variant_id: v.variant_id, variant_name: v.variant_name, variant_type: v.variant_type, unit: v.unit,
      image_url: v.image_url, image_position: v.image_position || 'center', prices: priceMapFor_(vPrices, v.variant_id),
      stock: stockView_(stocks['VARIANT|' + v.variant_id])
    };
  });
  var products = Db.filter('PRODUCTS', function (p) { return p.is_active; }).map(function (p) {
    var cat = catMap[p.category_id];
    return {
      product_id: p.product_id, product_name: p.product_name, category_id: p.category_id,
      category_name: cat ? cat.category_name : '', base_unit: p.base_unit, description: p.description,
      image_url: p.image_url, image_position: p.image_position || 'center', prices: priceMapFor_(pPrices, p.product_id),
      variant_ids: (links[p.product_id] || []).filter(function (id) { return !!variants[id]; }),
      stock: stockView_(stocks['PRODUCT|' + p.product_id])
    };
  });
  return {
    channels: enabledList_(s.channels_enabled, ENUMS.CHANNELS),
    categories: cats.map(function (c) { return { category_id: c.category_id, category_name: c.category_name }; }),
    products: products,
    variants: variants,
    allow_discount: toBool(s.allow_discount),
    generated_at: nowIso()
  };
}

/* ---------- Kategori ---------- */

function categories(payload) {
  var type = payload && payload.type;
  return Db.all('CATEGORIES').filter(function (c) { return !type || c.category_type === type; }).map(clean);
}

function saveCategory(payload) {
  return withLock(function () {
    var name = requireString(payload.category_name, 'Nama kategori', 40);
    var type = requireEnum(payload.category_type, ENUMS.CATEGORY_TYPES, 'Tipe kategori');
    var dup = Db.filter('CATEGORIES', function (c) {
      return c.category_type === type && c.category_name.toLowerCase() === name.toLowerCase() &&
        c.category_id !== payload.category_id;
    });
    if (dup.length) fail('DUPLICATE', 'Kategori "' + name + '" sudah ada.');
    var now = nowIso();
    if (payload.category_id) {
      var cur = Db.find('CATEGORIES', 'category_id', payload.category_id);
      if (!cur) fail('NOT_FOUND', 'Kategori tidak ditemukan.');
      if (cur.category_type !== type) fail('VALIDATION', 'Tipe kategori tidak dapat diubah.');
      return clean(Db.update('CATEGORIES', cur, { category_name: name, updated_at: now }));
    }
    var row = { category_id: newId('CAT'), category_name: name, category_type: type, is_active: true,
      created_at: now, updated_at: now };
    Db.insert('CATEGORIES', row);
    return row;
  });
}

function setCategoryActive(payload) {
  return withLock(function () {
    var cur = Db.find('CATEGORIES', 'category_id', payload.category_id);
    if (!cur) fail('NOT_FOUND', 'Kategori tidak ditemukan.');
    var active = toBool(payload.is_active);
    if (!active && cur.category_type === 'PRODUCT') {
      var used = Db.filter('PRODUCTS', function (p) { return p.category_id === cur.category_id && p.is_active; });
      if (used.length) fail('IN_USE', 'Kategori masih dipakai ' + used.length + ' produk aktif. Pindahkan produknya dulu.');
    }
    return clean(Db.update('CATEGORIES', cur, { is_active: active, updated_at: nowIso() }));
  });
}

/* ---------- Produk ---------- */

function products() {
  var catMap = indexBy(Db.all('CATEGORIES'), 'category_id');
  var pPrices = activeProductPrices_();
  var links = productVariantLinks_();
  var stocks = stockIndex_();
  var usedIds = {};
  Db.all('ORDER_ITEMS').forEach(function (i) { usedIds[i.product_id] = true; });
  return Db.all('PRODUCTS').map(function (p) {
    var cat = catMap[p.category_id];
    var o = clean(p);
    o.category_name = cat ? cat.category_name : '';
    o.prices = priceMapFor_(pPrices, p.product_id);
    o.variant_ids = links[p.product_id] || [];
    o.stock = stockView_(stocks['PRODUCT|' + p.product_id]);
    o.used_in_orders = !!usedIds[p.product_id];
    return o;
  });
}

function validateImageUrl_(v) {
  return normalizeImageUrl_(v);
}

var IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right'];
function validateImagePosition_(v) {
  var s = optString(v || 'center', 20);
  return IMAGE_POSITIONS.indexOf(s) === -1 ? 'center' : s;
}

function saveProduct(payload) {
  return withLock(function () {
    var name = requireString(payload.product_name, 'Nama produk', 60);
    var cat = Db.find('CATEGORIES', 'category_id', payload.category_id);
    if (!cat || cat.category_type !== 'PRODUCT' || !cat.is_active) fail('VALIDATION', 'Kategori produk tidak valid.');
    var unit = requireString(payload.base_unit, 'Satuan', 20);
    var dup = Db.filter('PRODUCTS', function (p) {
      return p.product_name.toLowerCase() === name.toLowerCase() && p.product_id !== payload.product_id;
    });
    if (dup.length) fail('DUPLICATE', 'Produk "' + name + '" sudah ada.');
    var variantIds = (payload.variant_ids || []).map(String);
    var validVariants = indexBy(Db.all('VARIANTS'), 'variant_id');
    variantIds.forEach(function (id) { if (!validVariants[id]) fail('VALIDATION', 'Topping tidak dikenal: ' + id); });

    var now = nowIso();
    var product;
    if (payload.product_id) {
      var cur = Db.find('PRODUCTS', 'product_id', payload.product_id);
      if (!cur) fail('NOT_FOUND', 'Produk tidak ditemukan.');
      var newImg = validateImageUrl_(payload.image_url);
      archiveMediaUrl_(cur.image_url, newImg);
      product = Db.update('PRODUCTS', cur, {
        product_name: name, category_id: cat.category_id, base_unit: unit,
        description: optString(payload.description, 300), image_url: newImg,
        image_position: validateImagePosition_(payload.image_position), updated_at: now
      });
      var st = Db.find('STOCKS', 'item_id', product.product_id);
      if (st && st.item_type === 'PRODUCT' && st.unit !== unit) Db.update('STOCKS', st, { unit: unit, updated_at: now });
    } else {
      product = {
        product_id: newId('PRD'), product_name: name, category_id: cat.category_id, base_unit: unit,
        is_active: true, created_at: now, updated_at: now,
        description: optString(payload.description, 300), image_url: validateImageUrl_(payload.image_url),
        image_position: validateImagePosition_(payload.image_position)
      };
      Db.insert('PRODUCTS', product);
      Db.insert('STOCKS', {
        stock_id: newId('STK'), item_type: 'PRODUCT', item_id: product.product_id, quantity: 0, unit: unit,
        minimum_stock: requireNonNegInt(payload.minimum_stock || 0, 'Stok minimum'), updated_at: now
      });
    }
    syncProductVariants_(product.product_id, variantIds, now);
    return clean(product);
  });
}

function syncProductVariants_(productId, variantIds, now) {
  var existing = Db.filter('PRODUCT_VARIANTS', function (l) { return l.product_id === productId; });
  var byVariant = indexBy(existing, 'variant_id');
  var updates = [];
  existing.forEach(function (l) {
    var want = variantIds.indexOf(l.variant_id) !== -1;
    if (want !== l.is_active) updates.push({ current: l, patch: { is_active: want } });
  });
  Db.updateMany('PRODUCT_VARIANTS', updates);
  var inserts = variantIds.filter(function (id) { return !byVariant[id]; }).map(function (id) {
    return { id: newId('PVL'), product_id: productId, variant_id: id, is_active: true, created_at: now };
  });
  Db.insertMany('PRODUCT_VARIANTS', inserts);
}

function setProductActive(payload) {
  return withLock(function () {
    var cur = Db.find('PRODUCTS', 'product_id', payload.product_id);
    if (!cur) fail('NOT_FOUND', 'Produk tidak ditemukan.');
    return clean(Db.update('PRODUCTS', cur, { is_active: toBool(payload.is_active), updated_at: nowIso() }));
  });
}

/* ---------- Topping / Varian ---------- */

function variants() {
  var vPrices = activeVariantPrices_();
  var stocks = stockIndex_();
  var links = Db.filter('PRODUCT_VARIANTS', function (l) { return l.is_active; });
  var prodMap = indexBy(Db.all('PRODUCTS'), 'product_id');
  return Db.all('VARIANTS').map(function (v) {
    var o = clean(v);
    o.prices = priceMapFor_(vPrices, v.variant_id);
    o.stock = stockView_(stocks['VARIANT|' + v.variant_id]);
    o.used_by = links.filter(function (l) { return l.variant_id === v.variant_id; })
      .map(function (l) { return prodMap[l.product_id] ? prodMap[l.product_id].product_name : ''; })
      .filter(String);
    return o;
  });
}

function saveVariant(payload, user) {
  return withLock(function () {
    var name = requireString(payload.variant_name, 'Nama topping', 40);
    var unit = requireString(payload.unit || 'porsi', 'Satuan', 20);
    var type = optString(payload.variant_type || 'TOPPING', 20).toUpperCase();
    var dup = Db.filter('VARIANTS', function (v) {
      return v.variant_name.toLowerCase() === name.toLowerCase() && v.variant_id !== payload.variant_id;
    });
    if (dup.length) fail('DUPLICATE', 'Topping "' + name + '" sudah ada.');
    var now = nowIso();
    var v;
    if (payload.variant_id) {
      var cur = Db.find('VARIANTS', 'variant_id', payload.variant_id);
      if (!cur) fail('NOT_FOUND', 'Topping tidak ditemukan.');
      var newVImg = validateImageUrl_(payload.image_url);
      archiveMediaUrl_(cur.image_url, newVImg);
      v = Db.update('VARIANTS', cur, { variant_name: name, variant_type: type, unit: unit,
        image_url: newVImg, image_position: validateImagePosition_(payload.image_position), updated_at: now });
    } else {
      v = { variant_id: newId('VAR'), variant_name: name, variant_type: type, unit: unit, is_active: true,
        created_at: now, updated_at: now, image_url: validateImageUrl_(payload.image_url),
        image_position: validateImagePosition_(payload.image_position) };
      Db.insert('VARIANTS', v);
      Db.insert('STOCKS', { stock_id: newId('STK'), item_type: 'VARIANT', item_id: v.variant_id, quantity: 0,
        unit: unit, minimum_stock: requireNonNegInt(payload.minimum_stock || 0, 'Stok minimum'), updated_at: now });
    }
    if (payload.prices) writeVariantPrices_(v.variant_id, payload.prices, now);
    return clean(v);
  });
}

function setVariantActive(payload) {
  return withLock(function () {
    var cur = Db.find('VARIANTS', 'variant_id', payload.variant_id);
    if (!cur) fail('NOT_FOUND', 'Topping tidak ditemukan.');
    return clean(Db.update('VARIANTS', cur, { is_active: toBool(payload.is_active), updated_at: nowIso() }));
  });
}

/* ---------- Harga per channel ---------- */

function validatePriceInput_(prices) {
  var out = {};
  Object.keys(prices || {}).forEach(function (ch) {
    requireEnum(ch, ENUMS.CHANNELS, 'Channel');
    var raw = prices[ch];
    if (raw === '' || raw === null || raw === undefined) return; // kosong = tidak diubah
    var n = Number(raw);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n) {
      fail('VALIDATION', 'Harga ' + LABELS.CHANNELS[ch] + ' harus bilangan bulat ≥ 0.');
    }
    out[ch] = n;
  });
  return out;
}

function prices(payload) {
  var p = Db.find('PRODUCTS', 'product_id', payload.product_id);
  if (!p) fail('NOT_FOUND', 'Produk tidak ditemukan.');
  var rows = Db.filter('PRICES', function (r) { return r.product_id === p.product_id && r.is_active; });
  var active = priceMapFor_(activeProductPrices_(), p.product_id);
  var meta = {};
  rows.forEach(function (r) { meta[r.channel] = { effective_from: r.effective_from, updated_at: r.updated_at }; });
  return { product: clean(p), prices: active, meta: meta };
}

/**
 * Menyimpan harga baru: baris lama dinonaktifkan (histori tetap ada),
 * baris baru berlaku mulai hari ini. Order lama tidak terpengaruh karena
 * ORDER_ITEMS menyimpan snapshot unit_price.
 */
function savePrices(payload) {
  return withLock(function () {
    var p = Db.find('PRODUCTS', 'product_id', payload.product_id);
    if (!p) fail('NOT_FOUND', 'Produk tidak ditemukan.');
    var input = validatePriceInput_(payload.prices);
    var now = nowIso(), today = todayStr();
    var current = Db.filter('PRICES', function (r) { return r.product_id === p.product_id && r.is_active; });
    var deact = [], inserts = [], changed = 0;
    Object.keys(input).forEach(function (ch) {
      var olds = current.filter(function (r) { return r.channel === ch; });
      var same = olds.length === 1 && olds[0].base_price === input[ch] && olds[0].effective_from <= today;
      if (same) return;
      olds.forEach(function (o) { deact.push({ current: o, patch: { is_active: false, updated_at: now } }); });
      inserts.push({ price_id: newId('PRC'), product_id: p.product_id, channel: ch, base_price: input[ch],
        effective_from: today, is_active: true, created_at: now, updated_at: now });
      changed++;
    });
    Db.updateMany('PRICES', deact);
    Db.insertMany('PRICES', inserts);
    return { product_id: p.product_id, changed: changed, effective_from: today };
  });
}

function writeVariantPrices_(variantId, pricesIn, now) {
  var input = validatePriceInput_(pricesIn);
  var current = Db.filter('VARIANT_PRICES', function (r) { return r.variant_id === variantId && r.is_active; });
  var deact = [], inserts = [], changed = 0;
  Object.keys(input).forEach(function (ch) {
    var olds = current.filter(function (r) { return r.channel === ch; });
    if (olds.length === 1 && olds[0].additional_price === input[ch]) return;
    olds.forEach(function (o) { deact.push({ current: o, patch: { is_active: false, updated_at: now } }); });
    inserts.push({ variant_price_id: newId('VPR'), variant_id: variantId, channel: ch, additional_price: input[ch],
      is_active: true, created_at: now, updated_at: now });
    changed++;
  });
  Db.updateMany('VARIANT_PRICES', deact);
  Db.insertMany('VARIANT_PRICES', inserts);
  return changed;
}

function saveVariantPrices(payload) {
  return withLock(function () {
    var v = Db.find('VARIANTS', 'variant_id', payload.variant_id);
    if (!v) fail('NOT_FOUND', 'Topping tidak ditemukan.');
    return { variant_id: v.variant_id, changed: writeVariantPrices_(v.variant_id, payload.prices, nowIso()) };
  });
}
