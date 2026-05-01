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
import { fileURLToPath } from "node:url";

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

function stripUrlSuffix(value: string): string {
  return value.split(/[?#]/, 1)[0];
}

function normalizeWindowsDrivePath(value: string): string {
  if (process.platform === "win32" && /^\/[A-Za-z]:[\\/]/.test(value)) {
    return value.slice(1);
  }
  return value;
}

function assertNoDatabaseOverrideConflict(): void {
  if (process.env["DB_PATH"]?.trim() && process.env["DATABASE_URL"]?.trim()) {
    throw new Error(
      "DB_PATH and DATABASE_URL are both set. Use only one database configuration variable."
    );
  }
}

export function getPostgresDatabaseUrl(): string | undefined {
  assertNoDatabaseOverrideConflict();
  const raw = process.env["DATABASE_URL"]?.trim();
  if (!raw) {
    return undefined;
  }
  return /^postgres(?:ql)?:\/\//i.test(raw) ? raw : undefined;
}

/**
 * Resolve a SQLite database path from DATABASE_URL.
 *
 * Supports common SQLite forms such as:
 * - /absolute/path/nodetool.sqlite3
 * - file:./nodetool.sqlite3
 * - file:///absolute/path/nodetool.sqlite3
 * - sqlite:./nodetool.sqlite3
 * - sqlite:///absolute/path/nodetool.sqlite3
 */
function getDatabaseUrlDbPath(): string | undefined {
  const raw = process.env["DATABASE_URL"]?.trim();
  if (!raw) {
    return undefined;
  }

  if (/^file:\/\//i.test(raw)) {
    return fileURLToPath(new URL(raw));
  }

  if (/^file:/i.test(raw)) {
    return stripUrlSuffix(raw.slice("file:".length));
  }

  if (/^sqlite:/i.test(raw)) {
    const value = stripUrlSuffix(raw.slice("sqlite:".length));
    if (value.startsWith("///")) {
      return normalizeWindowsDrivePath(`/${value.slice(3)}`);
    }
    if (value.startsWith("//")) {
      return value.slice(2);
    }
    return value;
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return raw;
  }

  // Non-SQLite DATABASE_URL values are handled by callers that support other
  // dialects (for example PostgreSQL via getPostgresDatabaseUrl()). For SQLite
  // path resolution, ignore them and fall back to the default path.
  return undefined;
}

/** Default path for the main SQLite database. Override with DB_PATH or DATABASE_URL. */
export function getDefaultDbPath(): string {
  assertNoDatabaseOverrideConflict();
  return (
    process.env["DB_PATH"] ??
    getDatabaseUrlDbPath() ??
    join(getNodetoolDataDir(), "nodetool.sqlite3")
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
 * Default cache directory for the `@huggingface/transformers` (Transformers.js)
 * runtime. Override with TRANSFORMERS_JS_CACHE_DIR.
 *
 * Transformers.js uses its own flat layout (`{cacheDir}/{repo_id}/{file_path}`)
 * which is incompatible with the Python `huggingface_hub` cache, so we keep it
 * under the Nodetool data directory rather than alongside `~/.cache/huggingface`.
 */
export function getDefaultTransformersJsCacheDir(): string {
  return (
    process.env["TRANSFORMERS_JS_CACHE_DIR"] ??
    join(getNodetoolDataDir(), "transformers-js-cache")
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
 * Return the absolute filesystem path for a storage key.
 *
 * Use this on the server side whenever you need to read an asset from disk.
 * Never pass the result to a browser client — use `buildAssetUrl` for that.
 */
export function getAssetFilePath(key: string): string {
  return join(getDefaultAssetsPath(), key.replace(/^\/+/, ""));
}

/**
 * Build a **client-facing** URL for an asset identified by its storage key.
 *
 * The key is the storage-relative path (e.g. `abc.png` or `temp/uuid.png`).
 * When ASSET_DOMAIN / TEMP_DOMAIN are configured, returns an absolute CDN URL.
 * Otherwise returns `/api/storage/<key>` — a dev-mode path that the browser
 * can reach via the Vite proxy or the local HTTP server.
 *
 * Do NOT use this for server-side file reads. Use `getAssetFilePath` instead.
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
