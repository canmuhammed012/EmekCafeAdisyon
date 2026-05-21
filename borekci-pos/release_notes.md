v2.2.2 - Admin yazdırınca garson cihazındaki yazıcıya socket ile yönlendirme; fiş metni ASCII (Türkçe karakter yok); teşekkür satırı kesilmesin diye alt boşluk
v2.2.1 - Fiş yazdırma: yazıcı hangi cihazda takılıysa (garson veya admin) o cihazdan çıktı; yoksa admin sunucusundaki yazıcıya düşer. Garson/admin ağ ve termal yazıcı (XP-90/XP9000) iyileştirmeleri.
v2.2.0 - Garson/admin ağ bağlantısı düzeltildi (birincil sunucu tespiti, istemci modu), Xprinter termal yazıcı RAW ESC/POS yazdırma (XP-90/XP9000), yazıcı otomatik eşleştirme
v1.9.19 - Otomatik release başlık/gövde düzeltildi, eski notlar kaldırıldı
v1.9.18 - Ekran koruyucu fallback ve buton sıraları düzenlendi
v2.0.3 - Cache temizliği ve ikon/screensaver iyileştirmeleri
v2.0.4 - orders.updatedAt kolonu migrasyonu, DB hata düzeltmeleri
v2.0.5 - orders.updatedAt migrasyonu güvenli hale getirildi, callback chain düzeltmeleri
v2.0.6 - Anasayfada bildirim gecikmesi düzeltildi, yazıcı eşleştirmesi iyileştirildi (XP-80/POS-80)
v2.0.7 - Global bildirim sistemi eklendi (tüm sayfalarda çalışıyor), API endpoint düzeltmeleri, yazıcı debug iyileştirmeleri
v2.0.8 - Router hatası düzeltildi (useNavigate), Windows icon sorunu düzeltildi (.ico kullanımı)
v2.0.9 - Windows exe icon embed sorunu düzeltildi (build/icon.ico kullanımı)
v2.1.0 - Otomatik IP bulma eklendi (garson cihazı admin server'ı otomatik bulur), tek instance kontrolü (2 kere açılma sorunu çözüldü), logo her yerde kullanılıyor (masaüstü, setup, görev çubuğu), timeout iyileştirmeleri (internet yavaşladığında takılma sorunu çözüldü), network optimizasyonu (internet olmadan da çalışır - sadece WiFi ağı yeterli)
v2.1.1 - Auto-updater versiyon kontrolü düzeltildi (aynı versiyon tespit edildiğinde tekrar indirme sorunu çözüldü), GitHub release temizliği (yanlış dosyalar kaldırıldı)
