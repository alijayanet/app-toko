# 📝 Changelog - Aplikasi POS

Semua perubahan penting pada project ini akan didokumentasikan di file ini.

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
dan project ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-08-18

### 🔐 Security (Penyempurnaan Keamanan)

#### Added
- **Unique Salt per User**: Setiap user kini memiliki salt unik untuk password hashing
  - Meningkatkan keamanan dari rainbow table attacks
  - Iterasi PBKDF2 ditingkatkan dari 1000 → 100,000 (standar OWASP)
  - Backward compatible dengan password lama (auto-migrate saat login)

- **Rate Limiting**: Proteksi brute-force untuk endpoint login
  - Maksimal 5 percobaan login gagal per 15 menit
  - Block otomatis berdasarkan IP address
  - Auto-reset setelah login berhasil

- **Session Token Strength**: Token diperkuat dari 128-bit → 256-bit
  - Lebih resistant terhadap brute-force attacks

- **Input Validation**: Validasi ketat untuk semua user input
  - Batasan panjang username (max 50 char) dan password (max 128 char)
  - Sanitasi input untuk mencegah injection attacks

#### Changed
- **Environment Variables**: Tambah `SESSION_SECRET` di `.env`
  - Wajib diset untuk production deployment
  - Template di `env.example.txt` sudah diupdate

- **Database Seeding**: Seed default **TIDAK** lagi include data demo
  - `npm run seed` → Database bersih (users + settings saja)
  - `npm run seed:demo` → Database dengan data demo (products, suppliers, customers)
  - Production-ready by default

#### Security Files
- ✅ `.gitignore` - Proteksi file sensitif (database, .env)
- ✅ `SECURITY.md` - Panduan lengkap keamanan aplikasi
- ✅ `env.example.txt` - Template konfigurasi dengan security notes

---

### 📊 Performance (Peningkatan Performa)

#### Added
- **Database Indexes**: Index baru untuk mempercepat query
  - `idx_product_units_name` - Lookup produk by satuan
  - `idx_sales_status` - Filter transaksi by status
  - `idx_sales_user` - Tracking transaksi per kasir
  - `idx_sales_det_product` - Analytics produk terlaris

- **Health Check Endpoint**: `/health` untuk monitoring
  - Status database connection
  - Memory usage tracking
  - Uptime information
  - Compatible dengan load balancer health checks

- **System Info API**: `/api/system/info` (Admin only)
  - Server statistics (uptime, memory, node version)
  - Database statistics (total produk, sales, customers)
  - Formatted uptime display

#### Performance Scripts
- `npm run db:vacuum` - Compress dan clean database
- `npm run db:optimize` - Optimize indexes dan query planner

---

### 🛠️ Developer Experience

#### Added
- **Migration Script**: `npm run migrate`
  - Interactive password migration tool
  - Migrasi existing users ke sistem salt baru
  - Safe rollback dengan backup otomatis

- **NPM Scripts Baru**:
  ```bash
  npm run migrate      # Migrasi database
  npm run db:vacuum    # Cleanup database
  npm run db:optimize  # Optimize indexes
  npm run health       # Quick health check
  npm run test:hash    # Test password hashing
  ```

#### Documentation
- ✅ `DEPLOYMENT.md` - Panduan lengkap deployment
  - Ubuntu Server setup dengan PM2
  - Windows Desktop (.exe) build
  - Cloudflare Tunnel setup
  - Troubleshooting guide
  
- ✅ `SECURITY.md` - Security best practices
  - Post-deployment checklist
  - Backup & recovery procedures
  - Incident response plan

- ✅ `SCRIPTS.md` - Dokumentasi lengkap NPM commands
  - Penjelasan setiap script
  - Workflow recommendations
  - Common issues & solutions

- ✅ `CHANGELOG.md` - Version history (file ini)

---

### 🔄 Database Schema Changes

#### Modified Tables

**m_users**:
- `+ salt TEXT` - Unique salt per user untuk hashing
- `+ created_at DATETIME` - Timestamp pembuatan akun
- `+ updated_at DATETIME` - Timestamp perubahan terakhir

#### Indexes Added
- `idx_product_units_name` pada `m_product_units(product_id, unit_name)`
- `idx_sales_status` pada `t_sales(payment_status)`
- `idx_sales_user` pada `t_sales(user_id)`
- `idx_sales_det_product` pada `t_sales_details(product_id)`

#### Migration Notes
⚠️ **Breaking Change**: Password lama akan otomatis di-migrate saat login pertama.  
Atau jalankan `npm run migrate` untuk migrasi manual dengan memasukkan password.

---

### 🐛 Bug Fixes
- Fix: Session token collision risk (sangat jarang, tapi sekarang impossible)
- Fix: Memory leak pada rate limiter (sekarang auto-cleanup expired entries)

---

### 📦 Dependencies
- No new dependencies added (zero-dependency security improvements)
- Updated: Better-sqlite3 remains at ^11.1.2 (stable)

---

## [1.0.0] - 2026-01-01

### Initial Release

#### Core Features
- ✅ Multi-unit product conversion (Pcs, Pak, Dus)
- ✅ Multi-tier wholesale pricing
- ✅ Dynamic QRIS payment (EMVCo standard)
- ✅ Shopping cart hold/park system
- ✅ Transaction history with void capability
- ✅ Stock management with opname
- ✅ Excel import/export
- ✅ Customer debt tracking
- ✅ Supplier debt management
- ✅ Thermal receipt printing (USB + Bluetooth)
- ✅ Barcode label generator
- ✅ Mobile camera scanner
- ✅ PWA support (installable)
- ✅ Dark mode
- ✅ Role-based access (Admin/Cashier)
- ✅ GitHub auto-updater

#### Tech Stack
- Backend: Node.js + Express.js
- Database: SQLite3 (WAL mode)
- Frontend: Vanilla JS + TailwindCSS
- Desktop: Electron (Windows .exe)
- Process Manager: PM2 (Linux/Ubuntu)

---

## Upgrade Guide

### From 1.0.0 to 1.1.0

#### Automated (Recommended)
```bash
# Via GitHub In-App Updater (Menu Admin → Pengaturan Toko)
# Klik "Cek Pembaruan" → "Terapkan Pembaruan"
# Database & .env TETAP AMAN!
```

#### Manual
```bash
# 1. Backup database
cp database.db database.db.backup

# 2. Pull update
git pull origin main
npm install

# 3. Update .env (tambahkan SESSION_SECRET)
nano .env
# Tambahkan: SESSION_SECRET=<hasil_dari_generate>

# 4. (Opsional) Migrasi password ke salt baru
npm run migrate

# 5. Restart
npm run prod:restart
```

---

## Support & Contributing

- **Bug Reports**: [GitHub Issues](https://github.com/alijayanet/app-toko/issues)
- **Security Issues**: Lihat `SECURITY.md` untuk responsible disclosure
- **Questions**: [GitHub Discussions](https://github.com/alijayanet/app-toko/discussions)

---

**Legend**:
- `Added` - Fitur baru
- `Changed` - Perubahan pada fitur existing
- `Deprecated` - Fitur yang akan dihapus
- `Removed` - Fitur yang dihapus
- `Fixed` - Bug fixes
- `Security` - Perbaikan keamanan
