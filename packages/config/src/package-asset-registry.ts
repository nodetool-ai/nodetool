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
 * Where the sandbox packs that ship with NodeTool live, in the repo and in the
 * packaged artifact. Every host reads one of these two locations, so both names
 * live here rather than in each script.
 *
 * The packs are config-only npm packages (a `nodetool.sandboxModules` manifest
 * plus a SKILL.md) that no host code may import, so they are not workspaces and
 * npm never links them into `node_modules`. Discovery therefore reads them from
 * disk: `packages/sandbox-packs/` in a checkout, and `_sandbox/` next to
 * `server.mjs` in the bundle, where `bundle-backend.mjs` stages every one of
 * them and `verify-backend-bundle.mjs` checks the staged tree against each
 * pack's own manifest. Both are directories of package directories, which is
 * what {@link listPackageDirs} in `@nodetool-ai/node-sdk` enumerates — scoped
 * names sit one level deeper, exactly as in `node_modules`.
 *
 * Staging is a scan, not a list: a pack added to the source directory ships
 * without touching this file.
 */
export const SHIPPED_SANDBOX_PACKS_SOURCE_DIR = "packages/sandbox-packs";

/** The staged copy's directory name, relative to the bundled `server.mjs`. */
export const SHIPPED_SANDBOX_PACKS_BUNDLE_DIR = "_sandbox";

/**
 * The system skills that ship with NodeTool.
 *
 * A system skill is a `SKILL.md` — frontmatter naming it, Markdown body — under
 * a directory of its own, read-only at runtime. Same two-root shape as the
 * sandbox packs above and for the same reason: nothing imports them, so npm
 * links nothing, and each host reads them from where its own build put them.
 * `NODETOOL_SYSTEM_SKILLS_DIR` overrides both.
 */
export const SHIPPED_SYSTEM_SKILLS_SOURCE_DIR = "packages/system-skills";

/** The staged copy's directory name, relative to the bundled `server.mjs`. */
export const SHIPPED_SYSTEM_SKILLS_BUNDLE_DIR = "_skills";

/** Registry lookup by exact pkg + path. */
export function findPackageAsset(
  pkg: string,
  path: string,
  registry: readonly PackageAssetRef[] = PACKAGE_RUNTIME_ASSETS
): PackageAssetRef | undefined {
  return registry.find((a) => a.pkg === pkg && a.path === path);
}
