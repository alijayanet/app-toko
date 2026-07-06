const db = require('./db');
const crypto = require('crypto');

function hashPassword(password) {
  const salt = 'pos_secret_salt_123';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

console.log('Memulai seeding database...');

// Gunakan transaksi untuk memastikan seeding berjalan atomik
const runSeeding = db.transaction(() => {
  // Hapus data lama agar bersih sebelum seed ulang
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

  console.log('Menghapus data lama berhasil.');

  // Seed default users
  const insertUser = db.prepare(`
    INSERT INTO m_users (username, password, name, role) VALUES (?, ?, ?, ?)
  `);
  insertUser.run('admin', hashPassword('admin123'), 'Administrator Toko', 'ADMIN');
  insertUser.run('kasir1', hashPassword('kasir123'), 'Siti Kasir', 'CASHIER');

  // Seed default settings
  const insertSetting = db.prepare(`
    INSERT INTO m_settings (key, value) VALUES (?, ?)
  `);
  insertSetting.run('store_name', 'Toko Kelontong & Grosir Rejeki');
  insertSetting.run('store_address', 'Jl. Kaliurang KM 12, Sleman, Yogyakarta');
  insertSetting.run('store_phone', '0812-3456-7890');
  insertSetting.run('receipt_footer', 'TERIMA KASIH ATAS KUNJUNGAN ANDA\nStruk ini adalah bukti pembayaran sah.');

  // 1. Seed Master Supplier
  const insertSupplier = db.prepare(`
    INSERT INTO m_suppliers (id, name, phone, address) VALUES (?, ?, ?, ?)
  `);
  insertSupplier.run(1, 'PT. Indo Agro Lestari (Distributor Minyak & Beras)', '021-5551234', 'Kawasan Industri Pulogadung, Jakarta');
  insertSupplier.run(2, 'CV. Makmur Jaya Abadi (Distributor Mi & Minuman)', '08123456789', 'Jl. Kaliurang KM 10, Yogyakarta');

  // 2. Seed Master Pelanggan
  const insertCustomer = db.prepare(`
    INSERT INTO m_customers (id, name, phone, address) VALUES (?, ?, ?, ?)
  `);
  insertCustomer.run(1, 'Warung Bu Siti (Bon Aktif)', '085678901234', 'Jl. Merdeka No. 45, Sleman');
  insertCustomer.run(2, 'Kantin Pak Joko', '08991234567', 'Area Kampus UGM, Yogyakarta');
  insertCustomer.run(3, 'Toko Grosir Berkah', '081399887766', 'Pasar Gamping Blok C, Sleman');

  // 3. Seed Master Produk & Konversi Satuan
  const insertProduct = db.prepare(`
    INSERT INTO m_products (id, name, cost_price_base, stock, min_stock) VALUES (?, ?, ?, ?, ?)
  `);

  const insertUnit = db.prepare(`
    INSERT INTO m_product_units (product_id, unit_name, conversion_factor, price_retail, price_wholesale, wholesale_min_qty) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertStockLog = db.prepare(`
    INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) VALUES (?, ?, ?, ?)
  `);

  // --- Produk 1: Indomie Goreng ---
  // Barcode / SKU: 8998866200225 (Barcode Indomie Goreng asli)
  insertProduct.run('8998866200225', 'Indomie Goreng 85g', 2800.0, 450, 40);
  // Pcs (Unit Terkecil, conversion_factor = 1)
  insertUnit.run('8998866200225', 'Pcs', 1, 3500.0, 3300.0, 10);
  // Pak (Isi 5 pcs, conversion_factor = 5)
  insertUnit.run('8998866200225', 'Pak', 5, 17000.0, 16000.0, 5);
  // Dus (Isi 40 pcs, conversion_factor = 40)
  insertUnit.run('8998866200225', 'Dus', 40, 132000.0, 128000.0, 1);
  // Log stok awal
  insertStockLog.run('8998866200225', 450, 'PURCHASE', 'SALDO AWAL');

  // --- Produk 2: Coca Cola 1.5L ---
  // Barcode / SKU: 8999999002251
  insertProduct.run('8999999002251', 'Coca Cola Botol 1.5L', 12000.0, 60, 12);
  // Botol (Unit Terkecil, conversion_factor = 1)
  insertUnit.run('8999999002251', 'Botol', 1, 15000.0, 14200.0, 6);
  // Dus (Isi 12 botol, conversion_factor = 12)
  insertUnit.run('8999999002251', 'Dus', 12, 172000.0, 166000.0, 1);
  // Log stok awal
  insertStockLog.run('8999999002251', 60, 'PURCHASE', 'SALDO AWAL');

  // --- Produk 3: Minyak Goreng Bimoli 2L ---
  // Barcode / SKU: 8999999003301
  insertProduct.run('8999999003301', 'Minyak Goreng Bimoli 2L', 34500.0, 48, 10);
  // Pcs (Unit Terkecil, conversion_factor = 1)
  insertUnit.run('8999999003301', 'Pcs', 1, 39000.0, 37800.0, 4);
  // Dus (Isi 6 pcs, conversion_factor = 6)
  insertUnit.run('8999999003301', 'Dus', 6, 228000.0, 222000.0, 1);
  // Log stok awal
  insertStockLog.run('8999999003301', 48, 'PURCHASE', 'SALDO AWAL');

  // --- Produk 4: Beras Maknyuss 5kg ---
  // Barcode / SKU: 8999999004401
  insertProduct.run('8999999004401', 'Beras Maknyuss Premium 5kg', 69000.0, 15, 5);
  // Pack (Unit Terkecil, conversion_factor = 1)
  insertUnit.run('8999999004401', 'Pack', 1, 78000.0, 75500.0, 2);
  // Log stok awal
  insertStockLog.run('8999999004401', 15, 'PURCHASE', 'SALDO AWAL');


  // 4. Seed Beberapa Transaksi Piutang Awal (Untuk demo halaman buku hutang/piutang)
  // Transaksi 1: Warung Bu Siti belanja tempo (Kredit)
  db.prepare(`
    INSERT INTO t_sales (
      invoice_no, customer_id, total_amount, total_profit, payment_type, payment_status, due_date, cash_amount, change_amount, debt_balance
    ) VALUES (
      'INV-20260701-0011', 1, 192000.0, 44000.0, 'CREDIT', 'PARTIAL', '2026-07-15 00:00:00', 50000.0, 0.0, 142000.0
    )
  `).run();

  const saleId1 = db.prepare("SELECT last_insert_rowid() as id").get().id;

  // Detail Transaksi 1: Beli 1 Dus Bimoli (228000 retail, but wholesale? Min qty is 1, so price is 222000 wholesale)
  // Wait, let's just make it simple: Beli 1 Dus Bimoli (1 Dus = 6 pcs * cost 34500 = 207000 cost. Price wholesale 222000. Profit = 15000)
  // Beli 1 Dus Indomie (1 Dus = 40 pcs * cost 2800 = 112000 cost. Price wholesale 128000. Profit = 16000)
  // Total cost = 207000 + 112000 = 319000. Total price = 222000 + 128000 = 350000. Total Profit = 31000.
  // Let's write the exact detail lines to match the saleId1.
  // Wait, let's keep the details aligned.
  
  // Detail 1: 1 Dus Bimoli
  db.prepare(`
    INSERT INTO t_sales_details (sale_id, product_id, unit_id, unit_name, qty, conversion_factor, price_used, subtotal, profit)
    VALUES (?, '8999999003301', (SELECT id FROM m_product_units WHERE product_id = '8999999003301' AND unit_name = 'Dus'), 'Dus', 1, 6, 222000.0, 222000.0, 15000.0)
  `).run(saleId1);
  // Kurangi stok Bimoli sebanyak 6 pcs
  db.prepare("UPDATE m_products SET stock = stock - 6 WHERE id = '8999999003301'").run();
  insertStockLog.run('8999999003301', -6, 'SALE', 'INV-20260701-0011');

  // Detail 2: 2 Pak Indomie Goreng (2 Pak = 10 Pcs. Cost = 10 * 2800 = 28000. Price wholesale = 16000 per Pak. Total = 32000. Profit = 4000)
  db.prepare(`
    INSERT INTO t_sales_details (sale_id, product_id, unit_id, unit_name, qty, conversion_factor, price_used, subtotal, profit)
    VALUES (?, '8998866200225', (SELECT id FROM m_product_units WHERE product_id = '8998866200225' AND unit_name = 'Pak'), 'Pak', 2, 5, 16000.0, 32000.0, 4000.0)
  `).run(saleId1);
  // Kurangi stok Indomie sebanyak 10 Pcs
  db.prepare("UPDATE m_products SET stock = stock - 10 WHERE id = '8998866200225'").run();
  insertStockLog.run('8998866200225', -10, 'SALE', 'INV-20260701-0011');

  // Perbaiki total_amount dan profit di t_sales
  db.prepare(`
    UPDATE t_sales SET total_amount = 254000.0, total_profit = 19000.0, debt_balance = 204000.0 
    WHERE id = ?
  `).run(saleId1);

  // Log pembayaran cicilan perdana 50rb
  db.prepare(`
    INSERT INTO t_customer_debt_payments (sale_id, amount, note) VALUES (?, 50000.0, 'Bayar DP Tunai saat belanja')
  `).run(saleId1);


  // 5. Seed Transaksi Hutang Dagang Awal (Hutang Toko ke Supplier)
  db.prepare(`
    INSERT INTO t_purchases (
      supplier_id, total_amount, payment_type, payment_status, due_date, debt_balance
    ) VALUES (
      2, 1120000.0, 'CREDIT', 'UNPAID', '2026-07-20 00:00:00', 1120000.0
    )
  `).run();

  const purchaseId1 = db.prepare("SELECT last_insert_rowid() as id").get().id;

  // Detail Pembelian: Beli 10 Dus Indomie Goreng langsung dari supplier (Cost per Dus = 40 * 2800 = 112000. Total = 10 * 112000 = 1120000)
  db.prepare(`
    INSERT INTO t_purchase_details (purchase_id, product_id, unit_name, qty, conversion_factor, cost_price, subtotal)
    VALUES (?, '8998866200225', 'Dus', 10, 40, 112000.0, 1120000.0)
  `).run(purchaseId1);
  
  // Stok Indomie ditambah 400 pcs (sudah tercakup di saldo awal 450, biarkan saja sebagai histori transaksi)

  console.log('Seeding selesai dengan sukses!');
});

try {
  runSeeding();
} catch (error) {
  console.error('Gagal melakukan seeding database:', error);
}
