!macro customInstall
  DetailPrint "Registering postmeter URL protocol"
  WriteRegStr HKCU "Software\Classes\postmeter" "" "URL:postmeter"
  WriteRegStr HKCU "Software\Classes\postmeter" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\postmeter\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\postmeter\shell\open\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\""
!macroend

!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\postmeter\shell\open\command" ""
  StrCmp $0 "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"" 0 +2
  DeleteRegKey HKCU "Software\Classes\postmeter"
!macroend
