# 🛒 Centralized POS (Point of Sale) Toko Kelontong & Grosir

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2016.0.0-emerald)](https://nodejs.org)
[![Database](https://img.shields.io/badge/database-SQLite3%20(WAL%20Mode)-blue)](https://www.sqlite.org)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

Aplikasi POS (Kasir) terpusat, modern, dan sangat ringan yang dirancang khusus untuk menjalankan operasional toko kelontong, retail, dan grosir skala kecil hingga menengah. Sistem ini berjalan mandiri secara **Self-Hosted** di server lokal (Ubuntu Server/PC Windows di toko) dan dapat diakses secara nirkabel (Wi-Fi/LAN lokal) oleh kasir menggunakan berbagai klien seperti laptop Windows, tablet, maupun HP Android/iOS.

---

## ✨ Fitur Unggulan

Sistem POS ini dikembangkan dengan fokus pada kemudahan operasional kasir di lapangan, performa tinggi, dan pencatatan yang komprehensif:

### 1. ⚡ POS & Kasir Pintar (Multi-Unit & Multi-Harga)
*   **Multi-Unit Konversi**: Mendukung konversi satuan produk bertingkat (contoh: *Pcs*, *Pak (isi 5)*, *Dus (isi 40)*).
*   **Multi-Tier Pricing (Grosir Bertingkat)**: Otomatis menghitung harga eceran atau grosir berdasarkan jumlah minimum kuantitas unit yang dibeli.
*   **Metode Transaksi Fleksibel**: Mendukung pembayaran tunai langsung maupun sistem tempo (bon/piutang belanja) dengan penentuan jatuh tempo.
*   **Shortcut Keyboard**: Navigasi super cepat menggunakan tombol keyboard (`F1` untuk Checkout cepat, `F2` untuk Mengosongkan Keranjang).

### 2. 🔍 Pencarian & Pemindaian Responsif (HP & Desktop)
*   **Scan Barcode Kamera HP**: Integrasi pemindaian barcode langsung menggunakan kamera HP/tablet kasir tanpa memerlukan alat scanner laser eksternal.
*   **Pencarian Nama Real-Time**: Modal pencarian nama barang instan yang dilengkapi dengan dropdown pilihan satuan unit dan input kuantitas langsung.
*   **Smart Fallback Input**: Jika kasir mengetikkan nama barang di input barcode utama, sistem secara cerdas akan langsung membuka modal pencarian manual dan menampilkan hasil filternya secara otomatis.

### 3. 📒 Pembukuan Piutang Pelanggan & Hutang Toko
*   **Piutang Pelanggan (Bon Belanja)**: Pencatatan otomatis transaksi tempo pelanggan beserta riwayat cicilan pelunasan dan status nota.
*   **Hutang Toko ke Supplier**: Pencatatan belanja stok toko secara tempo ke supplier, log uang muka (DP), dan pelunasan bertahap.
*   **Rincian Transaksi Lengkap**: Tombol **Detail** pada setiap baris piutang/hutang untuk menampilkan daftar barang yang dibeli serta histori cicilan pembayaran yang lengkap dengan catatan/memo.

### 4. 🔒 Keamanan & Hak Akses Berbasis Peran (RBAC)
*   **Role CASHIER**: Terbatas hanya untuk melakukan transaksi kasir dan melihat daftar piutang pelanggan. Menu administrator otomatis disembunyikan.
*   **Role ADMIN**: Akses penuh ke dasbor laporan laba rugi, penyesuaian stok opname, input pembelian supplier, pendaftaran produk baru, dan konfigurasi toko.
*   **Edit Profil Mandiri**: Setiap user (kasir/admin) dapat mengganti nama lengkap, username, dan password mereka sendiri secara mandiri tanpa memerlukan bantuan basis data.

### 5. 🖨️ Cetak Struk Thermal Dinamis (58mm / 80mm)
*   **Pemilih Ukuran Kertas**: Transisi cetak instan antara kertas thermal 58mm atau 80mm.
*   **Header & Footer Toko Dinamis**: Nama toko, alamat, telepon, dan catatan kaki struk diambil secara dinamis dari database pengaturan dan dapat diperbarui sewaktu-waktu oleh Admin.

---

## 🛠️ Tech Stack (Teknologi)

Aplikasi POS ini dibuat seminimalis mungkin agar tidak membebani server lokal namun tetap memiliki tampilan premium:

*   **Backend Framework**: Node.js dengan Express.js.
*   **Database**: SQLite3 (menggunakan `better-sqlite3` yang berjalan dalam **WAL - Write-Ahead Logging Mode** untuk konkurensi tinggi dan bebas hambatan write-locking).
*   **Autentikasi**: Autentikasi sesi berbasis token aman yang dienkripsi menggunakan PBKDF2 bawaan modul `crypto` Node.js (bebas dari isu kegagalan instalasi compiler `bcrypt` pada Ubuntu Server minimalis).
*   **Frontend**: Single Page Application (SPA) berbasis Vanilla HTML5, CSS kustom, TailwindCSS (CDN), FontAwesome, dan `html5-qrcode` untuk scanner kamera.

---

## 🚀 Panduan Instalasi & Konfigurasi

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
Buat file bernama `.env` di direktori root proyek dan isi dengan konfigurasi port Anda:
```env
PORT=3000
HOST=0.0.0.0
```
*(Catatan: Host `0.0.0.0` memastikan server Express dapat diakses dari IP lokal mana pun dalam jaringan Wi-Fi/LAN toko Anda).*

### Langkah 4: Seeding Database Awal
Jalankan perintah berikut untuk menginisialisasi database SQLite (`pos.db`) dan membuat tabel-tabel data master beserta data awal (users, settings, dan produk dummy):
```bash
npm run seed
```

### Langkah 5: Jalankan Aplikasi
*   **Mode Development/Pengujian**:
    ```bash
    npm start
    ```
*   **Mode Produksi (Ubuntu Server)**:
    Sangat disarankan menggunakan **PM2 Process Manager** agar aplikasi berjalan stabil di latar belakang dan otomatis menyala kembali jika server restart.
    
    Jalankan dengan PM2 menggunakan konfigurasi default (`ecosystem.config.js`):
    ```bash
    npm run prod
    ```

---

## 🔑 Kredensial Default (Akses Masuk)

Gunakan akun bawaan berikut setelah melakukan seeding database:

| Peran (Role) | Username | Password | Fitur Utama |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Akses penuh, stok masuk, laporan laba rugi, pengaturan toko |
| **Kasir (Cashier)** | `kasir1` | `kasir123` | Transaksi kasir, cicilan piutang pelanggan |

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

## 📄 Lisensi
Proyek ini dilisensikan di bawah Lisensi MIT - Lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.
