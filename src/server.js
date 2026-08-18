require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const qrisUtil = require('./qrisUtil');
const updater = require('./updater');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Rate Limiting Store (in-memory simple implementation)
const loginAttempts = new Map(); // { ip: { count, lastAttempt } }

// Cleanup expired sessions every hour
setInterval(() => {
  try {
    const deleted = db.prepare('DELETE FROM t_sessions WHERE expires_at < datetime("now")').run();
    if (deleted.changes > 0) {
      console.log(`[Session Cleanup] Removed ${deleted.changes} expired session(s)`);
    }
  } catch (err) {
    console.error('[Session Cleanup] Error:', err.message);
  }
}, 60 * 60 * 1000); // Every 1 hour

// Cleanup rate limit map every 30 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  for (const [ip, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > windowMs) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000); // Every 30 minutes

function checkRateLimit(ip, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  
  if (!record) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Reset jika sudah lewat window time
  if (now - record.lastAttempt > windowMs) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return true;
  }
  
  // Increment attempt
  record.count++;
  record.lastAttempt = now;
  
  return record.count <= maxAttempts;
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Allow localhost and local network IPs
    const allowedOrigins = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/
    ];
    
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'application/x-sqlite3'], limit: '100mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// HEALTH CHECK & SYSTEM INFO
// ==========================================

// Health Check Endpoint (untuk monitoring/load balancer)
app.get('/health', (req, res) => {
  try {
    // Test database connection
    const dbCheck = db.prepare('SELECT 1 as status').get();
    
    // Test WAL mode
    const walCheck = db.pragma('journal_mode');
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: dbCheck?.status === 1,
        mode: walCheck?.[0]?.journal_mode || 'unknown'
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      node_version: process.version,
      platform: process.platform
    };
    
    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System Info Endpoint (admin only)
app.get('/api/system/info', authenticate, (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak.' });
  }
  
  try {
    const dbStats = {
      products: db.prepare('SELECT COUNT(*) as count FROM m_products').get().count,
      sales: db.prepare('SELECT COUNT(*) as count FROM t_sales').get().count,
      customers: db.prepare('SELECT COUNT(*) as count FROM m_customers').get().count,
      suppliers: db.prepare('SELECT COUNT(*) as count FROM m_suppliers').get().count,
      users: db.prepare('SELECT COUNT(*) as count FROM m_users').get().count
    };
    
    const serverInfo = {
      version: require('../package.json').version,
      node_version: process.version,
      platform: process.platform,
      uptime_seconds: Math.floor(process.uptime()),
      uptime_formatted: formatUptime(process.uptime()),
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      database_stats: dbStats
    };
    
    res.json({ success: true, data: serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function untuk format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// Hash Password Helper (PBKDF2) - Improved Security
function hashPassword(password, salt = null) {
  // Gunakan salt unik per user atau generate baru
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const iterations = 100000; // Naikkan dari 1000 ke 100000 (standar OWASP)
  const hash = crypto.pbkdf2Sync(password, actualSalt, iterations, 64, 'sha512').toString('hex');
  return { hash, salt: actualSalt };
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak disediakan.' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Format token tidak valid.' });

  try {
    const session = db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.username, u.name, u.role 
      FROM t_sessions s 
      JOIN m_users u ON s.user_id = u.id 
      WHERE s.token = ?
    `).get(token);

    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi tidak valid atau telah berakhir.' });
    }
    
    // Check session expiry
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      db.prepare('DELETE FROM t_sessions WHERE token = ?').run(token);
      return res.status(401).json({ success: false, message: 'Sesi telah kadaluarsa. Silakan login kembali.' });
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
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Check rate limit
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      success: false, 
      message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.' 
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  // Validasi panjang input
  if (username.length > 50 || password.length > 128) {
    return res.status(400).json({ success: false, message: 'Input tidak valid.' });
  }

  try {
    const user = db.prepare('SELECT * FROM m_users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    // Support backward compatibility untuk user lama tanpa salt
    let passwordMatch = false;
    if (user.salt) {
      // User baru dengan salt
      const { hash } = hashPassword(password, user.salt);
      passwordMatch = (hash === user.password);
    } else {
      // User lama (legacy) - masih pakai salt hardcoded
      const legacySalt = 'pos_secret_salt_123';
      const legacyHash = crypto.pbkdf2Sync(password, legacySalt, 1000, 64, 'sha512').toString('hex');
      passwordMatch = (legacyHash === user.password);
      
      // Auto-migrate: Jika login berhasil, update ke salt baru
      if (passwordMatch) {
        const newHashData = hashPassword(password);
        db.prepare('UPDATE m_users SET password = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newHashData.hash, newHashData.salt, user.id);
      }
    }

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const token = crypto.randomBytes(32).toString('hex'); // 256-bit token (lebih aman)
    
    // Session expires in 24 hours (configurable via env)
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000; // 24 hours
    const expiresAt = new Date(Date.now() + sessionTimeout).toISOString();
    
    db.prepare('INSERT INTO t_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

    // Reset rate limit on successful login
    resetRateLimit(clientIp);

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
      const hashData = hashPassword(password);
      db.prepare('UPDATE m_users SET name = ?, username = ?, password = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, username, hashData.hash, hashData.salt, userId);
    } else {
      db.prepare('UPDATE m_users SET name = ?, username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, username, userId);
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

  const { store_name, store_address, store_phone, receipt_footer, qris_static_payload, github_repo_url, quick_products_mode, quick_products_pinned_ids, wa_gateway_type, wa_gateway_token, wa_gateway_url } = req.body;
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
    if (github_repo_url !== undefined) {
      upsert.run('github_repo_url', github_repo_url.trim());
    }
    if (quick_products_mode !== undefined) {
      upsert.run('quick_products_mode', String(quick_products_mode).trim());
    }
    if (quick_products_pinned_ids !== undefined) {
      const pinnedStr = typeof quick_products_pinned_ids === 'string' ? quick_products_pinned_ids : JSON.stringify(quick_products_pinned_ids);
      upsert.run('quick_products_pinned_ids', pinnedStr);
    }
    if (wa_gateway_type !== undefined) {
      upsert.run('wa_gateway_type', String(wa_gateway_type).trim());
    }
    if (wa_gateway_token !== undefined) {
      upsert.run('wa_gateway_token', String(wa_gateway_token).trim());
    }
    if (wa_gateway_url !== undefined) {
      upsert.run('wa_gateway_url', String(wa_gateway_url).trim());
    }
  });

  try {
    updateSettingTx();
    return res.json({ success: true, message: 'Pengaturan toko berhasil diperbarui.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint Send WhatsApp Receipt (Direct wa.me or API Gateway)
app.post('/api/whatsapp/send', authenticate, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Nomor telepon dan pesan WhatsApp wajib diisi.' });
    }

    // Format nomor HP ke format internasional (628xxx)
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('8')) {
      cleanPhone = '62' + cleanPhone;
    }

    const settingsRows = db.prepare("SELECT key, value FROM m_settings WHERE key IN ('wa_gateway_type', 'wa_gateway_token', 'wa_gateway_url')").all();
    const config = {};
    settingsRows.forEach(r => config[r.key] = r.value);

    const gatewayType = config.wa_gateway_type || 'direct';
    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    // Jika menggunakan API Gateway Fonnte
    if (gatewayType === 'fonnte' && config.wa_gateway_token) {
      try {
        const https = require('https');
        const fonntePayload = { target: cleanPhone, message: message };
        if (req.body.url) fonntePayload.url = req.body.url;
        const postData = JSON.stringify(fonntePayload);
        const options = {
          hostname: 'api.fonnte.com',
          port: 443,
          path: '/send',
          method: 'POST',
          headers: {
            'Authorization': config.wa_gateway_token,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const apiPromise = new Promise((resolve, reject) => {
          const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => resolve(data));
          });
          apiReq.on('error', reject);
          apiReq.write(postData);
          apiReq.end();
        });

        await apiPromise;
        return res.json({
          success: true,
          method: 'api',
          provider: 'fonnte',
          phone: cleanPhone,
          direct_url: waLink,
          message: 'Struk berhasil dikirim via Fonnte Gateway!'
        });
      } catch (err) {
        console.error('Fonnte gateway error, fallback to direct wa.me:', err);
      }
    }

    // Default: Direct wa.me
    return res.json({
      success: true,
      method: 'direct',
      phone: cleanPhone,
      direct_url: waLink,
      message: 'Membuka WhatsApp...'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint Webhook WhatsApp (Menerima status pengiriman atau balasan dari gateway WhatsApp)
app.post('/api/whatsapp/webhook', (req, res) => {
  try {
    const payload = req.body;
    console.log('[WhatsApp Webhook Event Received]:', JSON.stringify(payload).slice(0, 200));
    return res.json({ status: true, message: 'Webhook event received successfully' });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
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
// SYSTEM VERSION & GITHUB IN-APP UPDATER
// ==========================================

// Get Local Version Info
app.get('/api/system/version', (req, res) => {
  try {
    const versionInfo = updater.getLocalVersionInfo();
    const storeSetting = db.prepare("SELECT value FROM m_settings WHERE key = 'github_repo_url'").get();
    const repo = storeSetting?.value || 'alijayanet/app-toko';
    return res.json({
      success: true,
      data: {
        version: versionInfo.version,
        changelog: versionInfo.changelog,
        github_repo: repo
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Check Update against GitHub (Admin Only / Cashier Allowed Read)
app.get('/api/system/check-update', authenticate, async (req, res) => {
  try {
    let repoUrl = req.query.repo;
    if (!repoUrl) {
      const storeSetting = db.prepare("SELECT value FROM m_settings WHERE key = 'github_repo_url'").get();
      repoUrl = storeSetting?.value || 'alijayanet/app-toko';
    }

    const branch = req.query.branch || 'main';
    const result = await updater.checkGitHubUpdate(repoUrl, branch);
    return res.json(result);
  } catch (error) {
    console.error('Error checking GitHub update:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Apply Update from GitHub (Admin Only)
app.post('/api/system/apply-update', authenticate, async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Administrator yang berwenang menerapkan pembaruan sistem.' });
  }

  try {
    let { repo, branch } = req.body || {};
    if (!repo) {
      const storeSetting = db.prepare("SELECT value FROM m_settings WHERE key = 'github_repo_url'").get();
      repo = storeSetting?.value || 'alijayanet/app-toko';
    }

    // ✅ PERLINDUNGAN: Cek versi GitHub dulu sebelum apply
    // Hanya update jika GitHub punya versi yang LEBIH BARU dari lokal
    const checkResult = await updater.checkGitHubUpdate(repo, branch || 'main');
    if (!checkResult.success) {
      return res.status(400).json({ success: false, message: checkResult.message || 'Gagal memverifikasi versi di GitHub.' });
    }
    if (!checkResult.has_update) {
      return res.status(400).json({
        success: false,
        message: `Update dibatalkan: Versi GitHub (v${checkResult.latest_version}) tidak lebih baru dari versi lokal (v${checkResult.current_version}). Upload kode terbaru ke GitHub terlebih dahulu.`
      });
    }

    const result = await updater.applyGitHubUpdate(repo, branch || 'main');

    // Jika berjalan di Electron desktop, kirim sinyal restart ke main process
    if (result.success) {
      setTimeout(() => updater.triggerRestart(), 1500);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error applying GitHub update:', error);
    return res.status(500).json({ success: false, message: error.message || 'Gagal menerapkan pembaruan sistem.' });
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
    const existing = rows.map(r => r.category);
    
    // Preset Kategori Standar UMKM Lengkap (Loyang, Bahan Kue, Sembako, dll)
    const presets = [
      'Umum',
      'Loyang & Cetakan',
      'Bahan Kue & Bakery',
      'Sembako',
      'Makanan & Kuliner',
      'Minuman & Kopi',
      'Snack & Camilan',
      'Plastik & Kemasan',
      'Bumbu & Dapur',
      'Sayur & Buah',
      'Frozen Food',
      'Rokok & Tembakau',
      'ATK & Fotokopi',
      'Fashion & Pakaian',
      'Kosmetik & Perawatan',
      'Obat & Farmasi',
      'Elektronik & Pulsa',
      'Peralatan Rumah',
      'Bangunan & Perkakas',
      'Jasa & Layanan'
    ];

    // Gabungkan kategori dari database produk dan preset tanpa duplikat
    const merged = Array.from(new Set([...existing, ...presets]));
    return res.json({ success: true, data: merged });
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
app.get('/api/products', (req, res) => {
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

// Get Top Selling Products (Produk Terlaris)
app.get('/api/products/top-selling', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 24;
    const category = req.query.category || '';

    let sql = `
      SELECT 
        p.*, 
        COALESCE(SUM(sd.qty * sd.conversion_factor), 0) as total_sold_qty,
        COALESCE(COUNT(sd.id), 0) as total_transaction_count
      FROM m_products p
      LEFT JOIN t_sales_details sd ON p.id = sd.product_id
    `;
    const params = [];

    if (category && category !== 'Semua') {
      sql += ` WHERE p.category = ? `;
      params.push(category);
    }

    sql += `
      GROUP BY p.id
      ORDER BY total_sold_qty DESC, total_transaction_count DESC, p.name ASC
      LIMIT ?
    `;
    params.push(limit);

    const products = db.prepare(sql).all(...params);
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
const server = app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(` POS Central Server berjalan di http://${HOST}:${PORT}`);
  console.log(` Dapat diakses dari HP / Client di LAN lewat IP server.`);
  console.log(`====================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Server] Port ${PORT} sudah aktif/digunakan. Server Express tetap berjalan di proses utama.`);
  } else {
    console.error('[Server Error]', err);
  }
});

// Graceful Shutdown Handler
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Menerima sinyal shutdown. Menutup server dengan aman...`);
  
  server.close(() => {
    console.log('[Server] HTTP server ditutup');
    
    // Close database connection
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      console.log('[Database] Koneksi database ditutup');
    } catch (err) {
      console.error('[Database] Error closing:', err.message);
    }
    
    console.log('[Shutdown] Aplikasi ditutup dengan aman');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Shutdown] Forced shutdown setelah 10 detik timeout');
    process.exit(1);
  }, 10000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});
