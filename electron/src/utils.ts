import { constants, promises as fs } from "fs";
import os from "os";
import path from "path";
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

/**
 * Directory names (relative to the user's home) that commonly hold
 * credentials or other sensitive data the renderer must never be allowed
 * to read, even if the path was supplied via a trusted-looking channel.
 */
const SENSITIVE_HOME_SUBDIRS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".config/gcloud",
  ".netrc",
  ".pgpass",
  ".npmrc",
];

/**
 * Absolute directory prefixes that are always disallowed. Reading from
 * these is never a legitimate part of a drag/paste/file-picker flow and
 * would only succeed via abuse.
 */
const SENSITIVE_ABSOLUTE_PREFIXES =
  process.platform === "win32"
    ? [
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\ProgramData\\Microsoft",
      ]
    : ["/etc", "/proc", "/sys", "/dev", "/boot", "/root", "/var/log"];

/**
 * Validates that a file path can be safely read on behalf of the renderer.
 * Throws a descriptive Error when the path is rejected.
 *
 * Checks applied:
 *   1. Type / null-byte / length (redundant with preload but defense-in-depth).
 *   2. The path must resolve to an absolute location — relative paths risk
 *      being interpreted against the main-process CWD.
 *   3. The resolved path must not sit under a sensitive system or user
 *      credential directory.
 */
function assertSafeReadablePath(filePath: unknown): string {
  if (typeof filePath !== "string") {
    throw new Error("Path must be a string");
  }
  if (filePath.length === 0) {
    throw new Error("Path must not be empty");
  }
  if (filePath.includes("\0")) {
    throw new Error("Path contains invalid characters");
  }
  if (filePath.length > 4096) {
    throw new Error("Path exceeds maximum length");
  }

  const resolved = path.resolve(filePath);

  // Must be absolute after resolution (path.resolve guarantees this, but
  // we re-check to reject e.g. empty-after-normalization edge cases).
  if (!path.isAbsolute(resolved)) {
    throw new Error("Path must be absolute");
  }

  const home = os.homedir();
  for (const sub of SENSITIVE_HOME_SUBDIRS) {
    const forbidden = path.resolve(home, sub);
    if (
      resolved === forbidden ||
      resolved.startsWith(forbidden + path.sep)
    ) {
      throw new Error("Access to this path is not permitted");
    }
  }

  for (const prefix of SENSITIVE_ABSOLUTE_PREFIXES) {
    if (
      resolved === prefix ||
      resolved.toLowerCase().startsWith(prefix.toLowerCase() + path.sep)
    ) {
      throw new Error("Access to this path is not permitted");
    }
  }

  return resolved;
}

export {
  assertSafeReadablePath,
  checkPermissions,
  fileExists,
  PermissionResult,
  getServerPort,
  getServerUrl,
  getServerWebSocketUrl,
};
