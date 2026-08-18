const db = require('./db');
const crypto = require('crypto');

function hashPassword(password, salt = null) {
  // Gunakan salt unik per user atau generate baru
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000; // Standar OWASP untuk PBKDF2
  const hash = crypto.pbkdf2Sync(password, actualSalt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

console.log('Memulai seeding database...');

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
  console.log('Membuat pengaturan toko default...');
  const insertSetting = db.prepare(`
    INSERT INTO m_settings (key, value) VALUES (?, ?)
  `);
  
  insertSetting.run('store_name', 'Toko Saya');
  insertSetting.run('store_address', 'Alamat Toko');
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

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ SEEDING BERHASIL!');
  console.log('='.repeat(60));
  console.log('');
  console.log('📌 Database telah dibersihkan dan di-reset ke kondisi awal.');
  console.log('');
  console.log('🔑 Kredensial Login Default:');
  console.log('');
  console.log('   Administrator:');
  console.log('   - Username: admin');
  console.log('   - Password: admin123');
  console.log('');
  console.log('   Kasir:');
  console.log('   - Username: kasir1');
  console.log('   - Password: kasir123');
  console.log('');
  console.log('⚠️  PENTING: Segera ganti password default setelah login!');
  console.log('');
  console.log('📝 Langkah selanjutnya:');
  console.log('   1. Login ke aplikasi (http://localhost:3000)');
  console.log('   2. Ganti password admin & kasir di menu Profil');
  console.log('   3. Update pengaturan toko di menu Pengaturan');
  console.log('   4. Mulai input data produk & transaksi');
  console.log('');
  console.log('='.repeat(60));
});

try {
  runSeeding();
} catch (error) {
  console.error('Gagal melakukan seeding database:', error);
}
