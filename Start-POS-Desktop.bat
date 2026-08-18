@echo off
title POS Kasir Pintar UMKM - Launcher
echo ===================================================
echo   Memulai POS Kasir Pintar UMKM (Mode Desktop)...
echo ===================================================
echo.

cd /d "%~dp0"

:: Cek apakah node_modules ada
if not exist "node_modules\" (
    echo [INFO] Mengunduh dependensi aplikasi terlebih dahulu...
    call npm install
)

:: Jalankan mode desktop
echo [INFO] Membuka jendela aplikasi POS...
call npm run desktop

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [PERINGATAN] Mode Electron desktop belum terinstall. Menjalankan via browser default...
    start http://localhost:3000
    call npm start
)
