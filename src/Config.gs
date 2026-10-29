/**
 * Config.gs — konstanta, enum, dan schema Google Sheets Dash Food.
 *
 * Aturan schema:
 * - Kolom yang tercantum di PRD §6 dipertahankan namanya dan urutannya.
 * - Kolom tambahan diletakkan di akhir (lihat AUDIT_REPORT.md §5).
 * - Kode membaca kolom berdasarkan NAMA header, bukan posisi.
 */

var CONFIG = {
  APP_NAME: 'Dash Food',
  TZ: 'Asia/Makassar',
  CURRENCY: 'IDR',
  SESSION_HOURS: 12,
  SESSION_REMEMBER_DAYS: 30,
  LOGIN_MAX_FAILS: 5,
  LOGIN_LOCK_MINUTES: 10,
  PASSWORD_ITERATIONS: 300,
  LOCK_WAIT_MS: 20000,
  ORDER_PREFIX: 'TRX'
};

var ENUMS = {
  CHANNELS: ['OFFLINE', 'WHATSAPP', 'GOFOOD', 'GRABFOOD', 'SHOPEEFOOD'],
  PAYMENT_METHODS: ['CASH', 'DANA', 'SHOPEEPAY', 'QRIS', 'BANK_TRANSFER'],
  ORDER_STATUSES: ['DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  PAYMENT_STATUSES: ['PAID', 'REFUNDED'],
  ITEM_TYPES: ['PRODUCT', 'VARIANT'],
  MOVEMENT_TYPES: ['PRODUCTION_IN', 'SALE_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'CANCEL_REVERSE'],
  CATEGORY_TYPES: ['PRODUCT', 'EXPENSE'],
  ROLES: ['ADMIN', 'MANAGER', 'STAFF']
};

var LABELS = {
  CHANNELS: { OFFLINE: 'Offline', WHATSAPP: 'WhatsApp', GOFOOD: 'GoFood', GRABFOOD: 'GrabFood', SHOPEEFOOD: 'ShopeeFood' },
  PAYMENT_METHODS: { CASH: 'Cash', DANA: 'DANA', SHOPEEPAY: 'ShopeePay', QRIS: 'QRIS', BANK_TRANSFER: 'Transfer Bank' },
  ORDER_STATUSES: { DRAFT: 'Draft', CONFIRMED: 'Dikonfirmasi', COMPLETED: 'Selesai', CANCELLED: 'Dibatalkan' },
  MOVEMENT_TYPES: {
    PRODUCTION_IN: 'Produksi', SALE_OUT: 'Penjualan', ADJUSTMENT_IN: 'Penyesuaian (+)',
    ADJUSTMENT_OUT: 'Penyesuaian (−)', RETURN_IN: 'Retur', CANCEL_REVERSE: 'Pembatalan'
  },
  ROLES: { ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff' }
};

/** Schema: nama sheet → daftar header. */
var SCHEMA = {
  SETTINGS: ['setting_key', 'setting_value', 'updated_at'],
  CATEGORIES: ['category_id', 'category_name', 'category_type', 'is_active', 'created_at', 'updated_at'],
  PRODUCTS: ['product_id', 'product_name', 'category_id', 'base_unit', 'is_active', 'created_at', 'updated_at',
    'description', 'image_url', 'image_position'],
  VARIANTS: ['variant_id', 'variant_name', 'variant_type', 'unit', 'is_active', 'created_at', 'updated_at',
    'image_url', 'image_position'],
  PRODUCT_VARIANTS: ['id', 'product_id', 'variant_id', 'is_active', 'created_at'],
  PRICES: ['price_id', 'product_id', 'channel', 'base_price', 'effective_from', 'is_active', 'created_at', 'updated_at'],
  VARIANT_PRICES: ['variant_price_id', 'variant_id', 'channel', 'additional_price', 'is_active', 'created_at', 'updated_at'],
  ORDERS: ['order_id', 'order_number', 'external_order_id', 'order_date', 'order_time', 'channel', 'status',
    'subtotal', 'discount', 'total', 'notes', 'created_at', 'updated_at',
    'client_ref', 'cashier_id', 'cashier_name', 'completed_at', 'cancelled_at', 'cancel_reason', 'receipt_logo_url', 'revision'],
  ORDER_ITEMS: ['order_item_id', 'order_id', 'product_id', 'quantity', 'unit_price', 'topping_total', 'line_total',
    'notes', 'created_at', 'product_name'],
  ORDER_ITEM_VARIANTS: ['id', 'order_item_id', 'variant_id', 'quantity', 'additional_price', 'subtotal', 'created_at',
    'variant_name'],
  PAYMENTS: ['payment_id', 'order_id', 'payment_method', 'amount', 'received_amount', 'change_amount', 'paid_at',
    'status', 'created_at'],
  STOCKS: ['stock_id', 'item_type', 'item_id', 'quantity', 'unit', 'minimum_stock', 'updated_at'],
  STOCK_MOVEMENTS: ['movement_id', 'item_type', 'item_id', 'movement_type', 'quantity', 'reference_type',
    'reference_id', 'notes', 'created_at', 'balance_after', 'created_by'],
  PRODUCTION: ['production_id', 'product_id', 'quantity', 'production_date', 'notes', 'created_at',
    'client_ref', 'created_by'],
  EXPENSES: ['expense_id', 'expense_date', 'category', 'description', 'amount', 'payment_method', 'notes',
    'created_at', 'updated_at', 'created_by'],
  ORDER_EVENTS: ['event_id', 'order_id', 'event_type', 'detail', 'created_at', 'created_by'],
  MEDIA: ['media_id', 'file_id', 'url', 'purpose', 'ref_id', 'mime_type', 'size_bytes', 'original_name', 'status',
    'created_at', 'created_by', 'archived_at'],
  USERS: ['user_id', 'username', 'display_name', 'role', 'password_hash', 'password_salt', 'is_active',
    'last_login_at', 'created_at', 'updated_at']
};

/**
 * Kolom yang harus disimpan sebagai teks murni (format '@') agar Sheets
 * tidak mengonversi ID, tanggal, jam, nomor telepon, dll.
 */
var TEXT_COLUMNS = [
  'setting_key', 'setting_value', 'updated_at', 'created_at',
  'category_id', 'product_id', 'variant_id', 'id', 'price_id', 'variant_price_id',
  'order_id', 'order_number', 'external_order_id', 'order_date', 'order_time', 'client_ref',
  'cashier_id', 'completed_at', 'cancelled_at', 'order_item_id', 'payment_id', 'paid_at',
  'stock_id', 'movement_id', 'reference_id', 'production_id', 'production_date',
  'expense_id', 'expense_date', 'user_id', 'username', 'password_hash', 'password_salt',
  'last_login_at', 'effective_from', 'created_by', 'image_url', 'image_position',
  'media_id', 'file_id', 'url', 'ref_id', 'archived_at', 'receipt_logo_url', 'event_id', 'event_type'
];

/** Kolom boolean (disimpan sebagai TRUE/FALSE). */
var BOOL_COLUMNS = ['is_active'];

/** Kolom numerik. */
var NUMBER_COLUMNS = [
  'base_price', 'additional_price', 'subtotal', 'discount', 'total', 'quantity', 'unit_price',
  'topping_total', 'line_total', 'amount', 'received_amount', 'change_amount', 'minimum_stock', 'balance_after', 'size_bytes', 'revision'
];

/** Default SETTINGS yang dibuat saat setup (konfigurasi, bukan data bisnis). */
var DEFAULT_SETTINGS = {
  store_name: 'Dash Food',
  store_tagline: 'Cemilan Enak Setiap Saat',
  store_address: '',
  store_phone: '',
  store_logo_url: '',
  receipt_logo_url: '',
  login_background_url: '',
  receipt_footer: 'Terima kasih sudah berbelanja!\nSemoga harimu menyenangkan',
  receipt_show_logo: 'TRUE',
  allow_discount: 'TRUE',
  data_mode: 'PRODUCTION',
  channels_enabled: 'OFFLINE,WHATSAPP,GOFOOD,GRABFOOD,SHOPEEFOOD',
  payment_methods_enabled: 'CASH,DANA,SHOPEEPAY,QRIS,BANK_TRANSFER',
  upload_max_mb: '5',
  brand_logo_OFFLINE: '', brand_logo_CASH: '', brand_logo_BANK_TRANSFER: '',
  brand_logo_WHATSAPP: '', brand_logo_GOFOOD: '', brand_logo_GRABFOOD: '', brand_logo_SHOPEEFOOD: '',
  brand_logo_DANA: '', brand_logo_SHOPEEPAY: '', brand_logo_QRIS: '',
  last_backup_at: '', last_backup_url: ''
};

/** Kategori bawaan (konfigurasi, boleh diubah dari Pengaturan). */
var DEFAULT_CATEGORIES = [
  { name: 'Cemilan', type: 'PRODUCT' },
  { name: 'Minuman', type: 'PRODUCT' },
  { name: 'Dessert', type: 'PRODUCT' },
  { name: 'Lainnya', type: 'PRODUCT' },
  { name: 'Bahan', type: 'EXPENSE' },
  { name: 'Topping', type: 'EXPENSE' },
  { name: 'Packaging', type: 'EXPENSE' },
  { name: 'Operasional', type: 'EXPENSE' },
  { name: 'Gas', type: 'EXPENSE' },
  { name: 'Lainnya', type: 'EXPENSE' }
];

/** Role minimum per action API. 'PUBLIC' = tanpa login. */
var ACTION_ROLES = {
  login: 'PUBLIC',
  ping: 'PUBLIC',
  publicInfo: 'PUBLIC',
  session: 'STAFF',
  logout: 'STAFF',
  changePassword: 'STAFF',
  catalog: 'STAFF',
  stock: 'STAFF',
  stockMovements: 'STAFF',
  createOrder: 'STAFF',
  recordPayment: 'STAFF',
  cancelOrder: 'STAFF',          // draft: STAFF; completed: dicek ulang ADMIN/MANAGER di service
  orders: 'STAFF',
  orderDetail: 'STAFF',
  receiptPdf: 'STAFF',
  dashboard: 'STAFF',
  products: 'MANAGER',
  saveProduct: 'MANAGER',
  setProductActive: 'MANAGER',
  variants: 'MANAGER',
  saveVariant: 'MANAGER',
  setVariantActive: 'MANAGER',
  prices: 'MANAGER',
  savePrices: 'MANAGER',
  saveVariantPrices: 'MANAGER',
  categories: 'STAFF',
  saveCategory: 'MANAGER',
  setCategoryActive: 'MANAGER',
  adjustStock: 'MANAGER',
  updateStockSettings: 'MANAGER',
  recordProduction: 'MANAGER',
  productions: 'MANAGER',
  expenses: 'MANAGER',
  saveExpense: 'MANAGER',
  reportSales: 'MANAGER',
  reportProducts: 'MANAGER',
  reportFinance: 'MANAGER',
  settings: 'STAFF',
  saveSettings: 'ADMIN',
  users: 'ADMIN',
  saveUser: 'ADMIN',
  resetPassword: 'ADMIN',
  setUserActive: 'ADMIN',
  backup: 'ADMIN',
  uploadImage: 'MANAGER',      // dicek ulang per tujuan di Media.gs
  setDataMode: 'ADMIN',
  bootstrap: 'PUBLIC',          // sesi divalidasi di dalam; tanpa token hanya info publik
  updateOrder: 'STAFF',
  receiptLogo: 'STAFF'
};

var ROLE_RANK = { STAFF: 1, MANAGER: 2, ADMIN: 3 };
