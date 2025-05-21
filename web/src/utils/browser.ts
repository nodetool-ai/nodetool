export interface ElectronDetectionDetails {
  isElectron: boolean;
  isRendererProcess: boolean; // from window.process.type === 'renderer'
  hasElectronVersionInWindowProcess: boolean; // from window.process.versions.electron
  hasElectronInUserAgent: boolean; // from navigator.userAgent
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
  const isRendererProcess =
    typeof window !== "undefined" &&
    typeof window.process === "object" &&
    typeof (window.process as any).type === "string" &&
    (window.process as any).type === "renderer";

  const hasElectronVersionInWindowProcess =
    typeof window !== "undefined" &&
    typeof window.process === "object" &&
    typeof window.process.versions === "object" &&
    !!window.process.versions.electron;

  const hasElectronInUserAgent =
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Electron");

  // An environment is considered Electron if any of these specific checks are true.
  const isElectron =
    isRendererProcess ||
    hasElectronVersionInWindowProcess ||
    hasElectronInUserAgent;

  return {
    isElectron,
    isRendererProcess,
    hasElectronVersionInWindowProcess,
    hasElectronInUserAgent
  };
};
