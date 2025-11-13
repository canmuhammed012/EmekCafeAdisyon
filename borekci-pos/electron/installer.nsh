; NSIS Installer Script - Startup ve Registry ayarları
; Electron Builder custom install/uninstall macros

; Kurulum sonrası custom install macro
!macro customInstall
  ; Icon dosyası yolu (extraResources ile kopyalanan logo.ico)
  ; Electron Builder extraResources dosyalarını $INSTDIR\resources klasörüne kopyalar
  Var /GLOBAL iconPath
  StrCpy $iconPath "$INSTDIR\resources\logo.ico"
  
  ; Masaüstü kısayolu oluştur (icon ile)
  ; CreateShortCut syntax: "link.lnk" "target.exe" "parameters" "icon.ico" icon_index
  ; Önce logo.ico'yu kontrol et, yoksa .exe'yi kullan
  IfFileExists "$iconPath" 0 UseExeIcon
    ; Icon dosyası var, onu kullan
    CreateShortCut "$DESKTOP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$iconPath" 0
    Goto IconDone
  UseExeIcon:
    ; Icon dosyası yok, .exe dosyasının kendisini kullan
    CreateShortCut "$DESKTOP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\Emek Cafe Adisyon.exe" 0
  IconDone:
  
  ; Startup klasörüne kısayol ekle (icon ile)
  IfFileExists "$iconPath" 0 UseExeIconStartup
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$iconPath" 0
    Goto StartupDone
  UseExeIconStartup:
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\Emek Cafe Adisyon.exe" 0
  StartupDone:
  
  ; Registry'ye startup entry ekle (daha güvenilir)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon" "$INSTDIR\Emek Cafe Adisyon.exe"
!macroend

; Kaldırma işlemi için custom uninstall macro
!macro customUnInstall
  ; Masaüstü kısayolunu sil
  Delete "$DESKTOP\Emek Cafe Adisyon.lnk"
  
  ; Startup klasöründen kısayolu sil
  Delete "$SMSTARTUP\Emek Cafe Adisyon.lnk"
  
  ; Registry'den startup entry'yi sil
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon"
!macroend
