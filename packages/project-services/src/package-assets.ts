/**
 * The constant assets that ship inside installed node packages.
 *
 * These are files on disk, not `assets` rows: `<root>/<package>/<file>` under
 * a configured `packageAssetsRoots` entry, or
 * `<pkg.sourceFolder>/nodetool/assets/<package>/<file>` found through Python
 * package metadata. A workflow references one as
 * `package://<package>/<file>`, and `GET /api/assets/packages/:pkg/*` streams
 * it (`routes/assets.ts`, which is the authority on how a single file is
 * resolved — the two root rules below mirror it).
 *
 * Listing them is what `list_assets` with `source: "package"` wants. The REST
 * surface never grew a real listing (`GET /api/assets/packages` is a
 * `{assets: [], next: null}` stub), so this is the only place that walks them.
 */

import { readdirSync, statSync } from "node:fs";
import { extname, join, posix, resolve } from "node:path";
import { loadPythonPackageMetadata } from "@nodetool-ai/node-sdk";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.package-assets");

/** The content types `/api/assets/packages/:pkg/*` serves, by extension. */
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".txt": "text/plain"
};

/** One shipped asset, named the way a workflow would reference it. */
export interface PackageAsset {
  package_name: string;
  /** Path within the package, `/`-separated — the `package://` sub-path. */
  name: string;
  content_type: string;
  size: number;
  /** What a workflow property stores to point at this file. */
  uri: string;
  /** Where the server streams it from. */
  url: string;
}

interface PackageAssetSource {
  packageAssetsRoots?: string[];
  metadataRoots?: string[];
  metadataMaxDepth?: number;
}

/**
 * Every `<packageName, directory>` pair that holds package assets: the
 * configured bundled roots first (no Python needed), then the per-package
 * `nodetool/assets/<name>` directories Python metadata points at. First
 * directory wins for a given package name, matching the route's lookup order.
 */
function assetDirectories(
  source: PackageAssetSource
): Map<string, string> {
  const byPackage = new Map<string, string>();

  for (const root of source.packageAssetsRoots ?? []) {
    let entries: string[];
    try {
      entries = readdirSync(resolve(root));
    } catch {
      continue; // A configured root that isn't there is not an error.
    }
    for (const entry of entries) {
      const dir = join(resolve(root), entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!byPackage.has(entry)) byPackage.set(entry, dir);
    }
  }

  // Walking the filesystem for Python metadata is the expensive half, same as
  // in the route — so it only runs to fill in packages the roots didn't cover.
  let loaded: ReturnType<typeof loadPythonPackageMetadata>;
  try {
    loaded = loadPythonPackageMetadata({
      roots: source.metadataRoots,
      maxDepth: source.metadataMaxDepth
    });
  } catch (error) {
    log.debug("package metadata unavailable while listing package assets", {
      error: error instanceof Error ? error.message : String(error)
    });
    return byPackage;
  }
  for (const pkg of loaded.packages) {
    if (!pkg.sourceFolder || byPackage.has(pkg.name)) continue;
    const dir = resolve(`${pkg.sourceFolder}/nodetool/assets/${pkg.name}`);
    try {
      if (statSync(dir).isDirectory()) byPackage.set(pkg.name, dir);
    } catch {
      // Most packages ship no assets directory at all.
    }
  }
  return byPackage;
}

/** Files under `dir`, recursively, as `/`-separated paths relative to it. */
function* filesUnder(dir: string, prefix = ""): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    const rel = prefix ? posix.join(prefix, entry) : entry;
    let isDirectory: boolean;
    try {
      isDirectory = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) yield* filesUnder(full, rel);
    else yield rel;
  }
}

/**
 * List the assets shipped inside installed packages. `limit` caps the total
 * across all packages; packages come in the order the roots enumerate them.
 */
export function listPackageAssets(
  source: PackageAssetSource,
  options: { limit?: number } = {}
): PackageAsset[] {
  const limit = options.limit ?? 100;
  const assets: PackageAsset[] = [];
  if (limit <= 0) return assets;

  for (const [packageName, dir] of assetDirectories(source)) {
    for (const name of filesUnder(dir)) {
      let size: number;
      try {
        size = statSync(join(dir, ...name.split("/"))).size;
      } catch {
        continue;
      }
      assets.push({
        package_name: packageName,
        name,
        content_type:
          CONTENT_TYPES[extname(name).toLowerCase()] ??
          "application/octet-stream",
        size,
        uri: `package://${packageName}/${name}`,
        url: `/api/assets/packages/${encodeURIComponent(packageName)}/${name
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      });
      if (assets.length >= limit) return assets;
    }
  }
  return assets;
}
