# 🛒 Centralized POS (Point of Sale) Toko Kelontong & Grosir

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2016.0.0-emerald)](https://nodejs.org)
[![Database](https://img.shields.io/badge/database-SQLite3%20(WAL%20Mode)-blue)](https://www.sqlite.org)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-green)](CHANGELOG.md)
[![Security](https://img.shields.io/badge/security-hardened-red)](SECURITY.md)

Aplikasi POS (Kasir) terpusat, modern, dan sangat ringan yang dirancang khusus untuk menjalankan operasional toko kelontong, retail, dan grosir skala kecil hingga menengah. Sistem ini berjalan mandiri secara **Self-Hosted** di server lokal (Ubuntu Server/PC Windows di toko) dan dapat diakses secara nirkabel (Wi-Fi/LAN lokal) oleh kasir menggunakan berbagai klien seperti laptop Windows, tablet, maupun HP Android/iOS.

---

## 🆕 What's New in v1.1.0

### 🔐 **Enhanced Security**
- ✅ Unique salt per user (PBKDF2 with 100,000 iterations)
- ✅ Rate limiting for login (5 attempts per 15 minutes)
- ✅ 256-bit session tokens
- ✅ Auto-migration from legacy passwords
- ✅ Comprehensive security documentation

### 📊 **Performance Improvements**
- ✅ New database indexes for faster queries
- ✅ Health check endpoint (`/health`)
- ✅ System info API for monitoring
- ✅ Database optimization commands

### 🛠️ **Developer Tools**
- ✅ Interactive migration script
- ✅ Maintenance commands (vacuum, optimize)
- ✅ Password hash testing tool
- ✅ Complete deployment guide

📖 **Lihat [CHANGELOG.md](CHANGELOG.md) untuk detail lengkap**

---

## ✨ Fitur Unggulan

Sistem POS ini dikembangkan dengan fokus pada kemudahan operasional kasir di lapangan, performa tinggi, dan pencatatan yang komprehensif:

### 1. ⚡ POS & Kasir Pintar (Multi-Unit, Grosir, Diskon & QRIS)
*   **Multi-Unit Konversi**: Mendukung konversi satuan produk bertingkat (contoh: *Pcs*, *Pak (isi 5)*, *Dus (isi 40)*).
*   **Multi-Tier Pricing (Grosir Bertingkat)**: Otomatis menghitung harga eceran atau grosir berdasarkan jumlah minimum kuantitas unit yang dibeli.
*   **Diskon Belanja (Rp)**: Input potongan harga/diskon langsung per transaksi yang tercatat di pembukuan laba bersih dan tercetak di struk belanja.
*   **Pembayaran QRIS Dinamis (EMVCo)**: Otomatis mengonversi QRIS Statis Merchant menjadi QRIS Dinamis dengan nominal tagihan tepat sesuai total belanjaan. Pelanggan cukup scan melalui BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, ShopeePay tanpa perlu mengetik nominal secara manual!
*   **Customer Display QRIS**: Tampilan layar penuh kode QR responsif dan kontras tinggi untuk ditunjukkan ke pembeli atau dicetak.
*   **Kalkulator Uang Cepat (Quick Cash)**: Tombol instan pecahan uang tunai (`[Uang Pas]`, `10rb`, `20rb`, `50rb`, `100rb`, `200rb`) serta kalkulasi kembalian *real-time*.
*   **Tahan & Panggil Keranjang (Hold/Park Cart)**: Fitur antrean belanja untuk menunda transaksi pelanggan yang tertunda dan melayani pembeli berikutnya tanpa kehilangan item keranjang.
*   **Filter Kategori Produk**: Tab pills kategori produk (*Semua*, *Sembako*, *Minuman*, dll.) untuk navigasi item cepat.
*   **Audio Feedback Bawaan**: Efek suara sintetis Web Audio API (*beep scanner* & *success chime*) tanpa memerlukan file aset audio eksternal.
*   **Metode Transaksi Fleksibel**: Mendukung pembayaran Tunai, QRIS Dinamis, dan Tempo (bon/piutang pelanggan).
*   **Shortcut Keyboard**: Navigasi super cepat menggunakan tombol keyboard (`F1` untuk Checkout cepat, `F2` untuk Mengosongkan Keranjang).

### 2. 🧾 Riwayat Penjualan, Cetak Ulang & Pembatalan (Void)
*   **Riwayat Transaksi Komprehensif**: Filter penjualan berdasarkan rentang tanggal (`Hari Ini`, `7 Hari Terakhir`, `Bulan Ini`), kata kunci pencarian nota/pelanggan/kasir, dan status pembayaran.
*   **Cetak Ulang Struk (Reprint Receipt)**: Kemampuan mencetak ulang salinan struk thermal kapan saja untuk audit atau permintaan pelanggan.
*   **Pembatalan Transaksi (Void)**: Hak akses khusus Admin untuk membatalkan transaksi yang salah secara aman dengan **pemulihan stok barang otomatis** ke database.
*   **Ekspor Data ke CSV**: Tombol 1-klik untuk mengunduh rekapitulasi data penjualan ke format spreadsheet Excel/CSV.

### 3. 📦 Manajemen Stok & Export/Import Excel (.xlsx / .csv)
*   **Export Stok ke Excel 1-Klik**: Unduh seluruh daftar produk, barcode/SKU, kategori, modal, stok fisik, satuan, harga eceran, dan harga grosir ke file Excel (.xlsx) dengan kolom yang rapi.
*   **Import Massal dari Excel / CSV**: Unggah file Excel untuk mendaftarkan ratusan produk sekaligus dalam hitungan detik.
*   **Download Template Excel**: Tersedia template file Excel siap isi bagi toko baru yang ingin memindahkan data barang dari sistem lama.
*   **Mode Import Fleksibel**: Pilihan mode *Upsert* (tambah baru & perbarui yang sudah ada) atau *Insert Only* (hanya tambah baru).
*   **Stock Opname & Stok Masuk**: Fitur penyesuaian selisih stok fisik dan pencatatan belanja stok dari supplier.

### 4. 🔍 Pencarian & Pemindaian Responsif (HP & Desktop)
*   **Scan Barcode Kamera HP**: Integrasi pemindaian barcode langsung menggunakan kamera HP/tablet kasir tanpa memerlukan alat scanner laser eksternal.
*   **Pencarian Nama Real-Time**: Modal pencarian nama barang instan yang dilengkapi dengan dropdown pilihan satuan unit dan input kuantitas langsung.
*   **Smart Fallback Input**: Jika kasir mengetikkan nama barang di input barcode utama, sistem secara cerdas akan langsung membuka modal pencarian manual dan menampilkan hasil filternya secara otomatis.

### 4. 📒 Pembukuan Piutang Pelanggan & Hutang Toko
*   **Piutang Pelanggan (Bon Belanja)**: Pencatatan otomatis transaksi tempo pelanggan beserta riwayat cicilan pelunasan dan status nota.
*   **Hutang Toko ke Supplier**: Pencatatan belanja stok toko secara tempo ke supplier, log uang muka (DP), dan pelunasan bertahap.
*   **Rincian Transaksi Lengkap**: Tombol **Detail** pada setiap baris piutang/hutang untuk menampilkan daftar barang yang dibeli serta histori cicilan pembayaran yang lengkap dengan catatan/memo.

### 5. 🔒 Keamanan, Login Modern & Backup-Restore Database
*   **Halaman Login Glassmorphism**: Desain antarmuka login yang modern dan elegan dengan chip akun demo instan, toggle lihat sandi, serta penguncian sesi otomatis.
*   **Role CASHIER**: Terbatas hanya untuk melakukan transaksi kasir dan melihat daftar piutang pelanggan. Menu administrator otomatis disembunyikan.
*   **Role ADMIN**: Akses penuh ke dasbor laporan laba rugi, penyesuaian stok opname, input pembelian supplier, pendaftaran produk baru, audit kasir, dan konfigurasi toko.
*   **Backup Database 1-Klik**: Tombol unduh cadangan SQLite database (`.db`) langsung dari menu pengaturan untuk perlindungan data toko.
*   **Restore Database Aman**: Fitur pemulihan database dari file cadangan lama dengan validasi integritas SQLite, verifikasi akun admin, dialog konfirmasi peringatan, dan pembuatan *safety backup* otomatis sebelum data ditimpa.
*   **GitHub In-App Auto Updater (Terhubung ke GitHub)**: Cek dan perbarui source code langsung dari repositori GitHub berdasarkan berkas `version.txt`. Proses update **100% aman** karena **database (`database.db`), konfigurasi port (`.env`), dan pengaturan toko tidak akan pernah ditimpa atau hilang**.
*   **Edit Profil Mandiri**: Setiap user (kasir/admin) dapat mengganti nama lengkap, username, dan password mereka sendiri secara mandiri tanpa memerlukan bantuan basis data.

### 6. 🖨️ Cetak Struk Thermal (USB, RawBT & Bluetooth) & Label Barcode
*   **Direct RawBT Android Printing**: Cetak struk kasir kilat via protokol RawBT Android tanpa perlu dialog browser.
*   **Direct Web Bluetooth Thermal Printing (Android/HP)**: Cetak struk langsung dari smartphone/tablet kasir ke printer thermal portabel (58mm/80mm) via Bluetooth tanpa perantara aplikasi tambahan.
*   **Struk Thermal 58mm / 80mm**: Format struk kasir bersih, tajam, dan monospace dengan penyimpanan preferensi otomatis.
*   **Generator & Cetak Label Barcode Produk (CODE128)**: Fitur cetak stiker barcode produk langsung dari database untuk ditempel di rak atau kemasan barang.
*   **Kompatibel Berbagai Ukuran Label**: Mendukung printer label barcode (Xprinter, Panda, Iware, Zebra, dll.) dengan ukuran **Roll 40x30 mm**, **Roll 50x30 mm**, **Roll 33x15 mm (3 kolom)**, serta **Lembaran Kertas A4 / Stiker Tom & Jerry**.
*   **Kustomisasi Tampilan Label**: Pilihan menampilkan Nama Toko, Nama Produk, Pilihan Satuan & Harga Jual, dan Barcode Batang + SKU dengan pratinjau (*live preview*) sebelum dicetak.

---

## 📱 Fitur Khusus: QRIS Dinamis Otomatis Sesuai Nominal Belanja

Sistem POS ini dilengkapi dengan generator **QRIS Dinamis Otomatis berbasis standar EMVCo QRIS (Quick Response Code Indonesian Standard)**. Fitur ini memungkinkan toko UMKM mengubah QRIS Statis Merchant (seperti QRIS BCA, Mandiri, BRI, BNI, GoPay Usaha, OVO, ShopeePay, DANA Bisnis) menjadi QRIS Dinamis secara otomatis per transaksi:

### 💡 Keuntungan QRIS Dinamis untuk Kasir & Pelanggan:
1. **Nominal Pas Otomatis**: Pelanggan tidak perlu mengetik nominal pembayaran secara manual saat scan QRIS. Nominal langsung terisi otomatis sesuai total belanjaan (termasuk diskon).
2. **Mencegah Salah Input**: Menghilangkan risiko pembeli salah mengetik nominal (kurang bayar atau kelebihan bayar).
3. **Customer Display Pop-up**: Kasir dapat langsung menampilkan kode QR besar di layar monitor kasir atau layar HP kasir untuk di-scan oleh pembeli.
4. **Kompatibel Semua E-Wallet & M-Banking**: Dapat di-scan menggunakan seluruh aplikasi mobile banking di Indonesia (BCA, Mandiri Livin, BRImo, BNI Mobile, CIMB, Jago, Seabank) dan e-wallet (GoPay, OVO, DANA, ShopeePay, LinkAja, AstraPay).

### ⚙️ Cara Mengaktifkan QRIS Dinamis di Pengaturan Toko:
1. Login ke akun **Administrator** (`admin`).
2. Masuk ke menu **Pengaturan Toko**.
3. **Pilih salah satu metode input**:
   * **Metode 1 (Sangat Mudah - Upload Gambar)**: Klik tombol **"📸 Upload Gambar/Foto QRIS"**, lalu pilih file foto/screenshot stiker QRIS toko Anda (PNG, JPG, JPEG). Sistem akan langsung membaca kode QR dan mengisi teks payload secara otomatis!
   * **Metode 2 (Manual)**: Tempelkan (*paste*) string data teks QRIS statis merchant Anda (diawali dengan `000201010211...`) ke dalam kolom teks yang tersedia.
4. Klik **"SIMPAN PENGATURAN TOKO"**.
5. Saat transaksi kasir memilih metode bayar **QRIS**, sistem akan otomatis menyisipkan nominal belanja (Tag `54`), mengubah tipe QR menjadi dinamis (Tag `01`), menghitung ulang CRC16, dan merender QR Code dinamis secara instan!

---

## 🛠️ Tech Stack (Teknologi)

Aplikasi POS ini dibuat seminimalis mungkin agar tidak membebani server lokal namun tetap memiliki tampilan premium:

*   **Backend Framework**: Node.js dengan Express.js.
*   **Database**: SQLite3 (menggunakan `better-sqlite3` yang berjalan dalam **WAL - Write-Ahead Logging Mode** untuk konkurensi tinggi dan bebas hambatan write-locking).
*   **Autentikasi**: Autentikasi sesi berbasis token aman yang dienkripsi menggunakan PBKDF2 bawaan modul `crypto` Node.js (bebas dari isu kegagalan instalasi compiler `bcrypt` pada Ubuntu Server minimalis).
*   **Frontend**: Single Page Application (SPA) berbasis Vanilla HTML5, CSS kustom, TailwindCSS (CDN), FontAwesome, dan `html5-qrcode` untuk scanner kamera.

---

## 🚀 Panduan Instalasi & Konfigurasi

**📖 Untuk panduan deployment lengkap, lihat [DEPLOYMENT.md](DEPLOYMENT.md)**  
**🔐 Untuk panduan keamanan, lihat [SECURITY.md](SECURITY.md)**

### Ringkasan Cepat

### Prasyarat Sebelum Install
Pastikan server lokal (Ubuntu Server atau Windows PC) Anda sudah terpasang:
*   [Node.js](https://nodejs.org) (Versi 16 atau lebih baru)
*   Git

### Langkah 1: Clone Repository
```bash
git clone https://github.com/alijayanet/app-toko.git
cd app-toko
```

### Langkah 2: Install Dependensi
```bash
npm install
```

### Langkah 3: Konfigurasi Environment File
Pada server Ubuntu, buat file `.env` dengan menyalin file template `env.example.txt` menggunakan perintah berikut:
```bash
cp env.example.txt .env
```

**PENTING**: Edit file `.env` dan ganti `SESSION_SECRET` dengan nilai random yang kuat:
```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy hasilnya dan paste ke file `.env`:
```env
PORT=3000
HOST=0.0.0.0
SESSION_SECRET=<paste_hasil_generate_di_sini>
NODE_ENV=production
```

Setelah disalin, Anda dapat menyesuaikan konfigurasi port di dalam `.env` jika diperlukan (secara default diset ke `PORT=3000` dan `HOST=0.0.0.0` agar server Express dapat diakses dari IP lokal mana pun dalam jaringan Wi-Fi/LAN toko Anda).

### Langkah 4: Seeding Database Awal
Jalankan perintah berikut untuk menginisialisasi database SQLite (`pos.db`) dan membuat tabel-tabel data master beserta data awal (users, settings, dan produk dummy):
```bash
npm run seed
```

### Langkah 5: Jalankan Aplikasi

#### Pilihan A: Mode Desktop Windows (.exe)
Jika Anda menggunakan komputer/laptop Windows di toko:
1. **Cara Cepat (1-Klik):** Dobel-klik file `Start-POS-Desktop.bat` di folder aplikasi.
2. **Cara Manual via Terminal:**
   ```bash
   npm run desktop
   ```
3. **Build File Installer Windows (.exe):**
   Untuk mengompilasi menjadi file setup installer `.exe` mandiri:
   ```bash
   npm run build:win
   ```
   File installer `POS-Kasir-Pintar-Setup-1.0.0.exe` akan tersimpan di dalam folder `dist/`.

#### Pilihan B: Mode Server Linux / Ubuntu (PM2)
Sangat disarankan menggunakan **PM2 Process Manager** agar aplikasi berjalan stabil 24/7 di server dan otomatis menyala kembali jika server reboot:
1. Pastikan PM2 sudah terpasang secara global di server:
   ```bash
   sudo npm install -g pm2
   ```
2. Jalankan aplikasi menggunakan konfigurasi PM2 (`ecosystem.config.js`):
   ```bash
   npm run prod
   ```
3. Perintah manajemen PM2 lainnya:
   ```bash
   npm run prod:logs     # Melihat log live
   npm run prod:restart  # Restart server
   npm run prod:stop     # Menghentikan server
   pm2 startup           # Aktifkan auto-start saat OS boot
   pm2 save              # Simpan status proses
   ```

#### Pilihan C: Mode Standar Node.js
```bash
npm start
```

---

## 📱 Fitur Progressive Web App (PWA)
Aplikasi ini sudah mendukung **PWA Standalone**:
- **Di Google Chrome / Microsoft Edge (PC/Laptop):** Buka `http://localhost:3000`, lalu klik tombol **`Install App`** di sudut kanan atas header untuk menginstall aplikasi ke Windows Desktop/Start Menu.
- **Di HP Android (Chrome):** Buka alamat IP server di browser Chrome, buka menu titik tiga ➔ Pilih **"Tambahkan ke Layar Utama" / "Install Aplikasi"**.
- **Di iPhone / iPad (Safari):** Buka alamat IP server di Safari, tekan tombol Share ➔ Pilih **"Add to Home Screen"**.

---

## 🔑 Kredensial Default (Akses Masuk)

⚠️ **PENTING: SEGERA GANTI PASSWORD SETELAH LOGIN PERTAMA!**

Gunakan akun bawaan berikut setelah melakukan seeding database:

| Peran (Role) | Username | Password | Fitur Utama |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | ⚠️ **WAJIB DIGANTI!** Akses penuh, stok masuk, laporan laba rugi, pengaturan toko |
| **Kasir (Cashier)** | `kasir1` | `kasir123` | ⚠️ **WAJIB DIGANTI!** Transaksi kasir, cicilan piutang pelanggan |

**Cara mengganti password**:
1. Login dengan akun default
2. Klik icon Profil di header (atau menu sidebar)
3. Update password dengan kombinasi kuat (min 12 karakter, huruf besar/kecil/angka/simbol)
4. Simpan perubahan

📖 **Lihat [SECURITY.md](SECURITY.md) untuk panduan keamanan lengkap**

---

## 🌐 Cara Akses dari HP / Client di Jaringan Lokal
1.  Pastikan Server Ubuntu dan HP/klien terhubung dalam satu jaringan Wi-Fi/LAN yang sama di toko.
2.  Cari tahu alamat IP lokal server (contoh pada Ubuntu: jalankan `ip a` atau `ifconfig` untuk melihat IP, misal: `192.168.1.100`).
3.  Buka web browser di HP kasir atau PC kasir klien, lalu akses URL:
    ```
    http://192.168.1.100:3000
    ```
4.  Layar Login akan muncul, silakan masuk menggunakan kredensial kasir/admin Anda.

---

## 📷 Panduan Mengaktifkan Kamera HP Kasir (Non-HTTPS)
Browser modern pada HP (Chrome, Safari, dll.) melarang keras akses perangkat keras seperti kamera pada protokol HTTP biasa (Non-HTTPS) demi alasan keamanan, kecuali untuk alamat `localhost`. Jika kasir mengakses POS menggunakan IP lokal server (misal: `http://192.168.1.100:3000`), kamera HP tidak akan bisa terbuka secara otomatis.

Berikut adalah 2 cara mudah untuk membebaskan akses kamera tersebut:

### Cara 1: Konfigurasi Flags di Google Chrome HP Kasir (Sangat Direkomendasikan & Cepat)
1.  Buka aplikasi **Google Chrome** pada HP Android/iOS kasir Anda.
2.  Ketik alamat berikut di address bar Chrome lalu tekan Enter/Go:
    ```
    chrome://flags/#unsafely-treat-insecure-origin-as-secure
    ```
3.  Cari bagian **"Insecure origins treated as secure"**.
4.  Pada kotak input teks yang disediakan, masukkan alamat IP server POS Anda lengkap beserta port-nya (misal: `http://192.168.1.100:3000`).
5.  Ubah pilihan dropdown di sebelahnya dari **Disabled** menjadi **Enabled**.
6.  Tekan tombol **Relaunch** di bagian kanan bawah layar untuk memulai ulang Chrome.
7.  Buka kembali alamat POS tersebut. Browser kini menganggap koneksi aman dan kamera HP kasir akan langsung terbuka secara otomatis saat tombol scan ditekan.

### Cara 2: Menggunakan Layanan Tunneling HTTPS Sederhana (localtunnel)
Jika Anda ingin mengakses aplikasi kasir lewat internet secara aman (HTTPS) dengan SSL gratis bawaan untuk uji coba cepat:
1.  Jalankan localtunnel secara gratis di server (pastikan server terkoneksi internet):
    ```bash
    npx localtunnel --port 3000
    ```
2.  Gunakan tautan `https` yang diberikan (misal: `https://toko-rejeki.localtunnel.me`) untuk diakses di HP kasir. Karena menggunakan HTTPS, kamera HP akan langsung terbuka secara otomatis tanpa perlu konfigurasi tambahan.

### Cara 3: Integrasi dengan Cloudflare Tunnel + Domain Sendiri (Solusi Terbaik & Paling Aman untuk Produksi)
Jika Anda memiliki domain kustom (misal: `tokoanda.com`) dan menggunakan Cloudflare, ini adalah solusi paling profesional:
1.  **Otomatis HTTPS**: Cloudflare Tunnel (`cloudflared`) secara otomatis menyediakan sertifikat SSL/TLS (HTTPS) resmi dan gratis untuk domain Anda.
2.  **Kamera Langsung Aktif**: Karena diakses menggunakan HTTPS resmi (misal: `https://pos.tokoanda.com`), browser HP kasir akan menganggap koneksi 100% aman dan **kamera HP akan langsung terbuka secara otomatis** tanpa perlu mengatur konfigurasi flags di HP kasir.
3.  **Keamanan Ekstra**: Anda tidak perlu membuka port (*port forwarding*) di router toko Anda. Koneksi dibuat secara keluar (*outbound*) dari server lokal ke jaringan Cloudflare, sehingga server Anda terlindungi dari serangan siber luar.
4.  **Cara Setup Singkat**:
    *   Install `cloudflared` di server Ubuntu Anda.
    *   Login dan hubungkan dengan akun Cloudflare Anda: `cloudflared tunnel login`.
    *   Buat tunnel baru: `cloudflared tunnel create pos-toko`.
    *   Rute kustom domain ke localhost server: `cloudflared tunnel route dns pos-toko pos.tokoanda.com`.
    *   Jalankan tunnel untuk mengarahkan ke port aplikasi POS: `cloudflared tunnel run --url http://localhost:3000 pos-toko`.


---

## 📄 Lisensi
Proyek ini dilisensikan di bawah Lisensi MIT - Lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.
