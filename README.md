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
Pada server Ubuntu, buat file `.env` dengan menyalin file template `env.example.txt` menggunakan perintah berikut:
```bash
cp env.example.txt .env
```
Setelah disalin, Anda dapat menyesuaikan konfigurasi port di dalam `.env` jika diperlukan (secara default diset ke `PORT=3000` dan `HOST=0.0.0.0` agar server Express dapat diakses dari IP lokal mana pun dalam jaringan Wi-Fi/LAN toko Anda).

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
