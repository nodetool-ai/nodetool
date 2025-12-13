export interface ElectronDetectionDetails {
  isElectron: boolean;
  isRendererProcess: boolean; // from window.process.type === 'renderer'
  hasElectronVersionInWindowProcess: boolean; // from window.process.versions.electron
  hasElectronInUserAgent: boolean; // from navigator.userAgent
  hasElectronBridge: boolean; // from preload bridge (window.api)
}

/**
 * Checks if the current environment is Electron using multiple signals.
 * It looks for:
 *  - `window.process.type === 'renderer'`
 *  - The presence of `window.process.versions.electron`
 *  - 'Electron' in the User-Agent string.
 *
 * @returns An object containing boolean flags for each check and a combined `isElectron` flag.
 */
export const getIsElectronDetails = (): ElectronDetectionDetails => {
  const hasWindow = typeof window !== "undefined";
  
  // Primary check: the preload bridge (window.api) is the most reliable indicator
  const hasElectronBridge =
    hasWindow &&
    typeof (window as typeof window & { api?: unknown }).api !== "undefined";

  const isRendererProcess =
    hasWindow &&
    typeof window.process === "object" &&
    typeof (window.process as any).type === "string" &&
    (window.process as any).type === "renderer";

  const hasElectronVersionInWindowProcess =
    hasWindow &&
    typeof window.process === "object" &&
    typeof window.process.versions === "object" &&
    !!window.process.versions.electron;

  const hasElectronInUserAgent =
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Electron");

  // Use window.api as the primary check since it's exposed by our preload script
  const isElectron = hasElectronBridge;

  return {
    isElectron,
    isRendererProcess,
    hasElectronVersionInWindowProcess,
    hasElectronInUserAgent,
    hasElectronBridge
  };
};

export const isElectron = getIsElectronDetails().isElectron;
