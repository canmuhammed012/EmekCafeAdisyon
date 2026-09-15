@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ===================================================
1. ADIM: package.json Dosyasından Mevcut Versiyon Okunuyor...
echo ===================================================

if not exist package.json (
    echo [HATA] package.json dosyası bulunamadı! Lütfen bu dosyayı proje kök dizininde çalıştırın.
    pause
    exit /b
)

:: package.json içindeki "version": "x.y.z" satırını bul ve temizle
for /f "tokens=2 delims=:, " %%a in ('findstr /i "\"version\"" package.json') do (
    set "CURRENT_VERSION=%%~a"
)

echo Mevcut Versiyon: !CURRENT_VERSION!

:: Versiyonu parçala (Major.Minor.Patch)
for /f "tokens=1,2,3 delims=." %%a in ("!CURRENT_VERSION!") do (
    set /a MAJOR=%%a
    set /a MINOR=%%b
    set /a PATCH=%%c
)

:: Patch (en sondaki) numarasını 1 artır
set /a NEW_PATCH=!PATCH! + 1
set "NEW_VERSION=!MAJOR!.!MINOR!.!NEW_PATCH!"

echo Yeni Versiyon Ayarlanıyor: !NEW_VERSION!
echo.

echo ===================================================
2. ADIM: package.json Güncelleniyor...
echo ===================================================

:: PowerShell yardımıyla package.json içindeki versiyonu güvenli bir şekilde değiştiriyoruz
powershell -Command "(Get-Content package.json) -replace '\"version\":\s*\"'%CURRENT_VERSION%'\"', '\"version\": \"'%NEW_VERSION%'\"' | Set-Content package.json"

echo package.json başarıyla güncellendi!
echo.

echo ===================================================
3. ADIM: Git İşlemleri Başlatılıyor...
echo ===================================================

:: Klasörü güvenli bölgeye ekle (Olası sahiplik hatalarını önlemek için)
git config --global --add safe.directory %cd%

echo Git'e dosyalar ekleniyor...
git add .

echo Commit oluşturuluyor...
git commit -m "Version !NEW_VERSION!"

echo Tag v!NEW_VERSION! oluşturuluyor...
git tag v!NEW_VERSION!

echo Kodlar GitHub'a gönderiliyor (main)...
git push origin main

echo Etiket GitHub'a gönderiliyor (v!NEW_VERSION!)...
git push origin v!NEW_VERSION!

echo.
echo ===================================================
İŞLEM TAMAMLANDI!
echo ===================================================
echo Kodlar ve Tag başarıyla GitHub'a gönderildi.
echo GitHub Actions arka planda build almaya başlayacaktır.
echo.
pause