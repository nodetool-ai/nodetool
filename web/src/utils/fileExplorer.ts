import { client } from "../stores/ApiClient";
import { useNotificationStore } from "../stores/NotificationStore";

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

  try {
    await client.POST("/api/models/open_in_explorer", {
      params: { query: { path } }
    });
  } catch (error) {
    console.error("[fileExplorer] Failed to open path in explorer:", error);
  }
}

/**
 * Fetch the HuggingFace model base path and open it in the file explorer.
 * The backend provides the path through `/api/models/huggingface_base_path`.
 */
export async function openHuggingfacePath(): Promise<void> {
  try {
    const { data, error } = await client.GET("/api/models/huggingface_base_path", {});

    if (error) {
      console.error("[fileExplorer] Failed to fetch HuggingFace base path:", error);
      useNotificationStore.getState().addNotification({
        type: "error",
        content: "Could not fetch HuggingFace folder location",
        dismissable: true
      });
      return;
    }

    const path = typeof data?.path === "string" ? data.path : null;
    if (!path) {
      console.warn("[fileExplorer] HuggingFace base path is not available");
      useNotificationStore.getState().addNotification({
        type: "warning",
        content: "HuggingFace folder location not found",
        dismissable: true
      });
      return;
    }

    await openInExplorer(path);
  } catch (error) {
    console.error("[fileExplorer] Failed to open HuggingFace path:", error);
    useNotificationStore.getState().addNotification({
      type: "error",
      content: "Could not open HuggingFace folder",
      dismissable: true
    });
  }
}

/**
 * Fetch the Ollama model base path and open it in the file explorer.
 * The backend provides the path through `/api/models/ollama_base_path`.
 */
export async function openOllamaPath(): Promise<void> {
  try {
    const { data, error } = await client.GET("/api/models/ollama_base_path", {});

    if (error) {
      console.error("[fileExplorer] Failed to fetch Ollama base path:", error);
      useNotificationStore.getState().addNotification({
        type: "error",
        content: "Could not fetch Ollama folder location",
        dismissable: true
      });
      return;
    }

    const path = typeof data?.path === "string" ? data.path : null;
    if (!path) {
      console.warn("[fileExplorer] Ollama base path is not available");
      useNotificationStore.getState().addNotification({
        type: "warning",
        content: "Ollama folder location not found",
        dismissable: true
      });
      return;
    }

    await openInExplorer(path);
  } catch (error) {
    console.error("[fileExplorer] Failed to open Ollama path:", error);
    useNotificationStore.getState().addNotification({
      type: "error",
      content: "Could not open Ollama folder",
      dismissable: true
    });
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
