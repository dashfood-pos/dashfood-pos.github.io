/**
 * Auth.gs — login, sesi, dan manajemen pengguna.
 *
 * - Password: SHA-256 bersalt dengan iterasi (CONFIG.PASSWORD_ITERATIONS).
 * - Sesi: token acak; yang disimpan di Script Properties hanya hash token-nya.
 * - Percobaan login gagal dibatasi lewat CacheService.
 */

function publicUser_(u) {
  return { user_id: u.user_id, username: u.username, display_name: u.display_name, role: u.role };
}

function normalizeUsername_(s) {
  return String(s || '').trim().toLowerCase();
}

function createUser_(input) {
  var username = normalizeUsername_(requireString(input.username, 'Username', 60));
  if (!/^[a-z0-9._@-]{3,60}$/.test(username)) {
    fail('VALIDATION', 'Username hanya boleh huruf kecil, angka, titik, minus, underscore, atau @ (min. 3 karakter).');
  }
  var displayName = requireString(input.display_name, 'Nama', 60);
  var role = requireEnum(input.role, ENUMS.ROLES, 'Role');
  var password = String(input.password || '');
  if (password.length < 8) fail('VALIDATION', 'Password minimal 8 karakter.');
  if (Db.find('USERS', 'username', username)) fail('DUPLICATE', 'Username sudah dipakai.');
  var salt = randomToken().substring(0, 24);
  var now = nowIso();
  var user = {
    user_id: newId('USR'), username: username, display_name: displayName, role: role,
    password_hash: hashPassword(password, salt), password_salt: salt, is_active: true,
    last_login_at: '', created_at: now, updated_at: now
  };
  Db.insert('USERS', user);
  return user;
}

function sessionKey_(token) {
  return 'sess_' + sha256Hex(String(token)).substring(0, 40);
}

function login(payload) {
  var username = normalizeUsername_(payload && payload.username);
  var password = String((payload && payload.password) || '');
  if (!username || !password) fail('VALIDATION', 'Username dan password wajib diisi.');

  var cache = CacheService.getScriptCache();
  var failKey = 'loginfail_' + sha256Hex(username).substring(0, 20);
  var fails = toNumber(cache.get(failKey), 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILS) {
    fail('LOCKED', 'Terlalu banyak percobaan gagal. Coba lagi dalam ' + CONFIG.LOGIN_LOCK_MINUTES + ' menit.');
  }

  var user = Db.find('USERS', 'username', username);
  var ok = user && user.is_active && safeEqual(hashPassword(password, user.password_salt), user.password_hash);
  if (!ok) {
    cache.put(failKey, String(fails + 1), CONFIG.LOGIN_LOCK_MINUTES * 60);
    fail('AUTH_FAILED', 'Username atau password salah.');
  }
  cache.remove(failKey);

  var token = randomToken();
  var hours = payload.remember ? CONFIG.SESSION_REMEMBER_DAYS * 24 : CONFIG.SESSION_HOURS;
  var exp = Date.now() + hours * 3600 * 1000;
  var props = PropertiesService.getScriptProperties();
  cleanupSessions_(props);
  props.setProperty(sessionKey_(token), JSON.stringify({ user_id: user.user_id, exp: exp }));
  Db.update('USERS', user, { last_login_at: nowIso() });
  return { token: token, expires_at: exp, user: publicUser_(user) };
}

function cleanupSessions_(props) {
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess_') !== 0) return;
    try {
      var s = JSON.parse(all[k]);
      if (!s || s.exp < now) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

/** Mengembalikan user aktif untuk token, atau melempar AUTH_REQUIRED. */
function authenticate_(token) {
  if (!token) fail('AUTH_REQUIRED', 'Sesi berakhir. Silakan masuk kembali.');
  var raw = PropertiesService.getScriptProperties().getProperty(sessionKey_(token));
  if (!raw) fail('AUTH_REQUIRED', 'Sesi berakhir. Silakan masuk kembali.');
  var s;
  try { s = JSON.parse(raw); } catch (e) { s = null; }
  if (!s || s.exp < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(sessionKey_(token));
    fail('AUTH_REQUIRED', 'Sesi berakhir. Silakan masuk kembali.');
  }
  var user = Db.find('USERS', 'user_id', s.user_id);
  if (!user || !user.is_active) fail('AUTH_REQUIRED', 'Akun tidak aktif. Hubungi admin.');
  return user;
}

function logout(payload, user, token) {
  PropertiesService.getScriptProperties().deleteProperty(sessionKey_(token));
  return { logged_out: true };
}

function hasRole_(user, minRole) {
  return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}

function requireRole_(user, minRole) {
  if (!hasRole_(user, minRole)) fail('FORBIDDEN', 'Akses ditolak. Fitur ini membutuhkan role ' + LABELS.ROLES[minRole] + '.');
}

function changePassword(payload, user) {
  var fresh = Db.find('USERS', 'user_id', user.user_id);
  if (!safeEqual(hashPassword(String(payload.old_password || ''), fresh.password_salt), fresh.password_hash)) {
    fail('AUTH_FAILED', 'Password lama salah.');
  }
  var pw = String(payload.new_password || '');
  if (pw.length < 8) fail('VALIDATION', 'Password baru minimal 8 karakter.');
  var salt = randomToken().substring(0, 24);
  Db.update('USERS', fresh, { password_hash: hashPassword(pw, salt), password_salt: salt, updated_at: nowIso() });
  return { changed: true };
}

/* ---------- Manajemen pengguna (ADMIN) ---------- */

function users() {
  return Db.all('USERS').map(function (u) {
    return { user_id: u.user_id, username: u.username, display_name: u.display_name, role: u.role,
      is_active: u.is_active, last_login_at: u.last_login_at, created_at: u.created_at };
  });
}

function saveUser(payload, actor) {
  return withLock(function () {
    if (!payload.user_id) {
      var u = createUser_(payload);
      return publicUser_(u);
    }
    var cur = Db.find('USERS', 'user_id', payload.user_id);
    if (!cur) fail('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var role = requireEnum(payload.role, ENUMS.ROLES, 'Role');
    if (cur.user_id === actor.user_id && role !== 'ADMIN') fail('VALIDATION', 'Anda tidak dapat menurunkan role akun sendiri.');
    var updated = Db.update('USERS', cur, {
      display_name: requireString(payload.display_name, 'Nama', 60), role: role, updated_at: nowIso()
    });
    return publicUser_(updated);
  });
}

function resetPassword(payload) {
  return withLock(function () {
    var cur = Db.find('USERS', 'user_id', payload.user_id);
    if (!cur) fail('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var pw = String(payload.new_password || '');
    if (pw.length < 8) fail('VALIDATION', 'Password minimal 8 karakter.');
    var salt = randomToken().substring(0, 24);
    Db.update('USERS', cur, { password_hash: hashPassword(pw, salt), password_salt: salt, updated_at: nowIso() });
    return { reset: true };
  });
}

function setUserActive(payload, actor) {
  return withLock(function () {
    var cur = Db.find('USERS', 'user_id', payload.user_id);
    if (!cur) fail('NOT_FOUND', 'Pengguna tidak ditemukan.');
    var active = toBool(payload.is_active);
    if (!active && cur.user_id === actor.user_id) fail('VALIDATION', 'Anda tidak dapat menonaktifkan akun sendiri.');
    if (!active && cur.role === 'ADMIN') {
      var otherAdmins = Db.filter('USERS', function (u) {
        return u.role === 'ADMIN' && u.is_active && u.user_id !== cur.user_id;
      });
      if (!otherAdmins.length) fail('VALIDATION', 'Minimal harus ada satu admin aktif.');
    }
    Db.update('USERS', cur, { is_active: active, updated_at: nowIso() });
    return { user_id: cur.user_id, is_active: active };
  });
}
