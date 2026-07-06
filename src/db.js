const Database = require('better-sqlite3');
const path = require('path');

// Lokasi database SQLite di root folder proyek
const dbPath = path.resolve(__dirname, '../database.db');
const db = new Database(dbPath);

// Aktifkan WAL (Write-Ahead Logging) mode untuk konkurensi performa tinggi
// Serta aktifkan support Foreign Key
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Fungsi inisialisasi tabel basis data
function initDatabase() {
  // 1. Tabel Master Produk
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_products (
      id TEXT PRIMARY KEY, -- SKU / Barcode
      name TEXT NOT NULL,
      cost_price_base REAL NOT NULL DEFAULT 0.0, -- Harga modal per base unit
      stock INTEGER NOT NULL DEFAULT 0, -- Total stok dalam base unit
      min_stock INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  // 2. Tabel Satuan Konversi Produk (One-to-Many dari m_products)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      unit_name TEXT NOT NULL, -- Pcs, Pak, Dus, dll.
      conversion_factor INTEGER NOT NULL DEFAULT 1, -- e.g. Pak = 10 (artinya 10 Pcs)
      price_retail REAL NOT NULL DEFAULT 0.0,
      price_wholesale REAL NOT NULL DEFAULT 0.0,
      wholesale_min_qty INTEGER NOT NULL DEFAULT 0, -- Kuantitas minimum memicu harga grosir
      FOREIGN KEY (product_id) REFERENCES m_products(id) ON DELETE CASCADE
    )
  `).run();

  // Buat index untuk mempercepat pencarian satuan berdasarkan produk
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_product_units_prod ON m_product_units(product_id)`).run();

  // 3. Tabel Master Pelanggan (untuk piutang/bon)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT
    )
  `).run();

  // 4. Tabel Master Supplier (untuk hutang pembelian)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT
    )
  `).run();

  // 5. Tabel Transaksi Penjualan (Sales)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      customer_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0.0,
      total_profit REAL NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT')),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'UNPAID', 'PARTIAL')),
      due_date DATETIME,
      cash_amount REAL NOT NULL DEFAULT 0.0,
      change_amount REAL NOT NULL DEFAULT 0.0,
      debt_balance REAL NOT NULL DEFAULT 0.0, -- Sisa piutang pelanggan
      FOREIGN KEY (customer_id) REFERENCES m_customers(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_invoice ON t_sales(invoice_no)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON t_sales(customer_id)`).run();

  // 6. Tabel Detail Penjualan (Sales Details)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_sales_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      unit_id INTEGER NOT NULL,
      unit_name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      conversion_factor INTEGER NOT NULL DEFAULT 1,
      price_used REAL NOT NULL DEFAULT 0.0,
      subtotal REAL NOT NULL DEFAULT 0.0,
      profit REAL NOT NULL DEFAULT 0.0, -- Keuntungan item ini (subtotal - cost_price_base * qty * conversion_factor)
      FOREIGN KEY (sale_id) REFERENCES t_sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES m_products(id),
      FOREIGN KEY (unit_id) REFERENCES m_product_units(id)
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_det_sale ON t_sales_details(sale_id)`).run();

  // 7. Tabel Log Pembayaran Cicilan Piutang Pelanggan
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_customer_debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      amount REAL NOT NULL DEFAULT 0.0,
      note TEXT,
      FOREIGN KEY (sale_id) REFERENCES t_sales(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_cust_debt_pay_sale ON t_customer_debt_payments(sale_id)`).run();

  // 8. Tabel Transaksi Pembelian Stok dari Supplier (Purchases)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT')),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'UNPAID', 'PARTIAL')),
      due_date DATETIME,
      debt_balance REAL NOT NULL DEFAULT 0.0, -- Sisa hutang toko ke supplier
      FOREIGN KEY (supplier_id) REFERENCES m_suppliers(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON t_purchases(supplier_id)`).run();

  // 9. Tabel Detail Pembelian (Purchase Details)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_purchase_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      conversion_factor INTEGER NOT NULL DEFAULT 1,
      cost_price REAL NOT NULL DEFAULT 0.0, -- Harga beli supplier per satuan ini
      subtotal REAL NOT NULL DEFAULT 0.0,
      FOREIGN KEY (purchase_id) REFERENCES t_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES m_products(id)
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_purchase_det_pur ON t_purchase_details(purchase_id)`).run();

  // 10. Tabel Log Pembayaran Hutang Toko ke Supplier
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_supplier_debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      amount REAL NOT NULL DEFAULT 0.0,
      note TEXT,
      FOREIGN KEY (purchase_id) REFERENCES t_purchases(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_supp_debt_pay_pur ON t_supplier_debt_payments(purchase_id)`).run();

  // 11. Tabel Log Histori Mutasi Stok (Penting untuk audit stok opname/transaksi)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_stock_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      qty_change INTEGER NOT NULL, -- Positif untuk penambahan, Negatif untuk pengurangan
      type TEXT NOT NULL CHECK(type IN ('SALE', 'PURCHASE', 'ADJUSTMENT')),
      reference_id TEXT, -- Invoice No, Purchase ID, atau Catatan Koreksi
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES m_products(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_stock_logs_prod ON t_stock_logs(product_id)`).run();

  // 12. Tabel User / Karyawan (Kasir & Admin)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'CASHIER'))
    )
  `).run();

  // 13. Tabel Sesi Login (Token-based)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS t_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES m_users(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON t_sessions(user_id)`).run();

  // 14. Tabel Pengaturan Toko
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
}

// Jalankan inisialisasi basis data secara otomatis saat file dimuat
initDatabase();

module.exports = db;
