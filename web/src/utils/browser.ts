export interface ElectronDetectionDetails {
  isElectron: boolean;
  hasProcessFlag: boolean;
  hasUAFlag: boolean;
}

/**
 * Checks if the current environment is Electron.
 * It looks for the presence of `window.process.versions.electron`
 * (indicating nodeIntegration is likely enabled) or 'Electron' in the User-Agent string.
 *
 * @returns An object containing:
 *  - isElectron: boolean (true if either condition is met)
 *  - hasProcessFlag: boolean (true if window.process.versions.electron is found)
 *  - hasUAFlag: boolean (true if 'Electron' is in the User-Agent)
 */
export const getIsElectronDetails = (): ElectronDetectionDetails => {
  // Check for process.versions.electron (nodeIntegration enabled or contextBridge exposure)
  const hasProcessFlag =
    typeof window !== "undefined" && !!window.process?.versions?.electron;

  // Fallback to User-Agent sniffing
  const hasUAFlag =
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("Electron");

  return { isElectron: hasProcessFlag || hasUAFlag, hasProcessFlag, hasUAFlag };
};
