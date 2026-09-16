; NSIS Installer Script - Windows ile baslat ayarlari
; Masaustu ve Baslat menusu kisayollarini electron-builder kendisi olusturur
; (uygulama kimligi/AppUserModelID ve simge ile). Burada yalnizca otomatik baslatma eklenir.

!macro customInstall
  ; Windows acilisinda otomatik baslat (kisayol + kayit defteri)
  IfFileExists "$INSTDIR\resources\logo.ico" 0 UseExeIconStartup
    CreateShortCut "$SMSTARTUP\Emek Cafe Adisyon.lnk" "$INSTDIR\Emek Cafe Adisyon.exe" "" "$INSTDIR\resources\logo.ico" 0
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
