/**
 * Platform-aware paths for Nodetool data files.
 *
 * Single source of truth for default file locations so callers don't need to
 * re-implement OS detection or XDG logic.
 *
 * Priority: explicit env var > platform default.
 */

import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Base directory for all Nodetool user data.
 *
 * Must match Python's get_system_data_path() in nodetool-core so both
 * runtimes read/write the same database and assets.
 *
 * - Windows:  %APPDATA%\nodetool          (e.g. C:\Users\<name>\AppData\Roaming\nodetool)
 * - macOS/Linux: $XDG_DATA_HOME/nodetool  (fallback: ~/.local/share/nodetool)
 */
export function getNodetoolDataDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"),
      "nodetool"
    );
  }
  // macOS and Linux: use XDG standard to match Python side
  return join(
    process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"),
    "nodetool"
  );
}

/** Default path for the main SQLite database. Override with DB_PATH. */
export function getDefaultDbPath(): string {
  return (
    process.env["DB_PATH"] ?? join(getNodetoolDataDir(), "nodetool.sqlite3")
  );
}

/** Default path for the vector store database. Override with VECTORSTORE_DB_PATH. */
export function getDefaultVectorstoreDbPath(): string {
  return (
    process.env["VECTORSTORE_DB_PATH"] ??
    join(getNodetoolDataDir(), "vectorstore.db")
  );
}

/** Default path for local asset storage. Override with ASSET_FOLDER or STORAGE_PATH. */
export function getDefaultAssetsPath(): string {
  return (
    process.env["ASSET_FOLDER"] ??
    process.env["STORAGE_PATH"] ??
    join(getNodetoolDataDir(), "assets")
  );
}
