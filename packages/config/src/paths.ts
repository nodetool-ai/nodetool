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

/**
 * Public domain for permanent assets (set via ASSET_DOMAIN env var).
 *
 * When set, asset URLs are built as `https://<domain>/<key>` instead of
 * `/api/storage/<key>`. Accepts bare hostnames (`assets.nodetool.ai`) or
 * full origins (`https://assets.nodetool.ai`). Returns `undefined` when not
 * configured.
 */
export function getAssetDomain(): string | undefined {
  const value = process.env["ASSET_DOMAIN"];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Public domain for temporary assets (set via TEMP_DOMAIN env var).
 *
 * Applied to keys with the `temp/` prefix. Accepts bare hostnames or full
 * origins. Returns `undefined` when not configured, in which case temp URLs
 * fall back to `ASSET_DOMAIN` (if set) or the `/api/storage/` path.
 */
export function getTempDomain(): string | undefined {
  const value = process.env["TEMP_DOMAIN"];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Build a public URL for an asset identified by its storage key.
 *
 * The key is the storage-relative path (e.g. `abc.png` or `temp/uuid.png`).
 * When ASSET_DOMAIN / TEMP_DOMAIN are configured, returns an absolute URL
 * on the matching domain; otherwise returns the server-relative path
 * `/api/storage/<key>` so the HTTP API serves it directly.
 */
export function buildAssetUrl(key: string): string {
  const normalized = key.replace(/^\/+/, "");
  const isTemp = normalized.startsWith("temp/");
  const domain = isTemp
    ? (getTempDomain() ?? getAssetDomain())
    : getAssetDomain();

  if (!domain) {
    return `/api/storage/${normalized}`;
  }

  const origin = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const trimmedOrigin = origin.replace(/\/+$/, "");
  // When serving from a dedicated temp domain, the `temp/` prefix is
  // redundant — the domain itself identifies the bucket.
  const path =
    isTemp && getTempDomain() !== undefined
      ? normalized.slice("temp/".length)
      : normalized;
  return `${trimmedOrigin}/${path}`;
}
