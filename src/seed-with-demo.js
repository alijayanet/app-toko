/**
 * Seed Database dengan Data Demo
 * Untuk testing/demo aplikasi dengan data produk & transaksi sample
 * 
 * Cara penggunaan:
 * npm run seed:demo
 */

const db = require('./db');
const crypto = require('crypto');

function hashPassword(password, salt = null) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, actualSalt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

console.log('Memulai seeding database dengan DATA DEMO...');
console.log('');

// Gunakan transaksi untuk memastikan seeding berjalan atomik
const runSeeding = db.transaction(() => {
  // Hapus data lama agar bersih sebelum seed ulang
  console.log('Membersihkan data lama...');
  db.prepare('DELETE FROM t_sessions').run();
  db.prepare('DELETE FROM m_users').run();
  db.prepare('DELETE FROM m_settings').run();
  db.prepare('DELETE FROM t_stock_logs').run();
  db.prepare('DELETE FROM t_customer_debt_payments').run();
  db.prepare('DELETE FROM t_sales_details').run();
  db.prepare('DELETE FROM t_sales').run();
  db.prepare('DELETE FROM t_supplier_debt_payments').run();
  db.prepare('DELETE FROM t_purchase_details').run();
  db.prepare('DELETE FROM t_purchases').run();
  db.prepare('DELETE FROM m_product_units').run();
  db.prepare('DELETE FROM m_products').run();
  db.prepare('DELETE FROM m_customers').run();
  db.prepare('DELETE FROM m_suppliers').run();

  console.log('✅ Data lama berhasil dibersihkan.');

  // ==============================================
  // SEED DEFAULT USERS
  // ==============================================
  console.log('Membuat user default...');
  const insertUser = db.prepare(`
    INSERT INTO m_users (username, password, salt, name, role) VALUES (?, ?, ?, ?, ?)
  `);
  
  const adminHash = hashPassword('admin123');
  insertUser.run('admin', adminHash.hash, adminHash.salt, 'Administrator Toko', 'ADMIN');
  
  const kasirHash = hashPassword('kasir123');
  insertUser.run('kasir1', kasirHash.hash, kasirHash.salt, 'Kasir 1', 'CASHIER');
  
  console.log('✅ User admin dan kasir1 berhasil dibuat.');

  // ==============================================
  // SEED DEFAULT SETTINGS
  // ==============================================
  console.log('Membuat pengaturan toko demo...');
  const insertSetting = db.prepare(`
    INSERT INTO m_settings (key, value) VALUES (?, ?)
  `);
  
  insertSetting.run('store_name', 'Toko Kelontong Maju Jaya');
  insertSetting.run('store_address', 'Jl. Contoh No. 123, Kota Demo');
  insertSetting.run('store_phone', '08123456789');
  insertSetting.run('receipt_footer', 'Terima kasih atas kunjungan Anda\nStruk ini adalah bukti pembayaran sah');
  insertSetting.run('qris_static_payload', '');
  insertSetting.run('github_repo_url', 'alijayanet/app-toko');
  insertSetting.run('quick_products_mode', 'top_selling');
  insertSetting.run('quick_products_pinned_ids', '[]');
  insertSetting.run('wa_gateway_type', 'direct');
  insertSetting.run('wa_gateway_token', '');
  insertSetting.run('wa_gateway_url', '');
  
  console.log('✅ Pengaturan toko berhasil dibuat.');

  // ==============================================
  // SEED DEMO SUPPLIERS & CUSTOMERS
  // ==============================================
  console.log('Membuat data supplier & customer demo...');
  
  const insertSupplier = db.prepare(`
    INSERT INTO m_suppliers (id, name, phone, address) VALUES (?, ?, ?, ?)
  `);
  insertSupplier.run(1, 'PT. Distributor Sembako Jaya', '021-5551234', 'Jakarta');
  insertSupplier.run(2, 'CV. Supplier Minuman Segar', '08123456789', 'Bandung');

  const insertCustomer = db.prepare(`
    INSERT INTO m_customers (id, name, phone, address) VALUES (?, ?, ?, ?)
  `);
  insertCustomer.run(1, 'Warung Bu Ani', '085678901234', 'Jl. Melati No. 10');
  insertCustomer.run(2, 'Toko Grosir Sejahtera', '08991234567', 'Pasar Sentral Blok A');
  
  console.log('✅ Supplier & customer demo berhasil dibuat.');

  // ==============================================
  // SEED DEMO PRODUCTS
  // ==============================================
  console.log('Membuat produk demo...');
  
  const insertProduct = db.prepare(`
    INSERT INTO m_products (id, name, category, cost_price_base, stock, min_stock) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertUnit = db.prepare(`
    INSERT INTO m_product_units (product_id, unit_name, conversion_factor, price_retail, price_wholesale, wholesale_min_qty) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertStockLog = db.prepare(`
    INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
    VALUES (?, ?, ?, ?)
  `);

  // Produk 1: Indomie Goreng
  insertProduct.run('8998866200225', 'Indomie Goreng 85g', 'Makanan & Kuliner', 2800, 450, 40);
  insertUnit.run('8998866200225', 'Pcs', 1, 3500, 3300, 10);
  insertUnit.run('8998866200225', 'Pak', 5, 17000, 16000, 5);
  insertUnit.run('8998866200225', 'Dus', 40, 132000, 128000, 1);
  insertStockLog.run('8998866200225', 450, 'PURCHASE', 'STOK AWAL DEMO');

  // Produk 2: Coca Cola
  insertProduct.run('8999999002251', 'Coca Cola Botol 1.5L', 'Minuman & Kopi', 12000, 60, 12);
  insertUnit.run('8999999002251', 'Botol', 1, 15000, 14200, 6);
  insertUnit.run('8999999002251', 'Dus', 12, 172000, 166000, 1);
  insertStockLog.run('8999999002251', 60, 'PURCHASE', 'STOK AWAL DEMO');

  // Produk 3: Minyak Goreng
  insertProduct.run('8999999003301', 'Minyak Goreng Bimoli 2L', 'Sembako', 34500, 48, 10);
  insertUnit.run('8999999003301', 'Pcs', 1, 39000, 37800, 4);
  insertUnit.run('8999999003301', 'Dus', 6, 228000, 222000, 1);
  insertStockLog.run('8999999003301', 48, 'PURCHASE', 'STOK AWAL DEMO');

  // Produk 4: Beras
  insertProduct.run('8999999004401', 'Beras Premium 5kg', 'Sembako', 69000, 15, 5);
  insertUnit.run('8999999004401', 'Pack', 1, 78000, 75500, 2);
  insertStockLog.run('8999999004401', 15, 'PURCHASE', 'STOK AWAL DEMO');

  console.log('✅ Produk demo berhasil dibuat (4 produk).');

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ SEEDING DEMO BERHASIL!');
  console.log('='.repeat(60));
  console.log('');
  console.log('📦 Database telah diisi dengan data demo:');
  console.log('   - 2 Users (admin, kasir1)');
  console.log('   - 2 Suppliers');
  console.log('   - 2 Customers');
  console.log('   - 4 Produk dengan multi-satuan');
  console.log('');
  console.log('🔑 Kredensial Login Default:');
  console.log('   - Username: admin | Password: admin123');
  console.log('   - Username: kasir1 | Password: kasir123');
  console.log('');
  console.log('⚠️  PENTING: Data ini hanya untuk DEMO/TESTING!');
  console.log('   Untuk production, gunakan: npm run seed (tanpa data demo)');
  console.log('');
  console.log('='.repeat(60));
});

try {
  runSeeding();
} catch (error) {
  console.error('❌ Gagal melakukan seeding database:', error);
  process.exit(1);
}
