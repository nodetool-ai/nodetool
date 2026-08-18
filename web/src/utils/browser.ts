interface ElectronDetectionDetails {
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
    typeof window.api !== "undefined";

  const isRendererProcess =
    hasWindow &&
    typeof window.process === "object" &&
    typeof window.process.type === "string" &&
    window.process.type === "renderer";

  const hasElectronVersionInWindowProcess =
    hasWindow &&
    typeof window.process === "object" &&
    typeof window.process.versions === "object" &&
    !!window.process.versions.electron;

  const hasElectronInUserAgent =
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.includes("Electron");

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

/**
 * Whether a DOM node is a text-editing target (native inputs, rich text, Monaco).
 */
export const isEditableElement = (
  node: Element | null | undefined
): node is HTMLElement => {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (node instanceof HTMLInputElement) {
    return true;
  }
  if (node instanceof HTMLTextAreaElement) {
    return true;
  }
  if (node.isContentEditable) {
    return true;
  }
  if (node.closest(".monaco-editor") !== null) {
    return true;
  }
  if (node.classList.contains("editor-placeholder")) {
    return true;
  }
  return false;
};

/**
 * Checks if the currently focused element is a text input.
 * Useful for determining whether to use native paste or custom paste behavior.
 *
 * @returns true if the active element is a text input
 */
export const isTextInputActive = (): boolean =>
  isEditableElement(document.activeElement);


/**
 * Whether an element is a sane target to *move* focus to programmatically.
 *
 * Focus-moving handlers (type-to-focus search boxes, "press / to search") run
 * from a global key listener, so every mounted instance sees every keystroke —
 * including instances sitting in a hidden workspace tab. Those must not steal
 * focus from whatever the user is actually looking at.
 */
export const canTakeFocus = (node: Element | null | undefined): boolean => {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (!node.isConnected) {
    return false;
  }
  if (node.hidden || node.closest("[hidden]") !== null) {
    return false;
  }
  // Inactive workspace tabs stay mounted and are marked `inert`
  // (WorkspaceShell.tsx). Nothing inside one may take focus.
  if (node.closest("[inert]") !== null) {
    return false;
  }
  if (node.closest('[aria-hidden="true"]') !== null) {
    return false;
  }
  if (
    (node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLButtonElement ||
      node instanceof HTMLSelectElement) &&
    node.disabled
  ) {
    return false;
  }
  return true;
};
