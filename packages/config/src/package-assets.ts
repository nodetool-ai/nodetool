/**
 * Guarded access to registered package runtime assets.
 *
 * Packages ship data files (provider manifests) next to their compiled code
 * and load them at runtime. The file's location differs by deployment:
 *
 * - **dev / npm install**: the file resolves through package exports, e.g.
 *   `@nodetool-ai/kie-nodes/kie-manifest.json` → `<pkg>/dist/kie-manifest.json`.
 * - **packaged Electron app**: esbuild flattens the whole backend into one
 *   `server.mjs`, so `import.meta.url`-relative paths all point at the bundle
 *   root, where `bundle-backend.mjs` stages each file by basename.
 *
 * This module is the single choke point for those loads. Every asset must be
 * declared in `package-asset-registry.ts` — an unregistered ref throws
 * immediately, in dev, with the fix in the message. Resolution outcomes are
 * recorded and queryable via `getPackageAssetResolutions()` for diagnostics.
 */

import { IS_NODE, importNodeBuiltin } from "./node-import.js";
import { createLogger } from "./logging.js";
import {
  PACKAGE_RUNTIME_ASSETS,
  findPackageAsset,
  type PackageAssetRef
} from "./package-asset-registry.js";

const log = createLogger("nodetool.config.package-assets");

const nodeModule = await importNodeBuiltin<typeof import("node:module")>(
  "node:module"
);
const nodeFs = await importNodeBuiltin<{
  existsSync: (path: string) => boolean;
}>("node:fs");
const nodeUrl = await importNodeBuiltin<{
  fileURLToPath: (url: URL | string) => string;
}>("node:url");

/** How a requested asset resolved, for startup/health diagnostics. */
export interface PackageAssetResolution {
  pkg: string;
  path: string;
  /** Absolute path the asset resolved to, or null when resolution failed. */
  resolvedPath: string | null;
  /** "package" = via package exports (dev/npm), "importer" = next to the importing module (packaged bundle). */
  via: "package" | "importer" | null;
  error?: string;
}

const resolutions = new Map<string, PackageAssetResolution>();

/** Every asset requested so far and how it resolved. */
export function getPackageAssetResolutions(): PackageAssetResolution[] {
  return [...resolutions.values()];
}

function record(resolution: PackageAssetResolution): void {
  resolutions.set(`${resolution.pkg}/${resolution.path}`, resolution);
}

function basenameOf(assetPath: string): string {
  const parts = assetPath.split("/");
  return parts[parts.length - 1]!;
}

/**
 * Resolve a registered asset to an absolute file path.
 *
 * Tries package-exports resolution first (dev / npm layout), then a file with
 * the asset's basename next to the importing module (the flattened packaged
 * layout — and the dev layout for same-package assets). Throws with both
 * attempted locations when neither exists.
 *
 * @param ref - Registered asset (pkg + dist-relative path).
 * @param importerUrl - The caller's `import.meta.url`. Required: in the
 *   packaged app it points at the bundle root where assets are staged.
 * @param registry - Overridable for tests only.
 */
export function resolvePackageAssetPath(
  ref: PackageAssetRef,
  importerUrl: string,
  registry: readonly PackageAssetRef[] = PACKAGE_RUNTIME_ASSETS
): string {
  if (!findPackageAsset(ref.pkg, ref.path, registry)) {
    throw new Error(
      `Package asset ${ref.pkg}/${ref.path} is not registered. Add it to ` +
        `PACKAGE_RUNTIME_ASSETS in @nodetool-ai/config/src/package-asset-registry.ts ` +
        `so the Electron packaging stages and verifies it.`
    );
  }
  if (!IS_NODE || !nodeModule || !nodeFs || !nodeUrl) {
    throw new Error(
      `Package asset ${ref.pkg}/${ref.path} requested on a non-Node runtime.`
    );
  }

  const req = nodeModule.createRequire(importerUrl);
  const specifier = `${ref.pkg}/${ref.path}`;

  try {
    const resolved = req.resolve(specifier);
    record({ pkg: ref.pkg, path: ref.path, resolvedPath: resolved, via: "package" });
    return resolved;
  } catch {
    // Not resolvable through package exports — try the flattened layout.
  }

  const candidate = nodeUrl.fileURLToPath(
    new URL(basenameOf(ref.path), importerUrl)
  );
  if (nodeFs.existsSync(candidate)) {
    record({ pkg: ref.pkg, path: ref.path, resolvedPath: candidate, via: "importer" });
    return candidate;
  }

  const message =
    `Package asset ${ref.pkg}/${ref.path} not found. Tried package ` +
    `resolution of "${specifier}" and "${candidate}" (relative to the ` +
    `importer). In dev, check the owning package's build copies the file ` +
    `into dist/ and its exports map the subpath. In the packaged app, check ` +
    `scripts/bundle-backend.mjs staged it (verify-backend-bundle ` +
    `should have failed the build).`;
  record({ pkg: ref.pkg, path: ref.path, resolvedPath: null, via: null, error: message });
  log.warn(message);
  throw new Error(message);
}

/**
 * Load a registered JSON asset. Loads through `require` rather than an `fs`
 * read: the values flow into provider API requests, and a module load keeps
 * static, trusted data from being modelled as untrusted file input
 * (CodeQL js/file-access-to-http) — and gets caching for free.
 */
export function loadPackageAssetJson<T>(
  ref: PackageAssetRef,
  importerUrl: string,
  registry: readonly PackageAssetRef[] = PACKAGE_RUNTIME_ASSETS
): T {
  const resolved = resolvePackageAssetPath(ref, importerUrl, registry);
  const req = nodeModule!.createRequire(importerUrl);
  return req(resolved) as T;
}
