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
  ; Check if this is an upgrade (installer is present in temp directory)
  ; During upgrades, NSIS runs the uninstaller first, then installs the new version
  StrCpy $R9 0
  IfFileExists "$TEMP\_?=*" 0 +2
    StrCpy $R9 1  ; This is an upgrade

  ; During upgrades, preserve conda environments and user data
  ; Only perform complete cleanup during explicit uninstalls
  StrCmp $R9 1 upgradeCleanup explicitUninstall

  ; === UPGRADE PATH: Minimal cleanup only ===
  upgradeCleanup:
    DetailPrint "Upgrade detected - preserving conda environments and user data"
    ; Only remove the application installation files
    ; Conda environments, settings, logs, and micromamba cache are preserved
    Goto skipUserDataCleanup

  ; === EXPLICIT UNINSTALL: Complete cleanup ===
  explicitUninstall:
    DetailPrint "Complete uninstallation - removing all Nodetool data"
  
    ; Resolve machine-wide ProgramData path
    ExpandEnvStrings $R0 "%PROGRAMDATA%"
    StrCmp $R0 "" skipProgramData
      !insertmacro _RemoveDirIfExists "$R0\nodetool\conda_env"
      !insertmacro _RemoveDirIfExists "$R0\nodetool"
    skipProgramData:

    ; Remove Conda environments in all possible locations
    !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\conda_env"
    !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool\conda_env"

    ; Clean up user profile paths
    ExpandEnvStrings $R1 "%USERPROFILE%"
    StrCmp $R1 "" skipUserProfile
      !insertmacro _RemoveDirIfExists "$R1\.nodetool\conda_env"
      !insertmacro _RemoveDirIfExists "$R1\.local\share\nodetool\conda_env"
      !insertmacro _RemoveDirIfExists "$R1\.config\nodetool"
      !insertmacro _RemoveDirIfExists "$R1\.nodetool"
    skipUserProfile:

    ; Remove user-level configuration and caches
    !insertmacro _RemoveFileIfExists "$APPDATA\nodetool\settings.yaml"
    !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\logs"
    !insertmacro _RemoveDirIfExists "$APPDATA\nodetool\micromamba"
  
    ; Remove remaining Nodetool directories
    !insertmacro _RemoveDirIfExists "$APPDATA\nodetool"
    !insertmacro _RemoveDirIfExists "$LOCALAPPDATA\nodetool"
  
  skipUserDataCleanup:
  DetailPrint "Cleanup complete"
!macroend
