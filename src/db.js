const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Lokasi database SQLite di root folder proyek atau di samping .exe
let dbPath = path.resolve(__dirname, '../database.db');
if (process.versions && process.versions.electron && process.resourcesPath) {
  const exeDir = path.dirname(process.execPath);
  dbPath = path.join(exeDir, 'database.db');
}

let currentDb = new Database(dbPath);

// Aktifkan WAL (Write-Ahead Logging) mode untuk konkurensi performa tinggi
// Serta aktifkan support Foreign Key
currentDb.pragma('journal_mode = WAL');
currentDb.pragma('foreign_keys = ON');

function reopenDatabase() {
  currentDb = new Database(dbPath);
  currentDb.pragma('journal_mode = WAL');
  currentDb.pragma('foreign_keys = ON');
  initDatabase();
}

function restoreDatabaseFromBuffer(buffer) {
  if (!buffer || buffer.length < 100) {
    throw new Error('File database tidak valid atau kosong.');
  }

  // 1. Validasi SQLite Header Signature (16 bytes pertama)
  const headerStr = buffer.slice(0, 16).toString('utf8');
  if (!headerStr.startsWith('SQLite format 3')) {
    throw new Error('File yang diunggah bukan berkas database SQLite valid (.db).');
  }

  const tempPath = path.join(path.dirname(dbPath), 'temp_restore_' + Date.now() + '.db');
  fs.writeFileSync(tempPath, buffer);

  // 2. Buka berkas sementara untuk pengujian integritas
  let testDb;
  try {
    testDb = new Database(tempPath, { readonly: true, fileMustExist: true });
    
    // Periksa integritas fisik SQLite
    const integrityCheck = testDb.pragma('integrity_check');
    if (!integrityCheck || integrityCheck[0]?.integrity_check !== 'ok') {
      throw new Error('Integritas berkas database rusak (corrupted).');
    }

    // Periksa keberadaan tabel wajib
    const requiredTables = ['m_users', 'm_products', 't_sales'];
    for (const tbl of requiredTables) {
      const exists = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
      if (!exists) {
        throw new Error(`File cadangan tidak memiliki tabel sistem penting (${tbl}).`);
      }
    }

    // Periksa apakah ada setidaknya satu akun ADMIN
    const adminCount = testDb.prepare("SELECT COUNT(*) as count FROM m_users WHERE role='ADMIN'").get();
    if (!adminCount || adminCount.count < 1) {
      throw new Error('File cadangan tidak memiliki akun pengguna dengan hak akses Administrator.');
    }
  } finally {
    if (testDb) {
      try { testDb.close(); } catch (_) {}
    }
  }

  // 3. Buat cadangan pengaman (safety backup) dari database aktif saat ini
  const autoBakPath = dbPath + '.bak_auto';
  try {
    currentDb.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbPath, autoBakPath);
  } catch (err) {
    console.warn('[Safety Backup Warning]', err.message);
  }

  // 4. Tutup koneksi database aktif saat ini
  try {
    currentDb.close();
  } catch (err) {
    console.error('[DB Close Error]', err.message);
  }

  // 5. Bersihkan file WAL & SHM lama jika ada
  try {
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  } catch (_) {}

  // 6. Ganti file database aktif dengan berkas yang baru
  try {
    fs.copyFileSync(tempPath, dbPath);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch (err) {
    // Jika gagal menimpa, kembalikan dari safety backup
    if (fs.existsSync(autoBakPath)) {
      fs.copyFileSync(autoBakPath, dbPath);
    }
    // Buka ulang koneksi
    reopenDatabase();
    throw new Error('Gagal mengganti berkas database: ' + err.message);
  }

  // 7. Buka kembali koneksi database
  reopenDatabase();

  return {
    success: true,
    message: 'Database berhasil dipulihkan secara penuh!'
  };
}

const db = new Proxy({}, {
  get(target, prop) {
    if (prop === 'restoreDatabaseFromBuffer') {
      return restoreDatabaseFromBuffer;
    }
    if (prop === 'reopenDatabase') {
      return reopenDatabase;
    }
    if (prop === 'getDbPath') {
      return () => dbPath;
    }
    const val = currentDb[prop];
    if (typeof val === 'function') {
      return val.bind(currentDb);
    }
    return val;
  }
});

// Fungsi inisialisasi tabel basis data
function initDatabase() {
  // 1. Tabel Master Produk
  db.prepare(`
    CREATE TABLE IF NOT EXISTS m_products (
      id TEXT PRIMARY KEY, -- SKU / Barcode
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Umum',
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
      user_id INTEGER,
      cashier_name TEXT,
      discount_amount REAL NOT NULL DEFAULT 0.0,
      total_amount REAL NOT NULL DEFAULT 0.0,
      total_profit REAL NOT NULL DEFAULT 0.0,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT', 'QRIS')),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'UNPAID', 'PARTIAL', 'VOID')),
      due_date DATETIME,
      cash_amount REAL NOT NULL DEFAULT 0.0,
      change_amount REAL NOT NULL DEFAULT 0.0,
      debt_balance REAL NOT NULL DEFAULT 0.0, -- Sisa piutang pelanggan
      FOREIGN KEY (customer_id) REFERENCES m_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES m_users(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_invoice ON t_sales(invoice_no)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON t_sales(customer_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_sales_date ON t_sales(sale_date)`).run();

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
      type TEXT NOT NULL CHECK(type IN ('SALE', 'PURCHASE', 'ADJUSTMENT', 'VOID_RESTORE')),
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

  // Migrasi otomatis kolom baru untuk database yang sudah berjalan
  autoMigrateColumns();
}

// Fungsi bantu migrasi kolom baru jika database lama belum memilikinya
function autoMigrateColumns() {
  const tryAddColumn = (table, columnDef) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`).run();
    } catch (e) {
      // Kolom sudah ada, abaikan error
    }
  };

  tryAddColumn('m_products', 'category TEXT DEFAULT "Umum"');
  tryAddColumn('t_sales', 'user_id INTEGER');
  tryAddColumn('t_sales', 'cashier_name TEXT');
  tryAddColumn('t_sales', 'discount_amount REAL NOT NULL DEFAULT 0.0');

  // Migrasi skema t_sales jika database lama belum memiliki CHECK constraint 'QRIS' atau 'VOID'
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='t_sales'").get()?.sql || '';
    if (tableSql && (!tableSql.includes("'VOID'") || !tableSql.includes("'QRIS'"))) {
      db.pragma('foreign_keys = OFF');
      db.prepare(`
        CREATE TABLE t_sales_migration (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_no TEXT UNIQUE NOT NULL,
          sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          customer_id INTEGER,
          user_id INTEGER,
          cashier_name TEXT,
          discount_amount REAL NOT NULL DEFAULT 0.0,
          total_amount REAL NOT NULL DEFAULT 0.0,
          total_profit REAL NOT NULL DEFAULT 0.0,
          payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH', 'CREDIT', 'QRIS')),
          payment_status TEXT NOT NULL CHECK(payment_status IN ('PAID', 'UNPAID', 'PARTIAL', 'VOID')),
          due_date DATETIME,
          cash_amount REAL NOT NULL DEFAULT 0.0,
          change_amount REAL NOT NULL DEFAULT 0.0,
          debt_balance REAL NOT NULL DEFAULT 0.0,
          FOREIGN KEY (customer_id) REFERENCES m_customers(id)
        )
      `).run();
      
      db.prepare(`
        INSERT INTO t_sales_migration (id, invoice_no, sale_date, customer_id, user_id, cashier_name, discount_amount, total_amount, total_profit, payment_type, payment_status, due_date, cash_amount, change_amount, debt_balance)
        SELECT id, invoice_no, sale_date, customer_id, user_id, cashier_name, COALESCE(discount_amount, 0), total_amount, total_profit, payment_type, payment_status, due_date, cash_amount, change_amount, debt_balance FROM t_sales
      `).run();

      db.prepare(`DROP TABLE t_sales`).run();
      db.prepare(`ALTER TABLE t_sales_migration RENAME TO t_sales`).run();
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    console.error("Migration error for t_sales QRIS constraint:", e);
    try { db.pragma('foreign_keys = ON'); } catch (_) {}
  }

  // Seed default pengaturan QRIS Statis Toko jika belum ada
  try {
    const existingQris = db.prepare("SELECT value FROM m_settings WHERE key = 'qris_static_payload'").get();
    if (!existingQris) {
      db.prepare("INSERT OR REPLACE INTO m_settings (key, value) VALUES ('qris_static_payload', ?)").run(
        '00020101021126570011ID.DANA.WWW011893600915346519740402094651974040303UMI51440014ID.CO.QRIS.WWW0215ID10232708012520303UMI5204549953033605802ID5907ALIJAYA6014Kab. Indramayu6105452576304E962'
      );
    }
  } catch (e) {
    console.error("Default QRIS payload seed error:", e);
  }
}

// Jalankan inisialisasi basis data secara otomatis saat file dimuat
initDatabase();

module.exports = db;

