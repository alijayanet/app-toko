# 📜 Dokumentasi NPM Scripts

Panduan lengkap semua perintah yang tersedia di aplikasi POS ini.

---

## 🚀 Server Management

### `npm start`
Menjalankan server development (Node.js biasa)

```bash
npm start
```

**Kapan digunakan:**
- Development lokal
- Testing cepat
- Windows desktop (non-production)

**Output:**
```
====================================================
 POS Central Server berjalan di http://0.0.0.0:3000
 Dapat diakses dari HP / Client di LAN lewat IP server.
====================================================
```

---

### `npm run desktop`
Menjalankan aplikasi dalam mode Electron (Desktop App)

```bash
npm run desktop
```

**Kapan digunakan:**
- Testing Electron app sebelum build
- Development desktop features
- Debugging desktop-specific issues

---

### `npm run prod`
Menjalankan server production dengan PM2 (Ubuntu/Linux)

```bash
npm run prod
```

**Fitur:**
- ✅ Auto-restart jika crash
- ✅ Auto-start saat server reboot
- ✅ Log management
- ✅ Process monitoring

**Commands terkait:**
```bash
npm run prod:stop      # Stop server
npm run prod:restart   # Restart server
npm run prod:logs      # Lihat logs real-time
```

---

## 🗄️ Database Management

### `npm run seed`
Reset database ke kondisi awal (TANPA data demo)

```bash
npm run seed
```

**Yang dibuat:**
- ✅ 2 Users (admin, kasir1)
- ✅ Settings toko default
- ❌ **TIDAK** ada produk
- ❌ **TIDAK** ada transaksi
- ❌ **TIDAK** ada customer/supplier

**⚠️ WARNING:** Ini akan **MENGHAPUS SEMUA DATA** yang ada!

**Output:**
```
============================================================
✅ SEEDING BERHASIL!
============================================================

📌 Database telah dibersihkan dan di-reset ke kondisi awal.

🔑 Kredensial Login Default:
   - Username: admin | Password: admin123
   - Username: kasir1 | Password: kasir123
```

**Kapan digunakan:**
- Setup awal aplikasi
- Reset database production
- Membersihkan data testing

---

### `npm run seed:demo`
Reset database + isi data demo (untuk testing/demo)

```bash
npm run seed:demo
```

**Yang dibuat:**
- ✅ 2 Users (admin, kasir1)
- ✅ Settings toko demo
- ✅ 4 Produk sample dengan multi-satuan
- ✅ 2 Suppliers
- ✅ 2 Customers
- ❌ TIDAK ada transaksi (bisa dibuat manual)

**Kapan digunakan:**
- Testing aplikasi
- Demo ke client/owner
- Development features baru
- Training kasir baru

**⚠️ JANGAN gunakan di production!**

---

### `npm run migrate`
Migrasi database ke struktur/security terbaru

```bash
npm run migrate
```

**Interactive Script:**
```
==========================================================
DATABASE MIGRATION - User Password Salt Upgrade
==========================================================

Script ini akan:
1. Cek user yang masih menggunakan password lama (tanpa salt)
2. Migrasi password ke sistem salt unik per user
3. Meningkatkan iterasi PBKDF2 dari 1000 ke 100000

⚠️  PENTING: Backup database Anda sebelum melanjutkan!

Lanjutkan migrasi? (yes/no):
```

**Kapan digunakan:**
- Upgrade dari versi lama ke v1.1.0+
- Migrasi existing users ke sistem keamanan baru
- Setelah restore database lama

---

### `npm run db:vacuum`
Compress & cleanup database (defragmentasi)

```bash
npm run db:vacuum
```

**Fungsi:**
- 🧹 Menghapus space yang tidak terpakai
- 📦 Compress database file
- ⚡ Meningkatkan performa query

**Kapan digunakan:**
- Setelah delete banyak data
- Database size membengkak
- **Rutin: 1x per bulan**

**Estimasi waktu:**
- Database kecil (<100MB): ~5 detik
- Database besar (>500MB): ~30-60 detik

**⚠️ Server akan sedikit slow saat vacuum berjalan**

---

### `npm run db:optimize`
Optimize indexes & query planner

```bash
npm run db:optimize
```

**Fungsi:**
- 📊 Update statistics untuk query optimizer
- 🔍 Rebuild indexes
- ⚡ Meningkatkan kecepatan pencarian

**Kapan digunakan:**
- Setelah import data besar
- Query terasa lambat
- **Rutin: 1x per bulan**

**Estimasi waktu:** ~1-5 detik

---

## 🏗️ Build & Distribution

### `npm run build:win`
Build installer Windows (.exe)

```bash
npm run build:win
```

**Output:** `dist/POS-Kasir-Pintar-Setup-1.0.0.exe`

**Include:**
- ✅ Installer dengan wizard
- ✅ Desktop shortcut
- ✅ Start menu entry
- ✅ Uninstaller

**Estimasi waktu:** ~2-5 menit

---

### `npm run build:portable`
Build portable executable (tanpa install)

```bash
npm run build:portable
```

**Output:** `dist/POS Kasir Pintar UMKM.exe`

**Kelebihan:**
- ✅ Tidak perlu install
- ✅ Bisa di USB drive
- ✅ Portable data (database.db di folder yang sama)

**Estimasi waktu:** ~2-5 menit

---

### `npm run build:all`
Build semua format Windows

```bash
npm run build:all
```

**Output:**
- `dist/POS-Kasir-Pintar-Setup-1.0.0.exe` (installer)
- `dist/POS Kasir Pintar UMKM.exe` (portable)

**Estimasi waktu:** ~5-10 menit

---

## 🧪 Testing & Debugging

### `npm run health`
Quick health check server

```bash
npm run health
```

**Output:**
```json
{
  "status": "healthy",
  "timestamp": "2026-08-18T10:30:00.000Z",
  "uptime": 86400,
  "database": {
    "connected": true,
    "mode": "wal"
  },
  "memory": {
    "used": "45 MB",
    "total": "128 MB"
  },
  "node_version": "v16.20.0",
  "platform": "win32"
}
```

**Kapan digunakan:**
- Monitoring server status
- Debugging connection issues
- Health check dari load balancer

---

### `npm run test:login`
Test login API endpoint

```bash
npm run test:login
```

**Fungsi:**
- 🧪 Test endpoint `/api/auth/login`
- 🔐 Verifikasi password hashing
- 🎟️ Test session token generation

**Output:**
```
✅ LOGIN BERHASIL!
Token: b4ea684b54dd1c1e61a4...
User: Administrator Toko
Role: ADMIN
```

**Kapan digunakan:**
- Debugging login issues
- Test setelah migrasi database
- Verifikasi security changes

---

### `npm run test:hash [password]`
Generate password hash (testing/manual)

```bash
npm run test:hash admin123
```

**Output:**
```
Password: admin123
Salt: bb985b821d987d37b788c05e31118bd1
Hash: 74e63428f9af95abb006b7c216528f6a...
```

**Kapan digunakan:**
- Generate hash untuk insert manual ke database
- Debug password mismatch
- Understand hashing mechanism

---

## 🔄 Workflow Recommendations

### Setup Awal (Production)
```bash
npm install              # Install dependencies
npm run seed             # Init database (clean)
npm run prod             # Start dengan PM2
pm2 startup              # Auto-start on boot
pm2 save                 # Save config
```

### Setup Awal (Testing/Demo)
```bash
npm install
npm run seed:demo        # Init dengan data demo
npm start                # Start development server
```

### Maintenance Rutin (Monthly)
```bash
npm run db:vacuum        # Cleanup database
npm run db:optimize      # Optimize indexes
npm run prod:restart     # Restart server
```

### Upgrade dari Versi Lama
```bash
# 1. Backup dulu!
cp database.db database.db.backup

# 2. Pull code baru
git pull origin main
npm install

# 3. Migrasi database
npm run migrate

# 4. Restart
npm run prod:restart
```

### Troubleshooting
```bash
# Check health
npm run health

# Test login
npm run test:login

# Check logs
npm run prod:logs

# Restart jika stuck
npm run prod:restart
```

---

## 📝 Tips & Best Practices

### Database Management
- ✅ **Backup sebelum seed/migrate**
- ✅ **Vacuum & optimize sebulan sekali**
- ✅ **Gunakan seed:demo hanya untuk testing**
- ❌ **Jangan vacuum saat jam sibuk** (bisa slow)

### Production Deployment
- ✅ **Selalu gunakan PM2** (bukan `npm start`)
- ✅ **Setup auto-start** dengan `pm2 startup`
- ✅ **Monitor logs** dengan `pm2 logs`
- ✅ **Set max memory restart**: `pm2 restart pos-central --max-memory-restart 500M`

### Security
- ✅ **Ganti password default** setelah seed
- ✅ **Generate SESSION_SECRET** yang unik di `.env`
- ✅ **Jalankan migrate** setelah upgrade
- ✅ **Test login** setelah perubahan security

### Development
- ✅ **Gunakan seed:demo** untuk data testing
- ✅ **Test health endpoint** sebelum deploy
- ✅ **Run test:login** setelah auth changes
- ✅ **Build portable** untuk testing distribusi

---

## 🆘 Common Issues

### "Port 3000 already in use"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux
lsof -ti:3000 | xargs kill -9
```

### "Database is locked"
```bash
npm run prod:restart
# Atau
npm run db:vacuum
```

### "Login failed after seed"
```bash
npm run test:login  # Test backend
# Jika backend OK, clear browser cache (Ctrl+Shift+R)
```

### "Cannot find module"
```bash
npm install
# Atau clean install
rm -rf node_modules package-lock.json
npm install
```

---

**Last Updated:** v1.1.0 (2026-08-18)
