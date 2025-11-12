# GitHub'a Yükleme Talimatları

Proje GitHub'a hazır! Şimdi manuel olarak push yapmanız gerekiyor.

## Adımlar:

### 1. GitHub Kimlik Doğrulaması

Terminal'de şu komutları çalıştırın:

```bash
cd D:\Kodlamalar\EmekCafe-Adisyon
git push -u origin main
```

Eğer kimlik doğrulama hatası alırsanız:

**Seçenek 1: Personal Access Token kullanın**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" → "repo" yetkisi verin
3. Token'ı kopyalayın
4. Push yaparken şifre yerine token'ı kullanın

**Seçenek 2: GitHub CLI kullanın**
```bash
gh auth login
git push -u origin main
```

**Seçenek 3: SSH kullanın**
```bash
git remote set-url origin git@github.com:canmuhammed012/EmekCafeAdisyon.git
git push -u origin main
```

### 2. GitHub Actions'ı Aktifleştirin

1. GitHub repository'nize gidin: https://github.com/canmuhammed012/EmekCafeAdisyon
2. Settings → Actions → General
3. "Workflow permissions" → "Read and write permissions" seçin
4. "Allow GitHub Actions to create and approve pull requests" işaretleyin
5. Save

### 3. Yeni Sürüm Yayınlama

Yeni bir sürüm yayınlamak için:

```bash
# Version'ı package.json'da güncelleyin (örn: 1.0.2)
# Sonra:
git add .
git commit -m "Version 1.0.2"
git tag v1.0.2
git push origin main
git push origin v1.0.2
```

GitHub Actions otomatik olarak:
- Build alacak
- Release oluşturacak
- Setup dosyasını yükleyecek

### 4. Otomatik Güncelleme

Kullanıcılar uygulamayı açtığında:
- Otomatik olarak GitHub'dan güncelleme kontrol edilir
- Yeni sürüm varsa indirilir
- Kullanıcıya bildirim gösterilir
- Uygulama yeniden başlatıldığında güncelleme yüklenir

## Notlar

- İlk push'tan sonra GitHub Actions çalışacak
- Release oluşturmak için tag oluşturmanız gerekir
- `package.json` içindeki `version` ile tag versiyonu eşleşmeli

