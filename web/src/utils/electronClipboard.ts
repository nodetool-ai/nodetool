import { devWarn } from "./DevLog";

// Define a simple Electron API interface for type-safety
interface ElectronAPI {
}

/**
 * Writes data to the clipboard.
 * Uses the Electron clipboard API if available, otherwise falls back to localStorage.
 */
export const writeClipboardData = (data: string): void => {
  if (window.api && typeof window.api.clipboardWriteText === "function") {
    window.api.clipboardWriteText(data);
  } else {
    devWarn("Electron clipboard not available; using localStorage as fallback");
    localStorage.setItem("copiedNodesData", data);
  }
};

/**
 * Reads data from the clipboard.
 * Uses the Electron clipboard API if available, otherwise falls back to localStorage.
 */
export const readClipboardData = (): string | null => {
  if (window.api && typeof window.api.clipboardReadText === "function") {
    return window.api.clipboardReadText();
  } else {
    devWarn(
      "Electron clipboard not available; reading from localStorage as fallback"
    );
    return localStorage.getItem("copiedNodesData");
  }
};
