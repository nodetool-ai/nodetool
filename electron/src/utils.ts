import { constants, promises as fs } from "fs";
import { serverState } from "./state";

/**
 * Result of file/directory permission check
 * @interface PermissionResult
 * @property {boolean} accessible - True if accessible, false otherwise
 * @property {string | null} error - Error message if access fails, null otherwise
 */
interface PermissionResult {
  accessible: boolean;
  error: string | null;
}

/**
 * Check file/directory permissions and accessibility
 * @param {string} path - Path to check
 * @param {number} mode - Permission mode to check (fs.constants.R_OK, W_OK, etc)
 * @returns {Promise<PermissionResult>}
 */
async function checkPermissions(
  path: string,
  mode: number
): Promise<PermissionResult> {
  try {
    await fs.access(path, mode);
    return { accessible: true, error: null };
  } catch (error: any) {
    let errorMsg = `Cannot access ${path}: `;
    if (error.code === "ENOENT") {
      errorMsg += "File/directory does not exist";
    } else if (error.code === "EACCES") {
      errorMsg += "Permission denied";
    } else {
      errorMsg += error.message;
    }
    return { accessible: false, error: errorMsg };
  }
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if file exists, false otherwise
 */
async function fileExists(filePath: string): Promise<boolean> {
  const { accessible } = await checkPermissions(filePath, constants.F_OK);
  return accessible;
}

/**
 * Gets the server port, falling back to default port 7777
 * @returns {number} The server port
 */
function getServerPort(): number {
  return serverState.serverPort ?? 7777;
}

/**
 * Constructs an HTTP URL for the server
 * @param {string} path - The path to append to the base URL (should start with /)
 * @returns {string} The complete HTTP URL
 */
function getServerUrl(path: string = ""): string {
  const port = getServerPort();
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * Constructs a WebSocket URL for the server
 * @param {string} path - The path to append to the base URL (should start with /)
 * @returns {string} The complete WebSocket URL
 */
function getServerWebSocketUrl(path: string = ""): string {
  const port = getServerPort();
  return `ws://127.0.0.1:${port}${path}`;
}

export {
  checkPermissions,
  fileExists,
  PermissionResult,
  getServerPort,
  getServerUrl,
  getServerWebSocketUrl,
};
