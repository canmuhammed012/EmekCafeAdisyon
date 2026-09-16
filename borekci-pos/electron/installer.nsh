; NSIS Installer Script - Windows ile başlat ayarları
; Masaüstü ve Başlat menüsü kısayollarını electron-builder kendisi oluşturur
; (uygulama kimliği/AppUserModelID ve simge ile). Burada yalnızca otomatik başlatma eklenir.

!macro customInstall
  ; Windows açılışında otomatik başlat (kısayol + kayıt defteri)
  IfFileExists "$INSTDIResources\logo.ico" 0 UseExeIconStartup
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIResources\logo.ico" 0
    Goto StartupDone
  UseExeIconStartup:
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\Emek Cafe Adisyon.exe" 0
  StartupDone:
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon" "$INSTDIR\Emek Cafe Adisyon.exe"
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\Emek Cafe Adisyon.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Emek Cafe Adisyon"
!macroend
