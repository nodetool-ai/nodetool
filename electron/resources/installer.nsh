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
  DetailPrint "Removing Nodetool Conda environment and settings"

  ; Resolve machine-wide ProgramData path, if available
  ExpandEnvStrings $R0 "%PROGRAMDATA%"
  StrCmp $R0 "" skipCommonConda
    !insertmacro _RemoveDirIfExists "$R0\nodetool\conda_env"
  skipCommonConda:

  ; Remove Conda environments in common locations
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\conda_env"
  !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool\conda_env"

  ; Clean up paths relative to the current user profile if available
  ExpandEnvStrings $R1 "%USERPROFILE%"
  StrCmp $R1 "" skipUserPaths
    !insertmacro _RemoveDirIfExists "$R1\.nodetool\conda_env"
    !insertmacro _RemoveDirIfExists "$R1\.local\share\nodetool\conda_env"
    !insertmacro _RemoveDirIfExists "$R1\.config\nodetool"
  skipUserPaths:

  ; Clean up user-level configuration and caches
  !insertmacro _RemoveFileIfExists "$APPDATA\nodetool\settings.yaml"
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\logs"

  ; Remove remaining Nodetool directories if empty
  StrCmp $R0 "" skipCommonRoot
    !insertmacro _RemoveDirIfExists "$R0\nodetool"
  skipCommonRoot:
  !insertmacro _RemoveDirIfExists "$APPDATA\nodetool"
  !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool"
  StrCmp $R1 "" doneUserHome
    !insertmacro _RemoveDirIfExists "$R1\.nodetool"
  doneUserHome:
!macroend
