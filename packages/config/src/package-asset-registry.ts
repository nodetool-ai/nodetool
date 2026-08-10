/**
 * Runtime asset registry — the single source of truth for data files that
 * packages ship next to their compiled code and load at runtime (provider
 * manifests today).
 *
 * Three layers consume it and must agree, which is exactly why it is one
 * list instead of three conventions:
 *
 * 1. `package-assets.ts` — runtime resolution. Refuses to load a file that
 *    is not registered, so a forgotten registration fails loudly in dev
 *    instead of silently in the packaged app.
 * 2. `scripts/bundle-backend.mjs` — stages every entry next to the
 *    bundled server.mjs and fails the build when a source file is missing
 *    or an on-disk manifest is not registered.
 * 3. `scripts/verify-backend-bundle.mjs` — final artifact check
 *    that every manifest referenced by server.mjs is staged.
 *
 * `path` is relative to the owning package's `dist/`. Basenames must be
 * unique across the registry: the packaged layout is flat, every file lands
 * directly next to server.mjs.
 *
 * This module must stay free of imports — build scripts load it straight
 * from `dist/` without pulling in the rest of the config package.
 */

export interface PackageAssetRef {
  /** npm package that ships the file, e.g. "@nodetool-ai/kie-nodes". */
  pkg: string;
  /** File path relative to the package's dist/, e.g. "kie-manifest.json". */
  path: string;
}

export const PACKAGE_RUNTIME_ASSETS: readonly PackageAssetRef[] = [
  { pkg: "@nodetool-ai/atlascloud-nodes", path: "atlascloud-manifest.json" },
  { pkg: "@nodetool-ai/fal-nodes", path: "fal-manifest.json" },
  { pkg: "@nodetool-ai/kie-nodes", path: "kie-manifest.json" },
  { pkg: "@nodetool-ai/replicate-nodes", path: "replicate-manifest.json" },
  { pkg: "@nodetool-ai/runtime", path: "providers/aki-manifest.json" },
  { pkg: "@nodetool-ai/together-nodes", path: "together-manifest.json" },
  { pkg: "@nodetool-ai/topaz-nodes", path: "topaz-manifest.json" },
  { pkg: "@nodetool-ai/video-nodes", path: "render3d-page.js" }
];

/**
 * Bundled builtin packs whose sandbox modules ship inside the desktop artifact.
 *
 * Installed packs are unaffected — they resolve through the optional-node root
 * at runtime. Only a pack that ships *inside* the app needs staging, because
 * esbuild bundles the backend into one file and nothing else copies a pack's
 * `nodetool.sandboxModules` files. `bundle-backend.mjs` reads each listed
 * package's own manifest for the file list (so adding a module to a listed pack
 * needs no change here) and stages them under `_sandbox/<pack>/`;
 * `verify-backend-bundle.mjs` checks the staged tree against that manifest.
 *
 * The list is empty because no builtin ships sandbox modules yet. It is an
 * explicit registry rather than a scan so that shipping guest code inside the
 * app stays a deliberate, reviewable act.
 */
export const BUNDLED_SANDBOX_PACKS: readonly string[] = [];

/** Registry lookup by exact pkg + path. */
export function findPackageAsset(
  pkg: string,
  path: string,
  registry: readonly PackageAssetRef[] = PACKAGE_RUNTIME_ASSETS
): PackageAssetRef | undefined {
  return registry.find((a) => a.pkg === pkg && a.path === path);
}
