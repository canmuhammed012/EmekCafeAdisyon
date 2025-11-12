# Emek Cafe Adisyon

Restoran POS (Point of Sale) yazılımı - Electron tabanlı masaüstü uygulaması.

## Özellikler

- 🍽️ Masa yönetimi
- 📝 Sipariş alma ve takibi
- 💰 Ödeme işlemleri (Nakit/Kart)
- 📊 Günlük raporlar ve Excel export
- 👥 Çoklu kullanıcı desteği (Admin/Garson)
- 🌐 Ağ üzerinden çoklu cihaz desteği
- 🔄 Otomatik güncelleme (GitHub Releases)

## Kurulum

### Geliştirme Ortamı

```bash
npm install
npm run dev
```

### Production Build

```bash
npm run build:electron
```

Build dosyaları `release/` klasöründe oluşturulur.

## GitHub Release ve Otomatik Güncelleme

1. Projeyi GitHub'a yükleyin
2. `package.json` içindeki `publish.owner` ve `publish.repo` değerlerini güncelleyin
3. Yeni bir tag oluşturun:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. GitHub Actions otomatik olarak build alır ve release oluşturur
5. Kullanıcılar uygulamayı açtığında otomatik olarak güncelleme kontrol edilir

## Teknolojiler

- **Frontend**: React, Tailwind CSS, Vite
- **Backend**: Node.js, Express, SQLite
- **Desktop**: Electron
- **Real-time**: Socket.io
- **Auto-update**: electron-updater

## Lisans

ISC
