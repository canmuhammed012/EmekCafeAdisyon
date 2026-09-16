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

## Güvenlik ve Kullanıcılar

- Tüm API uçları oturum token'ı ister; giriş yapılmadan hiçbir veri okunamaz/değiştirilemez.
- Yönetici işlemleri (ürün/kategori/masa düzenleme, raporlar, ayarlar, kullanıcılar) `yönetici` rolü gerektirir.
- Şifreler veritabanında hash'li (scrypt) saklanır; eski düz metin şifreler ilk açılışta otomatik dönüştürülür.
- İlk kurulumda `admin/admin` ve `garson/garson` hesapları oluşturulur. **Yönetim → Kullanıcılar** sekmesinden şifreleri hemen değiştirin.

## Telefon / Tablet (iPhone, iPad, Android) ile Kullanım

- Aynı Wi‑Fi ağındaki herhangi bir cihazda Safari/Chrome ile `http://<kasa-ip>:3000` adresini açın (IP, Yönetim → Ayarlar → Ağ bilgisi'nde yazar).
- Safari'de **Paylaş → Ana Ekrana Ekle** ile uygulama simgesi gibi açılır; App Store gerekmez.
- Masa açma, sipariş ekleme, hesap kapatma ve "Hesaba Yolla" telefonda da çalışır; fiş yazdırma yalnızca yazıcı bağlı cihazlardan yapılır.

## Windows Güvenlik Duvarı

- Kasa uygulaması ilk açılışta Windows'tan "bu uygulamanın bazı özelliklerini engelledi" uyarısı alır; **İzin ver** seçilmelidir (özel ağlar işaretli).
- İptal denmişse **Yönetim → Ayarlar → Ağ bilgisi → İzin ver** ile yönetici onayı verilerek kural eklenir; aksi hâlde garson cihazları ve telefonlar kasaya bağlanamaz.

## Günlük Görevler

- Üst çubuktaki **🎯 Günlük Görevler** ile ürün başına günlük satış kotası tanımlanır (yönetici) ve herkes tarafından takip edilir.
- Sayaç, gün içinde ödenen + açık masalardaki adetleri toplar; gece 00:00'da sıfırlanır. Hedefe ulaşıldığında ses ve kutlama bandı çıkar.
- Geçmiş günlerin görevleri ve sonuçları **Yönetim → Ayarlar → Günlük görev geçmişi** bölümünde; personel bazlı satış/hesap raporu **Yönetim → Gün Sonu** sekmesinde.

## Veritabanı ve Güncelleme

- Veritabanı kurulum paketine dahil değildir; her cihaz kendi `%APPDATA%\emek-cafe-adisyon\emekcafe.db` dosyasını kullanır ve güncellemeler bu dosyaya dokunmaz.
- Yeni sürümler eksik tablo/kolonları açılışta ekler (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`); mevcut veriler silinmez. Eski sürüme geri dönüş önerilmez (şifreler hash'li saklanır).

## Fiş Yazıcısı

- Fiş önce kasa bilgisayarındaki termal yazıcıdan çıkar; kasada yoksa istek yazıcının bağlı olduğu cihaza (garson tableti vb.) iletilir.
- Tutarı elle girilen ürünler (örn. **Tartılan Börek**) ürün formunda "Tutar elle girilir" ile işaretlenir; masa ekranında tıklanınca rakam klavyesi açılır.
- Yazıcı adı **Yönetim → Ayarlar** sekmesinden seçilir. Ad verilmezse XP-80/XP-90/Xprinter/POS-80 gibi adlar otomatik tanınır; ofis yazıcılarına fiş gönderilmez.

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
