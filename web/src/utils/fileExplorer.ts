import { useNotificationStore } from "../stores/NotificationStore";

type ModelDirectory = "huggingface" | "ollama";

interface FileExplorerResult {
  status: "success" | "error";
  path?: string;
  message?: string;
}

type ExplorerBridge = {
  openModelDirectory: (
    target: ModelDirectory
  ) => Promise<FileExplorerResult | void>;
  openModelPath: (path: string) => Promise<FileExplorerResult | void>;
};

type ExplorerWindow = Window & {
  api?: ExplorerBridge;
};

const explorerUnavailableMessage =
  "Unable to open folders because the desktop bridge is not available.";

function getExplorerBridge(): ExplorerBridge | null {
  const currentWindow = resolveExplorerWindow();

  if (
    !currentWindow ||
    typeof currentWindow.api?.openModelDirectory !== "function" ||
    typeof currentWindow.api?.openModelPath !== "function"
  ) {
    return null;
  }
  return currentWindow.api as ExplorerBridge;
}

function resolveExplorerWindow(): ExplorerWindow | null {
  const candidateGetters: Array<() => ExplorerWindow | undefined> = [
    () => (typeof window !== "undefined" ? (window as ExplorerWindow) : undefined),
    () =>
      typeof global !== "undefined"
        ? (global as unknown as { window?: ExplorerWindow }).window
        : undefined,
    () =>
      typeof globalThis !== "undefined"
        ? (globalThis as unknown as { window?: ExplorerWindow }).window
        : undefined,
    () =>
      typeof globalThis !== "undefined"
        ? (globalThis as ExplorerWindow)
        : undefined
  ];

  for (const getCandidate of candidateGetters) {
    const candidate = getCandidate();
    if (candidate && candidate.api) {
      return candidate;
    }
  }

  return null;
}

function notify(
  type: "error" | "warning",
  content: string,
  dismissable = true
): void {
  useNotificationStore.getState().addNotification({
    type,
    content,
    dismissable
  });
}

function handleExplorerResult(
  result: FileExplorerResult | void,
  fallbackMessage: string
): void {
  if (!result) {
    return;
  }
  if (result.status === "error") {
    const message = result.message ?? fallbackMessage;
    notify("error", message);
  }
}

function ensureExplorerAvailable(): ExplorerBridge | null {
  const explorer = getExplorerBridge();
  if (!explorer) {
    console.warn("[fileExplorer] Desktop bridge not available.");
    notify("warning", explorerUnavailableMessage);
  }
  return explorer;
}

export function isFileExplorerAvailable(): boolean {
  return getExplorerBridge() !== null;
}

/**
 * Ask the backend to open the given path in the user's file explorer.
 * Gracefully handles missing paths and logs any failures.
 *
 * @param path Absolute or user-specific path to open.
 */
export async function openInExplorer(path: string): Promise<void> {
  if (!path) {
    console.warn("[fileExplorer] Tried to open an empty path in explorer.");
    return;
  }

  if (!isPathValid(path)) {
    console.warn(
      "[fileExplorer] Invalid path supplied, refusing to open explorer:",
      path
    );
    return;
  }

  const explorer = ensureExplorerAvailable();
  if (!explorer) {
    return;
  }

  try {
    const result = await explorer.openModelPath(path);
    handleExplorerResult(result, "Unable to open the requested path.");
  } catch (error) {
    console.error("[fileExplorer] Failed to open path in explorer:", error);
    notify("error", "Could not open folder in file explorer.");
  }
}

/**
 * Ask the Electron main process to open the HuggingFace cache directory.
 */
export async function openHuggingfacePath(): Promise<void> {
  const explorer = ensureExplorerAvailable();
  if (!explorer) {
    return;
  }

  try {
    const result = await explorer.openModelDirectory("huggingface");
    handleExplorerResult(result, "Could not open HuggingFace folder.");
  } catch (error) {
    console.error("[fileExplorer] Failed to open HuggingFace path:", error);
    notify("error", "Could not open HuggingFace folder.");
  }
}

/**
 * Ask the Electron main process to open the Ollama models directory.
 */
export async function openOllamaPath(): Promise<void> {
  const explorer = ensureExplorerAvailable();
  if (!explorer) {
    return;
  }

  try {
    const result = await explorer.openModelDirectory("ollama");
    handleExplorerResult(result, "Could not open Ollama folder.");
  } catch (error) {
    console.error("[fileExplorer] Failed to open Ollama path:", error);
    notify("error", "Could not open Ollama folder.");
  }
}

export function isPathValid(path: string): boolean {
  // Reject empty strings early
  if (!path) return false;

  // Disallow path traversal sequences
  if (path.includes("..")) return false;

  // Accept typical absolute paths:
  // 1. POSIX absolute path starting with '/'
  // 2. Windows absolute path starting with a drive letter followed by ':' and either \\ or '/'
  // 3. Home‐relative path starting with '~'
  const windowsAbsRegex = /^[a-zA-Z]:[\\/].+/;
  const posixAbsRegex = /^\/.+/;
  const homeRegex = /^~[\\/].+/;

  return (
    windowsAbsRegex.test(path) ||
    posixAbsRegex.test(path) ||
    homeRegex.test(path)
  );
}
