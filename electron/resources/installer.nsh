!include "LogicLib.nsh"

!macro _RemoveDirIfExists DIR_PATH
  IfFileExists "${DIR_PATH}\*.*" 0 +4
    DetailPrint "Removing ${DIR_PATH}"
    RMDir /r "${DIR_PATH}"
    ClearErrors
!macroend

!macro _RemoveFileIfExists FILE_PATH
  IfFileExists "${FILE_PATH}" 0 +3
    DetailPrint "Deleting ${FILE_PATH}"
    Delete "${FILE_PATH}"
!macroend

!macro customUnInstall
  ; User data is intentionally preserved during uninstall.
  ; This includes conda environments, settings, logs, and all other user data.
  ; Users who want to remove this data can manually delete:
  ;   - %APPDATA%\nodetool
  ;   - %LOCALAPPDATA%\nodetool
  ;   - %USERPROFILE%\.nodetool (if exists)
  DetailPrint "Uninstalling Nodetool application files (user data preserved)"
!macroend
