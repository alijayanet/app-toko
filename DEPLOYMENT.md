# 🚀 Panduan Deployment Aplikasi POS

## 📋 Daftar Isi

1. [Prasyarat](#prasyarat)
2. [Instalasi Awal](#instalasi-awal)
3. [Konfigurasi Environment](#konfigurasi-environment)
4. [Deploy ke Ubuntu Server](#deploy-ke-ubuntu-server)
5. [Deploy ke Windows Desktop](#deploy-ke-windows-desktop)
6. [Maintenance & Monitoring](#maintenance--monitoring)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Prasyarat

### Minimum Requirements

**Hardware**:
- CPU: 2 Core (Intel Celeron / AMD Athlon atau lebih tinggi)
- RAM: 2 GB (4 GB direkomendasikan)
- Storage: 10 GB free space
- Network: Wi-Fi atau Ethernet untuk akses multi-device

**Software**:
- Node.js >= 16.0.0 (Download: https://nodejs.org)
- Git (opsional untuk clone repository)

---

## 📥 Instalasi Awal

### 1. Download/Clone Aplikasi

**Opsi A: Via Git**
```bash
git clone https://github.com/alijayanet/app-toko.git
cd app-toko
```

**Opsi B: Download ZIP**
- Download file ZIP dari GitHub
- Extract ke folder (misal: `D:\POS` atau `/home/user/app-toko`)
- Buka terminal/command prompt di folder tersebut

### 2. Install Dependencies

```bash
npm install
```

**Troubleshooting**: Jika error saat install `better-sqlite3`:
```bash
# Windows (Install build tools dulu)
npm install --global windows-build-tools

# Linux Ubuntu
sudo apt-get install build-essential python3

# Lalu coba install lagi
npm install
```

### 3. Generate SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output (misal: `a3f7c9e2b8d4f6a1c5e8b2d9f3a7c1e4...`)

---

## ⚙️ Konfigurasi Environment

### 1. Copy Template Environment

**Linux/Mac**:
```bash
cp env.example.txt .env
```

**Windows**:
```cmd
copy env.example.txt .env
```

### 2. Edit File .env

Buka file `.env` dengan text editor, ganti nilai berikut:

```env
PORT=3000
HOST=0.0.0.0

# WAJIB DIGANTI! Paste hasil generate SESSION_SECRET
SESSION_SECRET=a3f7c9e2b8d4f6a1c5e8b2d9f3a7c1e4b6d8f2a5c7e9b3d6f8a2c4e7b9d1f3a6

NODE_ENV=production
```

**Konfigurasi Port Kustom** (opsional):
```env
# Jika port 3000 sudah digunakan, ganti dengan port lain
PORT=8080
```

---

## 🐧 Deploy ke Ubuntu Server

### 1. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 2. Seeding Database Awal

```bash
npm run seed
```

Output:
```
Memulai seeding database...
Menghapus data lama berhasil.
Seeding selesai dengan sukses!
```

### 3. Jalankan Server dengan PM2

```bash
npm run prod
```

Output:
```
[PM2] Applying action startOrRestart on app [pos-central]
[PM2] [pos-central] Process successfully started
```

### 4. Verifikasi Status

```bash
pm2 status
```

Output:
```
┌─────┬──────────────┬─────────┬─────────┬──────────┐
│ id  │ name         │ status  │ cpu     │ memory   │
├─────┼──────────────┼─────────┼─────────┼──────────┤
│ 0   │ pos-central  │ online  │ 0%      │ 45.2mb   │
└─────┴──────────────┴─────────┴─────────┴──────────┘
```

### 5. Setup Auto-Start saat Boot

```bash
pm2 startup
# Copy-paste perintah yang muncul (biasanya dengan sudo)

pm2 save
```

### 6. Cek IP Address Server

```bash
ip a
# Atau
ifconfig
# Atau
hostname -I
```

Catat IP address (misal: `192.168.1.100`)

### 7. Test Akses dari Browser

Buka browser di PC/HP lain dalam jaringan yang sama:
```
http://192.168.1.100:3000
```

**Login Default**:
- Username: `admin` | Password: `admin123` (SEGERA GANTI!)
- Username: `kasir1` | Password: `kasir123`

---

## 🪟 Deploy ke Windows Desktop (.exe)

### 1. Seeding Database

```cmd
npm run seed
```

### 2. Build Executable

**Build Installer (Recommended)**:
```cmd
npm run build:win
```

File output: `dist\POS-Kasir-Pintar-Setup-1.0.0.exe`

**Build Portable (Tanpa Install)**:
```cmd
npm run build:portable
```

File output: `dist\POS Kasir Pintar UMKM.exe`

### 3. Distribusi

1. Copy file `.exe` ke komputer target
2. Copy file `database.db` dan `.env` ke folder yang sama
3. Double-click untuk menjalankan

**Struktur Folder Portable**:
```
D:\POS-Kasir\
├── POS Kasir Pintar UMKM.exe
├── database.db
└── .env
```

---

## 🔄 Maintenance & Monitoring

### Lihat Logs (PM2)

```bash
npm run prod:logs

# Atau
pm2 logs pos-central --lines 100
```

### Restart Server

```bash
npm run prod:restart
```

### Stop Server

```bash
npm run prod:stop
```

### Database Optimization

**Vacuum (Compress & Clean)**:
```bash
npm run db:vacuum
```

**Optimize Indexes**:
```bash
npm run db:optimize
```

Jalankan perintah ini **sebulan sekali** untuk performa optimal.

### Health Check

```bash
npm run health
```

Output:
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
  }
}
```

### Migrasi Database (Jika Upgrade dari Versi Lama)

```bash
npm run migrate
```

Follow instruksi interaktif di terminal.

---

## 🔐 Post-Deployment Security Checklist

### Wajib Dilakukan

- [ ] Ganti password default `admin` dan `kasir1`
- [ ] Verifikasi `SESSION_SECRET` sudah di-set di `.env`
- [ ] Test login dari HP/PC lain di jaringan lokal
- [ ] Backup database pertama kali (via menu Admin → Pengaturan Toko)
- [ ] Setup backup otomatis (cron/task scheduler)

### Konfigurasi Firewall (Ubuntu Server)

```bash
# Allow port 3000 hanya dari jaringan lokal
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Atau jika pakai firewalld
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port protocol="tcp" port="3000" accept'
sudo firewall-cmd --reload
```

### Setup Backup Otomatis (Cron)

Edit crontab:
```bash
crontab -e
```

Tambahkan line berikut (backup harian jam 2 pagi):
```cron
0 2 * * * cd /home/user/app-toko && node -e "const fs=require('fs');const path=require('path');const src='database.db';const date=new Date().toISOString().slice(0,10);const dest='backup-'+date+'.db';fs.copyFileSync(src,'backups/'+dest);" >> /tmp/pos-backup.log 2>&1
```

Buat folder backups:
```bash
mkdir -p backups
```

---

## 🌐 Akses dari Internet (Opsional)

### ⚠️ PERHATIAN
Expose server ke internet **TIDAK DIREKOMENDASIKAN** untuk keamanan!  
Gunakan hanya jika benar-benar diperlukan dan dengan proteksi ekstra.

### Opsi 1: Cloudflare Tunnel (Recommended)

**Kelebihan**:
- ✅ HTTPS gratis otomatis
- ✅ Tidak perlu port forwarding
- ✅ DDoS protection gratis
- ✅ Zero-trust security

**Setup**:
```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Login
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create pos-toko

# Route domain
cloudflared tunnel route dns pos-toko pos.domain-anda.com

# Jalankan tunnel
cloudflared tunnel run --url http://localhost:3000 pos-toko
```

Akses: `https://pos.domain-anda.com`

### Opsi 2: Nginx Reverse Proxy + Let's Encrypt

**Setup Nginx**:
```bash
sudo apt install nginx certbot python3-certbot-nginx

# Buat config
sudo nano /etc/nginx/sites-available/pos
```

Isi config:
```nginx
server {
    listen 80;
    server_name pos.domain-anda.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Aktifkan:
```bash
sudo ln -s /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL
sudo certbot --nginx -d pos.domain-anda.com
```

---

## 🐛 Troubleshooting

### Error: EADDRINUSE (Port Sudah Digunakan)

```bash
# Cek proses yang pakai port 3000
sudo lsof -i :3000
# atau
sudo netstat -tulpn | grep 3000

# Kill proses
sudo kill -9 <PID>
```

### Error: SQLite Locked

```bash
# Restart PM2
npm run prod:restart

# Atau cek file WAL
ls -la database.db*

# Cleanup WAL jika perlu (hati-hati!)
sqlite3 database.db 'PRAGMA wal_checkpoint(TRUNCATE);'
```

### Lupa Password Admin

**Opsi 1: Reset via SQL**
```bash
sqlite3 database.db

# Generate hash baru (password: newpass123)
# Hash: [gunakan npm run test:hash newpass123]

UPDATE m_users 
SET password = 'HASIL_HASH', 
    salt = 'HASIL_SALT'
WHERE username = 'admin';

.exit
```

**Opsi 2: Re-seed Database (⚠️ Data Hilang!)**
```bash
npm run seed
```

### Memory Leak / High CPU

```bash
# Monitor resources
pm2 monit

# Restart otomatis jika memory >500MB
pm2 restart pos-central --max-memory-restart 500M
```

### Database Corrupted

```bash
# Backup dulu
cp database.db database.db.backup

# Check integrity
sqlite3 database.db "PRAGMA integrity_check;"

# Jika corrupt, restore dari backup
cp backups/backup-2026-08-17.db database.db

# Restart
npm run prod:restart
```

---

## 📞 Dukungan

- **Dokumentasi**: README.md, SECURITY.md
- **Issues**: https://github.com/alijayanet/app-toko/issues
- **Email**: [Tambahkan email support]

---

## 🔄 Update Aplikasi

### Via GitHub In-App Updater (Recommended)

1. Login sebagai Admin
2. Menu "Pengaturan Toko"
3. Scroll ke "Pembaruan Sistem"
4. Klik "Cek Pembaruan"
5. Jika ada versi baru, klik "Terapkan Pembaruan"
6. **Database & .env tetap aman, tidak akan tertimpa!**

### Via Manual Git Pull

```bash
# Backup dulu!
cp database.db database.db.backup
cp .env .env.backup

# Pull update
git pull origin main

# Install dependencies baru (jika ada)
npm install

# Restart
npm run prod:restart
```

---

**Happy Deploying! 🚀**
