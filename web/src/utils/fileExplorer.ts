import { client } from "../stores/ApiClient";

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

export function isPathValid(path: string): boolean {
  // Reject empty strings early
  if (!path) return false;

  // Disallow path traversal sequences
  if (path.includes("..")) return false;

  // Accept typical absolute paths:
  // 1. POSIX absolute path starting with '/'
  // 2. Windows absolute path starting with a drive letter followed by ':' and either \\ or '/'
  // 3. Home‐relative path starting with '~'
  // 4. Windows environment variables like %APPDATA%, %LOCALAPPDATA%, etc.
  const windowsAbsRegex = /^[a-zA-Z]:[\\/].+/;
  const posixAbsRegex = /^\/.+/;
  const homeRegex = /^~[\\/].+/;
  const windowsEnvVarRegex = /^%[A-Z_]+%[\\/].*/;

  return (
    windowsAbsRegex.test(path) ||
    posixAbsRegex.test(path) ||
    homeRegex.test(path) ||
    windowsEnvVarRegex.test(path)
  );
}
