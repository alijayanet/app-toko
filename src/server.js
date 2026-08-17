require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const qrisUtil = require('./qrisUtil');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'application/x-sqlite3'], limit: '100mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Hash Password Helper (PBKDF2)
function hashPassword(password) {
  const salt = 'pos_secret_salt_123';
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak disediakan.' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Format token tidak valid.' });

  try {
    const session = db.prepare(`
      SELECT s.token, u.id, u.username, u.name, u.role 
      FROM t_sessions s 
      JOIN m_users u ON s.user_id = u.id 
      WHERE s.token = ?
    `).get(token);

    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi tidak valid atau telah berakhir.' });
    }

    req.user = {
      id: session.id,
      username: session.username,
      name: session.name,
      role: session.role
    };
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Helper: Format invoice number (INV-YYYYMMDD-XXXX)
function generateInvoiceNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countToday = db.prepare(`
    SELECT COUNT(*) as count FROM t_sales 
    WHERE date(sale_date) = date('now', 'localtime')
  `).get().count;
  const seq = String(countToday + 1).padStart(4, '0');
  return `INV-${dateStr}-${seq}`;
}

// ==========================================
// 0. AUTHENTICATION & SETTINGS ENDPOINTS
// ==========================================

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  try {
    const user = db.prepare('SELECT * FROM m_users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const hashedInput = hashPassword(password);
    if (user.password !== hashedInput) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO t_sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

    return res.json({
      success: true,
      message: 'Login berhasil.',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Profile
app.get('/api/auth/profile', authenticate, (req, res) => {
  return res.json({ success: true, data: req.user });
});

// Update Profile Mandiri
app.put('/api/auth/profile', authenticate, (req, res) => {
  const { name, username, password } = req.body;
  const userId = req.user.id;

  if (!name || !username) {
    return res.status(400).json({ success: false, message: 'Nama dan username wajib diisi.' });
  }

  try {
    const existing = db.prepare('SELECT id FROM m_users WHERE username = ? AND id != ?').get(username, userId);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username telah digunakan oleh orang lain.' });
    }

    if (password && password.trim() !== '') {
      const hashedPass = hashPassword(password);
      db.prepare('UPDATE m_users SET name = ?, username = ?, password = ? WHERE id = ?').run(name, username, hashedPass, userId);
    } else {
      db.prepare('UPDATE m_users SET name = ?, username = ? WHERE id = ?').run(name, username, userId);
    }

    const updatedUser = db.prepare('SELECT id, username, name, role FROM m_users WHERE id = ?').get(userId);
    return res.json({ success: true, message: 'Profil berhasil diperbarui.', data: updatedUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(400).json({ success: false, message: 'Token tidak valid.' });
  const token = authHeader.split(' ')[1];

  try {
    db.prepare('DELETE FROM t_sessions WHERE token = ?').run(token);
    return res.json({ success: true, message: 'Logout berhasil.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get Settings
app.get('/api/settings', (req, res) => {
  try {
    const settingsRows = db.prepare('SELECT * FROM m_settings').all();
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });
    return res.json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update Settings (Admin Only)
app.post('/api/settings', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengubah pengaturan.' });
  }

  const { store_name, store_address, store_phone, receipt_footer, qris_static_payload } = req.body;
  if (!store_name) {
    return res.status(400).json({ success: false, message: 'Nama toko wajib diisi.' });
  }

  const updateSettingTx = db.transaction(() => {
    const upsert = db.prepare('INSERT OR REPLACE INTO m_settings (key, value) VALUES (?, ?)');
    upsert.run('store_name', store_name);
    upsert.run('store_address', store_address || '');
    upsert.run('store_phone', store_phone || '');
    upsert.run('receipt_footer', receipt_footer || '');
    if (qris_static_payload !== undefined) {
      upsert.run('qris_static_payload', qris_static_payload.trim());
    }
  });

  try {
    updateSettingTx();
    return res.json({ success: true, message: 'Pengaturan toko berhasil diperbarui.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint Generate Dynamic QRIS EMVCo
app.get('/api/qris/generate', authenticate, (req, res) => {
  const amount = parseFloat(req.query.amount || 0);
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Nominal transaksi QRIS tidak valid.' });
  }

  try {
    const settingRow = db.prepare("SELECT value FROM m_settings WHERE key = 'qris_static_payload'").get();
    const staticPayload = settingRow?.value;
    if (!staticPayload || staticPayload.trim() === '') {
      return res.status(400).json({ success: false, message: 'QRIS Statis Toko belum diatur di Pengaturan Toko.' });
    }

    const dynamicPayload = qrisUtil.convertStaticQrisToDynamic(staticPayload, amount);
    const merchantName = qrisUtil.getMerchantNameFromPayload(staticPayload);

    return res.json({
      success: true,
      data: {
        payload: dynamicPayload,
        merchant_name: merchantName,
        amount
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Backup Database (Admin Only)
app.get('/api/settings/backup', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengunduh backup database.' });
  }
  const dbFile = path.resolve(__dirname, '../database.db');
  const dateStr = new Date().toISOString().slice(0, 10);
  res.download(dbFile, `backup-pos-${dateStr}.db`, (err) => {
    if (err) {
      console.error('Error downloading backup:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal mengunduh berkas database' });
      }
    }
  });
});

// Restore Database (Admin Only)
app.post('/api/settings/restore', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat memulihkan database.' });
  }

  try {
    let fileBuffer;
    if (Buffer.isBuffer(req.body)) {
      fileBuffer = req.body;
    } else if (req.body && req.body.fileBase64) {
      fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
    } else {
      return res.status(400).json({ success: false, message: 'Data berkas database tidak ditemukan.' });
    }

    const result = db.restoreDatabaseFromBuffer(fileBuffer);
    return res.json({
      success: true,
      message: result.message || 'Database berhasil dipulihkan!'
    });
  } catch (error) {
    console.error('Error during database restore:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat memulihkan database.'
    });
  }
});


// ==========================================
// 1. ENDPOINT PRODUK & SCANNING (SECURED)
// ==========================================

// Get Categories
app.get('/api/products/categories', authenticate, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT category FROM m_products 
      WHERE category IS NOT NULL AND category != '' 
      ORDER BY category ASC
    `).all();
    const categories = rows.map(r => r.category);
    if (!categories.includes('Umum')) categories.unshift('Umum');
    return res.json({ success: true, data: categories });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Scan Barcode atau Cari Produk (Exact)
app.get('/api/products/scan/:barcode', authenticate, (req, res) => {
  const { barcode } = req.params;
  try {
    const product = db.prepare(`
      SELECT * FROM m_products 
      WHERE LOWER(id) = LOWER(?) 
         OR LOWER(name) = LOWER(?)
    `).get(barcode, barcode);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    const units = db.prepare('SELECT * FROM m_product_units WHERE product_id = ?').all(product.id);
    return res.json({ success: true, data: { ...product, units } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Search Produk Multi-Query (By Name, SKU, Satuan, Kategori)
app.get('/api/products/search', authenticate, (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, data: [] });
  }
  try {
    const pattern = `%${query}%`;
    const products = db.prepare(`
      SELECT DISTINCT p.* FROM m_products p
      LEFT JOIN m_product_units u ON p.id = u.product_id
      WHERE p.id LIKE ? 
         OR p.name LIKE ? 
         OR p.category LIKE ? 
         OR u.unit_name LIKE ?
      LIMIT 25
    `).all(pattern, pattern, pattern, pattern);

    const result = products.map(p => {
      const units = db.prepare('SELECT * FROM m_product_units WHERE product_id = ?').all(p.id);
      return { ...p, units };
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// List Produk beserta Satuan dan Stok
app.get('/api/products', authenticate, (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM m_products').all();
    const result = products.map(p => {
      const units = db.prepare('SELECT * FROM m_product_units WHERE product_id = ?').all(p.id);
      return { ...p, units };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Tambah Produk Baru (Admin Only)
app.post('/api/products', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mendaftarkan produk baru.' });
  }

  const { id, name, category, cost_price_base, stock, min_stock, units } = req.body;
  if (!id || !name || cost_price_base === undefined || stock === undefined || !units || !units.length) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
  }

  const insertProductTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO m_products (id, name, category, cost_price_base, stock, min_stock) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, category || 'Umum', cost_price_base, stock, min_stock || 0);

    const insertUnit = db.prepare(`
      INSERT INTO m_product_units (product_id, unit_name, conversion_factor, price_retail, price_wholesale, wholesale_min_qty) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const unit of units) {
      insertUnit.run(
        id, 
        unit.unit_name, 
        unit.conversion_factor, 
        unit.price_retail || 0, 
        unit.price_wholesale || 0, 
        unit.wholesale_min_qty || 0
      );
    }

    if (stock > 0) {
      db.prepare(`
        INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
        VALUES (?, ?, 'PURCHASE', 'STOCK AWAL BARU')
      `).run(id, stock);
    }
  });

  try {
    insertProductTx();
    return res.json({ success: true, message: 'Produk berhasil ditambahkan' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update/Edit Produk (Admin Only)
app.put('/api/products/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat memperbarui produk.' });
  }
  const { id } = req.params;
  const { name, category, cost_price_base, min_stock, units } = req.body;
  if (!name || cost_price_base === undefined || !units || !units.length) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
  }
  
  const updateProductTx = db.transaction(() => {
    db.prepare('UPDATE m_products SET name = ?, category = ?, cost_price_base = ?, min_stock = ? WHERE id = ?')
      .run(name, category || 'Umum', cost_price_base, min_stock || 0, id);
    
    // Hapus unit lama
    db.prepare('DELETE FROM m_product_units WHERE product_id = ?').run(id);
    
    // Masukkan unit baru
    const insertUnit = db.prepare(`
      INSERT INTO m_product_units (product_id, unit_name, conversion_factor, price_retail, price_wholesale, wholesale_min_qty) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const unit of units) {
      insertUnit.run(
        id, 
        unit.unit_name, 
        unit.conversion_factor, 
        unit.price_retail || 0, 
        unit.price_wholesale || 0, 
        unit.wholesale_min_qty || 0
      );
    }
  });

  try {
    updateProductTx();
    return res.json({ success: true, message: 'Produk berhasil diperbarui' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Hapus Produk (Admin Only)
app.delete('/api/products/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat menghapus produk.' });
  }
  const { id } = req.params;
  
  try {
    const deleteTx = db.transaction(() => {
      // Hapus unit terkait
      db.prepare('DELETE FROM m_product_units WHERE product_id = ?').run(id);
      // Hapus produk
      db.prepare('DELETE FROM m_products WHERE id = ?').run(id);
    });
    
    deleteTx();
    return res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (error) {
    if (error.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ success: false, message: 'Produk tidak dapat dihapus karena memiliki riwayat transaksi keuangan/stok. Silakan lakukan penyesuaian stok menjadi 0 jika tidak ingin digunakan kembali.' });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Batch Import Produk dari Excel / CSV (Admin Only)
app.post('/api/products/import-batch', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengimpor produk.' });
  }

  const { items, mode } = req.body; // mode: 'upsert' or 'insert_only'
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Daftar produk import kosong.' });
  }

  const importTx = db.transaction((productList) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const findProduct = db.prepare('SELECT id, stock FROM m_products WHERE id = ?');
    const insertProduct = db.prepare(`
      INSERT INTO m_products (id, name, category, cost_price_base, stock, min_stock) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateProduct = db.prepare(`
      UPDATE m_products 
      SET name = ?, category = ?, cost_price_base = ?, stock = ?, min_stock = ?
      WHERE id = ?
    `);
    const deleteUnits = db.prepare('DELETE FROM m_product_units WHERE product_id = ?');
    const insertUnit = db.prepare(`
      INSERT INTO m_product_units (product_id, unit_name, conversion_factor, price_retail, price_wholesale, wholesale_min_qty) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertStockLog = db.prepare(`
      INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
      VALUES (?, ?, 'PURCHASE', 'IMPORT EXCEL')
    `);

    for (const item of productList) {
      const id = String(item.id || item.sku || item.barcode || '').trim();
      const name = String(item.name || item.nama || '').trim();
      if (!id || !name) {
        skipped++;
        continue;
      }

      const category = String(item.category || item.kategori || 'Umum').trim();
      const cost_price_base = Math.max(0, parseFloat(item.cost_price_base ?? item.harga_modal ?? item.harga_beli ?? 0) || 0);
      const stock = Math.max(0, parseFloat(item.stock ?? item.stok ?? 0) || 0);
      const min_stock = Math.max(0, parseFloat(item.min_stock ?? item.min_stok ?? 0) || 0);
      const units = Array.isArray(item.units) && item.units.length > 0 ? item.units : [
        {
          unit_name: item.unit_name || item.satuan || 'Pcs',
          conversion_factor: 1,
          price_retail: Math.max(0, parseFloat(item.price_retail ?? item.harga_jual ?? item.harga_eceran ?? item.eceran ?? 0) || 0),
          price_wholesale: Math.max(0, parseFloat(item.price_wholesale ?? item.harga_grosir ?? item.grosir ?? 0) || 0),
          wholesale_min_qty: Math.max(0, parseFloat(item.wholesale_min_qty ?? item.min_grosir ?? 0) || 0)
        }
      ];

      const existing = findProduct.get(id);

      if (existing) {
        if (mode === 'insert_only') {
          skipped++;
          continue;
        }
        // Update product
        updateProduct.run(name, category, cost_price_base, stock, min_stock, id);
        deleteUnits.run(id);
        for (const u of units) {
          insertUnit.run(id, u.unit_name || 'Pcs', parseFloat(u.conversion_factor) || 1, u.price_retail || 0, u.price_wholesale || 0, u.wholesale_min_qty || 0);
        }
        updated++;
      } else {
        // Insert new product
        insertProduct.run(id, name, category, cost_price_base, stock, min_stock);
        for (const u of units) {
          insertUnit.run(id, u.unit_name || 'Pcs', parseFloat(u.conversion_factor) || 1, u.price_retail || 0, u.price_wholesale || 0, u.wholesale_min_qty || 0);
        }
        if (stock > 0) {
          insertStockLog.run(id, stock);
        }
        inserted++;
      }
    }

    return { inserted, updated, skipped };
  });

  try {
    const stats = importTx(items);
    return res.json({
      success: true,
      message: `Import berhasil! Ditambahkan: ${stats.inserted}, Diperbarui: ${stats.updated}, Dilewati: ${stats.skipped}`,
      stats
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Penyesuaian Stok Manual (Admin & Cashier)
app.post('/api/products/adjust-stock', authenticate, (req, res) => {
  const { product_id, qty_change, note } = req.body;
  if (!product_id || qty_change === undefined) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
  }

  const adjustTx = db.transaction(() => {
    const product = db.prepare('SELECT stock FROM m_products WHERE id = ?').get(product_id);
    if (!product) throw new Error('Produk tidak ditemukan');

    const newStock = product.stock + parseFloat(qty_change);
    if (newStock < 0) throw new Error('Penyesuaian stok akan menghasilkan stok negatif!');

    db.prepare('UPDATE m_products SET stock = ? WHERE id = ?').run(newStock, product_id);
    db.prepare(`
      INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
      VALUES (?, ?, 'ADJUSTMENT', ?)
    `).run(product_id, qty_change, note || 'Koreksi Stok Manual');
  });

  try {
    adjustTx();
    return res.json({ success: true, message: 'Stok berhasil disesuaikan' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});


// ==========================================
// 2. ENDPOINT CHECKOUT PENJUALAN & RIWAYAT (SALES)
// ==========================================
app.post('/api/sales/checkout', authenticate, (req, res) => {
  const { customer_id, payment_type, cash_amount, discount_amount, due_date, items } = req.body;

  if (!payment_type || !items || !items.length) {
    return res.status(400).json({ success: false, message: 'Keranjang belanja kosong atau data tidak lengkap' });
  }

  const checkoutTx = db.transaction(() => {
    const invoiceNo = generateInvoiceNumber();
    let subtotalAmount = 0;
    let totalProfit = 0;
    const detailLines = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM m_products WHERE id = ?').get(item.product_id);
      if (!product) throw new Error(`Produk dengan SKU ${item.product_id} tidak ditemukan`);

      const unit = db.prepare('SELECT * FROM m_product_units WHERE id = ?').get(item.unit_id);
      if (!unit) throw new Error(`Satuan produk ${item.unit_id} tidak valid`);

      const totalQtyBase = item.qty * unit.conversion_factor;

      if (product.stock < totalQtyBase) {
        throw new Error(`Stok produk "${product.name}" tidak mencukupi. Sisa stok: ${product.stock} base unit.`);
      }

      const useWholesale = unit.wholesale_min_qty > 0 && item.qty >= unit.wholesale_min_qty;
      const priceUsed = useWholesale ? unit.price_wholesale : unit.price_retail;
      const subtotal = item.qty * priceUsed;

      const costOfItem = totalQtyBase * product.cost_price_base;
      const profit = subtotal - costOfItem;

      subtotalAmount += subtotal;
      totalProfit += profit;

      detailLines.push({
        product_id: product.id,
        product_name: product.name,
        unit_id: unit.id,
        unit_name: unit.unit_name,
        qty: item.qty,
        conversion_factor: unit.conversion_factor,
        price_used: priceUsed,
        subtotal,
        profit
      });
    }

    const discountVal = parseFloat(discount_amount || 0);
    const totalAmount = Math.max(0, subtotalAmount - discountVal);
    totalProfit = Math.max(0, totalProfit - discountVal);

    let finalCash = parseFloat(cash_amount || 0);
    let changeAmount = 0;
    let debtBalance = 0;
    let paymentStatus = 'PAID';

    if (payment_type === 'CASH') {
      if (finalCash < totalAmount) {
        throw new Error(`Pembayaran tunai kurang! Total belanja: Rp ${totalAmount}, Uang bayar: Rp ${finalCash}`);
      }
      changeAmount = finalCash - totalAmount;
    } else if (payment_type === 'QRIS') {
      paymentStatus = 'PAID';
      finalCash = totalAmount;
      changeAmount = 0;
      debtBalance = 0;
    } else {
      if (finalCash >= totalAmount) {
        paymentStatus = 'PAID';
        changeAmount = finalCash - totalAmount;
      } else {
        paymentStatus = finalCash > 0 ? 'PARTIAL' : 'UNPAID';
        debtBalance = totalAmount - finalCash;
      }
      if (!customer_id) {
        throw new Error('Transaksi tempo wajib memilih pelanggan!');
      }
    }

    const insertSale = db.prepare(`
      INSERT INTO t_sales (
        invoice_no, customer_id, user_id, cashier_name, discount_amount, total_amount, total_profit, payment_type, payment_status, due_date, cash_amount, change_amount, debt_balance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNo,
      customer_id || null,
      req.user.id || null,
      req.user.name || 'Kasir',
      discountVal,
      totalAmount,
      totalProfit,
      payment_type,
      paymentStatus,
      payment_type === 'CREDIT' ? due_date || null : null,
      finalCash,
      changeAmount,
      debtBalance
    );

    const saleId = insertSale.lastInsertRowid;

    const insertDetail = db.prepare(`
      INSERT INTO t_sales_details (sale_id, product_id, unit_id, unit_name, qty, conversion_factor, price_used, subtotal, profit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE m_products SET stock = stock - ? WHERE id = ?
    `);

    const insertStockLog = db.prepare(`
      INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
      VALUES (?, ?, 'SALE', ?)
    `);

    for (const line of detailLines) {
      insertDetail.run(
        saleId,
        line.product_id,
        line.unit_id,
        line.unit_name,
        line.qty,
        line.conversion_factor,
        line.price_used,
        line.subtotal,
        line.profit
      );

      const qtyBase = line.qty * line.conversion_factor;
      updateStock.run(qtyBase, line.product_id);
      insertStockLog.run(line.product_id, -qtyBase, invoiceNo);
    }

    if (payment_type === 'CREDIT' && finalCash > 0) {
      db.prepare(`
        INSERT INTO t_customer_debt_payments (sale_id, amount, note) 
        VALUES (?, ?, 'Uang muka tunai saat belanja')
      `).run(saleId, finalCash);
    }

    return {
      id: saleId,
      saleId,
      invoice_no: invoiceNo,
      subtotal_amount: subtotalAmount,
      discount_amount: discountVal,
      total_amount: totalAmount,
      cash_amount: finalCash,
      change_amount: changeAmount,
      debt_balance: debtBalance,
      payment_type,
      payment_status: paymentStatus,
      cashier_name: req.user.name || 'Kasir',
      due_date,
      sale_date: new Date().toISOString(),
      items: detailLines
    };
  });

  try {
    const receiptData = checkoutTx();
    return res.json({ success: true, message: 'Transaksi berhasil diselesaikan', receipt: receiptData });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// List Sales History with Date & Search Filters
app.get('/api/sales', authenticate, (req, res) => {
  const { startDate, endDate, search, payment_status, payment_type, limit } = req.query;
  try {
    let query = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone
      FROM t_sales s
      LEFT JOIN m_customers c ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ` AND date(s.sale_date, 'localtime') >= date(?, 'localtime')`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND date(s.sale_date, 'localtime') <= date(?, 'localtime')`;
      params.push(endDate);
    }
    if (search) {
      query += ` AND (s.invoice_no LIKE ? OR c.name LIKE ? OR s.cashier_name LIKE ? OR s.id IN (SELECT sale_id FROM t_sales_details WHERE product_id LIKE ?))`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (payment_status) {
      query += ` AND s.payment_status = ?`;
      params.push(payment_status);
    }
    if (payment_type) {
      query += ` AND s.payment_type = ?`;
      params.push(payment_type);
    }

    query += ` ORDER BY s.sale_date DESC`;
    const maxLimit = parseInt(limit || 100);
    query += ` LIMIT ?`;
    params.push(maxLimit);

    const sales = db.prepare(query).all(...params);
    return res.json({ success: true, data: sales });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get Single Sale Full Info for Reprint / Audit
app.get('/api/sales/:id', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    const sale = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
      FROM t_sales s
      LEFT JOIN m_customers c ON s.customer_id = c.id
      WHERE s.id = ? OR s.invoice_no = ?
    `).get(id, id);

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
    }

    const items = db.prepare(`
      SELECT d.*, p.name as product_name
      FROM t_sales_details d
      JOIN m_products p ON d.product_id = p.id
      WHERE d.sale_id = ?
    `).all(sale.id);

    const payments = db.prepare(`
      SELECT * FROM t_customer_debt_payments WHERE sale_id = ? ORDER BY payment_date DESC
    `).all(sale.id);

    return res.json({ success: true, data: { ...sale, items, payments } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Void / Batalkan Transaksi Penjualan (Admin Only)
app.delete('/api/sales/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat membatalkan transaksi.' });
  }
  const { id } = req.params;

  try {
    const voidTx = db.transaction(() => {
      const sale = db.prepare('SELECT * FROM t_sales WHERE id = ?').get(id);
      if (!sale) throw new Error('Transaksi penjualan tidak ditemukan');
      if (sale.payment_status === 'VOID') throw new Error('Transaksi ini sudah dibatalkan sebelumnya');

      const items = db.prepare('SELECT * FROM t_sales_details WHERE sale_id = ?').all(id);

      // Kembalikan stok untuk setiap item
      const restoreStock = db.prepare('UPDATE m_products SET stock = stock + ? WHERE id = ?');
      const insertStockLog = db.prepare(`
        INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
        VALUES (?, ?, 'ADJUSTMENT', ?)
      `);

      for (const item of items) {
        const qtyBase = item.qty * item.conversion_factor;
        restoreStock.run(qtyBase, item.product_id);
        insertStockLog.run(item.product_id, qtyBase, `VOID: ${sale.invoice_no}`);
      }

      // Tandai status penjualan menjadi VOID dan bersihkan sisa piutang jika ada
      db.prepare(`
        UPDATE t_sales 
        SET payment_status = 'VOID', debt_balance = 0, total_profit = 0
        WHERE id = ?
      `).run(id);
    });

    voidTx();
    return res.json({ success: true, message: 'Transaksi berhasil dibatalkan dan stok produk telah dikembalikan' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Get Sale Items / Details
app.get('/api/sales/:id/details', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    const items = db.prepare(`
      SELECT d.*, p.name as product_name
      FROM t_sales_details d
      JOIN m_products p ON d.product_id = p.id
      WHERE d.sale_id = ?
    `).all(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get Purchase Items / Details
app.get('/api/purchases/:id/details', authenticate, (req, res) => {
  const { id } = req.params;
  try {
    const items = db.prepare(`
      SELECT d.*, p.name as product_name
      FROM t_purchase_details d
      JOIN m_products p ON d.product_id = p.id
      WHERE d.purchase_id = ?
    `).all(id);
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


// ==========================================
// 3. ENDPOINT INPUT PEMBELIAN SUPPLIER (ADMIN ONLY)
// ==========================================
app.post('/api/purchases/checkout', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mencatat pembelian supplier.' });
  }

  const { supplier_id, payment_type, cash_paid, due_date, items } = req.body;

  if (!payment_type || !items || !items.length) {
    return res.status(400).json({ success: false, message: 'Data pembelian tidak lengkap' });
  }

  const purchaseTx = db.transaction(() => {
    let totalAmount = 0;
    const detailLines = [];

    for (const item of items) {
      const product = db.prepare('SELECT id, name FROM m_products WHERE id = ?').get(item.product_id);
      if (!product) throw new Error(`Produk SKU ${item.product_id} tidak ditemukan`);

      const subtotal = item.qty * item.cost_price;
      totalAmount += subtotal;

      detailLines.push({
        product_id: item.product_id,
        unit_name: item.unit_name,
        qty: item.qty,
        conversion_factor: item.conversion_factor,
        cost_price: item.cost_price,
        subtotal
      });
    }

    let finalPaid = parseFloat(cash_paid || 0);
    let debtBalance = 0;
    let paymentStatus = 'PAID';

    if (payment_type === 'CASH') {
      finalPaid = totalAmount;
    } else {
      if (finalPaid >= totalAmount) {
        paymentStatus = 'PAID';
      } else {
        paymentStatus = finalPaid > 0 ? 'PARTIAL' : 'UNPAID';
        debtBalance = totalAmount - finalPaid;
      }
      if (!supplier_id) {
        throw new Error('Transaksi tempo pembelian wajib memilih Supplier!');
      }
    }

    const insertPurchase = db.prepare(`
      INSERT INTO t_purchases (supplier_id, total_amount, payment_type, payment_status, due_date, debt_balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      supplier_id || null,
      totalAmount,
      payment_type,
      paymentStatus,
      payment_type === 'CREDIT' ? due_date || null : null,
      debtBalance
    );

    const purchaseId = insertPurchase.lastInsertRowid;

    const insertDetail = db.prepare(`
      INSERT INTO t_purchase_details (purchase_id, product_id, unit_name, qty, conversion_factor, cost_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE m_products SET stock = stock + ?, cost_price_base = ? WHERE id = ?
    `);

    const insertStockLog = db.prepare(`
      INSERT INTO t_stock_logs (product_id, qty_change, type, reference_id) 
      VALUES (?, ?, 'PURCHASE', ?)
    `);

    for (const line of detailLines) {
      insertDetail.run(
        purchaseId,
        line.product_id,
        line.unit_name,
        line.qty,
        line.conversion_factor,
        line.cost_price,
        line.subtotal
      );

      const costBase = line.cost_price / line.conversion_factor;
      const qtyBase = line.qty * line.conversion_factor;

      updateStock.run(qtyBase, costBase, line.product_id);
      insertStockLog.run(line.product_id, qtyBase, `PURCHASE-${purchaseId}`);
    }

    if (payment_type === 'CREDIT' && finalPaid > 0) {
      db.prepare(`
        INSERT INTO t_supplier_debt_payments (purchase_id, amount, note) 
        VALUES (?, ?, 'Uang muka pembelian tunai')
      `).run(purchaseId, finalPaid);
    }

    return { purchaseId, totalAmount, debtBalance, paymentStatus };
  });

  try {
    const result = purchaseTx();
    return res.json({ success: true, message: 'Pembelian stok berhasil dimasukkan', data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});


// ==========================================
// 4. ENDPOINT MANAJEMEN HUTANG & PIUTANG (TEMPO) (SECURED)
// ==========================================

// --- PIUTANG (PELANGGAN) ---
app.get('/api/debts/customers', authenticate, (req, res) => {
  try {
    const data = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone
      FROM t_sales s
      JOIN m_customers c ON s.customer_id = c.id
      WHERE s.debt_balance > 0
      ORDER BY s.sale_date DESC
    `).all();

    const result = data.map(sale => {
      const payments = db.prepare('SELECT * FROM t_customer_debt_payments WHERE sale_id = ? ORDER BY payment_date DESC').all(sale.id);
      return { ...sale, payments };
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/debts/customers/pay', authenticate, (req, res) => {
  const { sale_id, amount, note } = req.body;
  if (!sale_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Data pembayaran tidak valid' });
  }

  const payTx = db.transaction(() => {
    const sale = db.prepare('SELECT debt_balance, total_amount FROM t_sales WHERE id = ?').get(sale_id);
    if (!sale) throw new Error('Nota penjualan tidak ditemukan');

    const curDebt = sale.debt_balance;
    if (curDebt <= 0) throw new Error('Piutang transaksi ini sudah lunas');

    const inputAmt = parseFloat(amount);
    if (inputAmt > curDebt) throw new Error(`Jumlah pembayaran melebihi sisa piutang (Rp ${curDebt})`);

    const newDebt = curDebt - inputAmt;
    let paymentStatus = newDebt === 0 ? 'PAID' : 'PARTIAL';

    db.prepare(`
      UPDATE t_sales 
      SET debt_balance = ?, payment_status = ? 
      WHERE id = ?
    `).run(newDebt, paymentStatus, sale_id);

    db.prepare(`
      INSERT INTO t_customer_debt_payments (sale_id, amount, note) 
      VALUES (?, ?, ?)
    `).run(sale_id, inputAmt, note || 'Bayar Cicilan Piutang');

    return { newDebt, paymentStatus };
  });

  try {
    const result = payTx();
    return res.json({ success: true, message: 'Pembayaran piutang berhasil dicatat', data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// --- HUTANG TOKO (KE SUPPLIER) (ADMIN ONLY) ---
app.get('/api/debts/suppliers', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat melihat daftar hutang toko.' });
  }

  try {
    const data = db.prepare(`
      SELECT p.*, s.name as supplier_name, s.phone as supplier_phone
      FROM t_purchases p
      JOIN m_suppliers s ON p.supplier_id = s.id
      WHERE p.debt_balance > 0
      ORDER BY p.purchase_date DESC
    `).all();

    const result = data.map(pur => {
      const payments = db.prepare('SELECT * FROM t_supplier_debt_payments WHERE purchase_id = ? ORDER BY payment_date DESC').all(pur.id);
      return { ...pur, payments };
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/debts/suppliers/pay', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mencatat pembayaran hutang toko.' });
  }

  const { purchase_id, amount, note } = req.body;
  if (!purchase_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Data pembayaran tidak valid' });
  }

  const payTx = db.transaction(() => {
    const pur = db.prepare('SELECT debt_balance FROM t_purchases WHERE id = ?').get(purchase_id);
    if (!pur) throw new Error('Data pembelian tidak ditemukan');

    const curDebt = pur.debt_balance;
    if (curDebt <= 0) throw new Error('Hutang pembelian ini sudah lunas');

    const inputAmt = parseFloat(amount);
    if (inputAmt > curDebt) throw new Error(`Jumlah pembayaran melebihi sisa hutang (Rp ${curDebt})`);

    const newDebt = curDebt - inputAmt;
    let paymentStatus = newDebt === 0 ? 'PAID' : 'PARTIAL';

    db.prepare(`
      UPDATE t_purchases 
      SET debt_balance = ?, payment_status = ? 
      WHERE id = ?
    `).run(newDebt, paymentStatus, purchase_id);

    db.prepare(`
      INSERT INTO t_supplier_debt_payments (purchase_id, amount, note) 
      VALUES (?, ?, ?)
    `).run(purchase_id, inputAmt, note || 'Bayar Cicilan Hutang Supplier');

    return { newDebt, paymentStatus };
  });

  try {
    const result = payTx();
    return res.json({ success: true, message: 'Pembayaran hutang berhasil dicatat', data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});



// ==========================================
// 4.5 ENDPOINT MANAJEMEN USER / KARYAWAN (SECURED & ADMIN ONLY)
// ==========================================
app.get('/api/users', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengelola user.' });
  }
  try {
    const data = db.prepare('SELECT id, username, name, role FROM m_users ORDER BY name ASC').all();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/users', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengelola user.' });
  }
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
  }
  try {
    const existing = db.prepare('SELECT id FROM m_users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username sudah terdaftar.' });
    }
    const hashedPass = hashPassword(password);
    db.prepare('INSERT INTO m_users (username, password, name, role) VALUES (?, ?, ?, ?)').run(username, hashedPass, name, role);
    return res.json({ success: true, message: 'User berhasil ditambahkan.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengelola user.' });
  }
  const { id } = req.params;
  const { username, password, name, role } = req.body;
  if (!username || !name || !role) {
    return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
  }
  try {
    const existing = db.prepare('SELECT id FROM m_users WHERE username = ? AND id != ?').get(username, id);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan.' });
    }

    if (password && password.trim() !== '') {
      const hashedPass = hashPassword(password);
      db.prepare('UPDATE m_users SET username = ?, password = ?, name = ?, role = ? WHERE id = ?').run(username, hashedPass, name, role, id);
    } else {
      db.prepare('UPDATE m_users SET username = ?, name = ?, role = ? WHERE id = ?').run(username, name, role, id);
    }
    return res.json({ success: true, message: 'User berhasil diperbarui.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/users/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengelola user.' });
  }
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.' });
  }
  try {
    db.prepare('DELETE FROM t_sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM m_users WHERE id = ?').run(id);
    return res.json({ success: true, message: 'User berhasil dihapus.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


// ==========================================
// 5. ENDPOINT KONTAK (CUSTOMER & SUPPLIER) (SECURED)
// ==========================================

// CRUD Pelanggan
app.get('/api/customers', authenticate, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM m_customers ORDER BY name ASC').all();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/customers', authenticate, (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
  try {
    db.prepare('INSERT INTO m_customers (name, phone, address) VALUES (?, ?, ?)').run(name, phone || '', address || '');
    return res.json({ success: true, message: 'Pelanggan berhasil ditambahkan' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// CRUD Supplier
app.get('/api/suppliers', authenticate, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM m_suppliers ORDER BY name ASC').all();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/suppliers', authenticate, (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi' });
  try {
    db.prepare('INSERT INTO m_suppliers (name, phone, address) VALUES (?, ?, ?)').run(name, phone || '', address || '');
    return res.json({ success: true, message: 'Supplier berhasil ditambahkan' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/customers/:id — Edit pelanggan (ADMIN only)
app.put('/api/customers/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengedit data pelanggan.' });
  }
  const { id } = req.params;
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi' });
  try {
    const result = db.prepare('UPDATE m_customers SET name = ?, phone = ?, address = ? WHERE id = ?').run(name, phone || '', address || '', id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    return res.json({ success: true, message: 'Data pelanggan berhasil diperbarui' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/customers/:id — Hapus pelanggan (ADMIN only)
app.delete('/api/customers/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat menghapus data pelanggan.' });
  }
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM m_customers WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
    return res.json({ success: true, message: 'Pelanggan berhasil dihapus' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/suppliers/:id — Edit supplier (ADMIN only)
app.put('/api/suppliers/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat mengedit data supplier.' });
  }
  const { id } = req.params;
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama supplier wajib diisi' });
  try {
    const result = db.prepare('UPDATE m_suppliers SET name = ?, phone = ?, address = ? WHERE id = ?').run(name, phone || '', address || '', id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
    return res.json({ success: true, message: 'Data supplier berhasil diperbarui' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/suppliers/:id — Hapus supplier (ADMIN only)
app.delete('/api/suppliers/:id', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang dapat menghapus data supplier.' });
  }
  const { id } = req.params;
  try {
    const result = db.prepare('DELETE FROM m_suppliers WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Supplier tidak ditemukan' });
    return res.json({ success: true, message: 'Supplier berhasil dihapus' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


// ==========================================
// 6. ENDPOINT LAPORAN & DASHBOARD (ADMIN ONLY)
// ==========================================
app.get('/api/reports/dashboard', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Laporan keuangan hanya dapat diakses oleh Administrator.' });
  }

  try {
    const salesToday = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(total_profit), 0) as total_profit
      FROM t_sales
      WHERE date(sale_date, 'localtime') = date('now', 'localtime')
    `).get();

    const totalReceivable = db.prepare(`
      SELECT COALESCE(SUM(debt_balance), 0) as balance FROM t_sales WHERE debt_balance > 0
    `).get().balance;

    const totalPayable = db.prepare(`
      SELECT COALESCE(SUM(debt_balance), 0) as balance FROM t_purchases WHERE debt_balance > 0
    `).get().balance;

    const lowStockItems = db.prepare(`
      SELECT id, name, stock, min_stock FROM m_products WHERE stock <= min_stock
    `).all();

    const stockHistory = db.prepare(`
      SELECT l.*, p.name as product_name
      FROM t_stock_logs l
      JOIN m_products p ON l.product_id = p.id
      ORDER BY l.created_at DESC
      LIMIT 20
    `).all();

    const recentSales = db.prepare(`
      SELECT s.*, c.name as customer_name
      FROM t_sales s
      LEFT JOIN m_customers c ON s.customer_id = c.id
      ORDER BY s.sale_date DESC
      LIMIT 10
    `).all();

    return res.json({
      success: true,
      data: {
        total_sales_today: salesToday.total_sales,
        total_profit_today: salesToday.total_profit,
        total_receivables: totalReceivable,
        total_payables: totalPayable,
        low_stock_items: lowStockItems,
        stock_history: stockHistory,
        recent_sales: recentSales
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Jalankan Server Express
app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(` POS Central Server berjalan di http://${HOST}:${PORT}`);
  console.log(` Dapat diakses dari HP / Client di LAN lewat IP server.`);
  console.log(`====================================================`);
});
