; NSIS Installer Script - Startup ve Registry ayarları
; Electron Builder custom install/uninstall macros

; Kurulum sonrası section (otomatik çalışır)
Section -Post
  ; Icon dosyası yolu (extraResources ile kopyalanan logo.ico)
  ; Electron Builder extraResources dosyalarını $INSTDIR\resources klasörüne kopyalar
  ; NSIS'te değişken tanımlama
  Var /GLOBAL iconPath
  StrCpy $iconPath "$INSTDIR\resources\logo.ico"
  
  ; Eğer icon dosyası yoksa, .exe dosyasının kendisini kullan
  IfFileExists "$iconPath" 0 UseExeIcon
    ; Icon dosyası var, onu kullan
    CreateShortCut "$DESKTOP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$iconPath" 0
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$iconPath" 0
    Goto IconDone
  UseExeIcon:
    ; Icon dosyası yok, .exe dosyasının kendisini kullan
    CreateShortCut "$DESKTOP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\Emek Cafe Adisyon.exe" 0
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\Emek Cafe Adisyon.exe" 0
  IconDone:
  
  ; Registry'ye startup entry ekle (daha güvenilir)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon" "$INSTDIR\Emek Cafe Adisyon.exe"
SectionEnd

; Kaldırma işlemi için custom uninstall macro
!macro customUnInstall
  ; Masaüstü kısayolunu sil
  Delete "$DESKTOP\Emek Cafe Adisyon.lnk"
  
  ; Startup klasöründen kısayolu sil
  Delete "$SMSTARTUP\Emek Cafe Adisyon.lnk"
  
  ; Registry'den startup entry'yi sil
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon"
!macroend
