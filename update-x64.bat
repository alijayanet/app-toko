@echo off
echo ============================================
echo   UPDATE POS KASIR PINTAR UMKM (x64)
echo   Menyalin file terbaru ke folder EXE...
echo ============================================
echo.

set TARGET=D:\POS\dist\POS Kasir Pintar UMKM-win32-x64\resources\app
set SRC=D:\POS

echo [1/2] Menyalin file yang diperbarui...
xcopy /y "%SRC%\public\index.html"    "%TARGET%\public\"
xcopy /y "%SRC%\public\sw.js"         "%TARGET%\public\"
xcopy /y "%SRC%\public\manifest.json" "%TARGET%\public\"
xcopy /y /s /e "%SRC%\public\css"     "%TARGET%\public\css\"
xcopy /y /s /e "%SRC%\public\icons"   "%TARGET%\public\icons\"
xcopy /y "%SRC%\src\server.js"        "%TARGET%\src\"
xcopy /y "%SRC%\src\db.js"            "%TARGET%\src\"
xcopy /y "%SRC%\src\qrisUtil.js"      "%TARGET%\src\"
xcopy /y "%SRC%\src\updater.js"       "%TARGET%\src\"
xcopy /y "%SRC%\desktop\main.js"      "%TARGET%\desktop\"
xcopy /y "%SRC%\version.txt"          "%TARGET%\"
xcopy /y "%SRC%\package.json"         "%TARGET%\"

echo.
echo [2/2] Selesai! File berhasil diperbarui.
echo Silakan restart aplikasi EXE jika sedang berjalan.
echo ============================================
pause
