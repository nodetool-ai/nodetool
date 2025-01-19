import { constants, promises as fs } from "fs";

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

async function fileExists(filePath: string): Promise<boolean> {
  const { accessible } = await checkPermissions(filePath, constants.F_OK);
  return accessible;
}

export { checkPermissions, fileExists, PermissionResult };
