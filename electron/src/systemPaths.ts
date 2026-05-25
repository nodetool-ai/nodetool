import * as os from "os";
import * as path from "path";

/**
 * Returns the system data path matching Python's get_system_data_path() function.
 * Kept separate from config.ts so logger can resolve log paths without importing
 * config (which imports logger and would create a circular dependency that breaks
 * when Vite code-splits the Electron main bundle).
 */
export function getSystemDataPath(filename: string): string {
  const homeDir = os.homedir();

  switch (process.platform) {
    case "darwin":
    case "linux":
      return path.join(homeDir, ".local", "share", "nodetool", filename);
    case "win32": {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        return path.join(localAppData, "nodetool", filename);
      }
      return path.join("data", filename);
    }
    default:
      return path.join("data", filename);
  }
}
