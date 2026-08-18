@echo off
echo ============================================
echo   UPDATE POS KASIR PINTAR UMKM (app.asar)
echo ============================================
echo.

set ASAR_FILE=D:\POS\dist\win-unpacked\resources\app.asar
set EXTRACT_DIR=D:\POS\dist\app-extracted
set SRC_DIR=D:\POS

echo [1/4] Mengekstrak app.asar...
call npx asar extract "%ASAR_FILE%" "%EXTRACT_DIR%"
if errorlevel 1 (
  echo ERROR: Gagal mengekstrak app.asar!
  pause
  exit /b 1
)

echo [2/4] Menyalin file yang diupdate...
xcopy /y "%SRC_DIR%\public\index.html" "%EXTRACT_DIR%\public\"
xcopy /y "%SRC_DIR%\public\sw.js" "%EXTRACT_DIR%\public\"
xcopy /y "%SRC_DIR%\public\manifest.json" "%EXTRACT_DIR%\public\"
xcopy /y /s /e "%SRC_DIR%\public\css" "%EXTRACT_DIR%\public\css\"
xcopy /y /s /e "%SRC_DIR%\public\icons" "%EXTRACT_DIR%\public\icons\"
xcopy /y "%SRC_DIR%\src\server.js" "%EXTRACT_DIR%\src\"
xcopy /y "%SRC_DIR%\src\db.js" "%EXTRACT_DIR%\src\"
xcopy /y "%SRC_DIR%\src\qrisUtil.js" "%EXTRACT_DIR%\src\"

echo [3/4] Merepack kembali ke app.asar...
call npx asar pack "%EXTRACT_DIR%" "%ASAR_FILE%"
if errorlevel 1 (
  echo ERROR: Gagal merepack app.asar!
  pause
  exit /b 1
)

echo [4/4] Membersihkan folder sementara...
rmdir /s /q "%EXTRACT_DIR%"

echo.
echo ============================================
echo   UPDATE SELESAI! Silakan jalankan ulang
echo   POS Kasir Pintar UMKM.exe
echo ============================================
echo.
pause
