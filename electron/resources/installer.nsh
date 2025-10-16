!include "LogicLib.nsh"

Var NtTempPath

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
  DetailPrint "Removing Nodetool Conda environment and settings"

  ; Remove Conda environments in common locations
  !insertmacro _RemoveDirIfExists "$COMMON_APPDATA\nodetool\conda_env"
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\conda_env"
  !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool\conda_env"

  ; Clean up paths relative to the current user profile if available
  ExpandEnvStrings $NtTempPath "%USERPROFILE%"
  StrCmp $NtTempPath "" skipUserPaths
    !insertmacro _RemoveDirIfExists "$NtTempPath\.nodetool\conda_env"
    !insertmacro _RemoveDirIfExists "$NtTempPath\.local\share\nodetool\conda_env"
    !insertmacro _RemoveDirIfExists "$NtTempPath\.config\nodetool"
  skipUserPaths:

  ; Clean up user-level configuration and caches
  !insertmacro _RemoveFileIfExists "$APPDATA\nodetool\settings.yaml"
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\logs"

  ; Remove remaining Nodetool directories if empty
  !insertmacro _RemoveDirIfExists "$COMMON_APPDATA\nodetool"
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool"
  !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool"
  StrCmp $NtTempPath "" doneUserHome
    !insertmacro _RemoveDirIfExists "$NtTempPath\.nodetool"
  doneUserHome:
!macroend
