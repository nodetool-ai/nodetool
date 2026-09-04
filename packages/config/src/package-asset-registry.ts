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
 * A directory of runtime files a package ships next to its sources rather than
 * inside `dist/`, staged into the bundle as a directory instead of flattened
 * by basename.
 *
 * Separate from {@link PACKAGE_RUNTIME_ASSETS} because the resolution rule is
 * different in both halves: the source is the package root, not its build
 * output (font binaries are inputs, and copying three megabytes through `tsc`
 * would only duplicate them), and the staged copy keeps its directory, because
 * the web serves the files by name over HTTP. The purpose is the same one C6
 * names — the bundler stages it, the verifier checks it, so an unstaged file
 * fails the build instead of the product.
 */
export interface PackageAssetDirRef {
  /** npm package that ships the directory, e.g. "@nodetool-ai/timeline". */
  pkg: string;
  /** Directory relative to the package ROOT, e.g. "fonts". */
  path: string;
  /** Directory name under the bundle root the files are staged into. */
  bundleDir: string;
  /**
   * Every file that must be present, in the source directory and in the
   * artifact. Named rather than globbed: a build that silently ships nine of
   * ten faces renders one family as a fallback, which looks like a design
   * choice rather than a packaging bug.
   */
  files: readonly string[];
}

/**
 * The bundled font corpus (D8). The file list mirrors `BUNDLED_FONT_FILES` in
 * `@nodetool-ai/timeline`; this module imports nothing, so
 * `packages/execution/tests/timeline-font-registry.test.ts` is what holds the
 * two lists together.
 */
export const PACKAGE_RUNTIME_ASSET_DIRS: readonly PackageAssetDirRef[] = [
  {
    pkg: "@nodetool-ai/timeline",
    path: "fonts",
    bundleDir: "fonts",
    files: [
      "BebasNeue-Regular.ttf",
      "Inter-Italic-Variable.ttf",
      "Inter-Variable.ttf",
      "JetBrainsMono-Italic-Variable.ttf",
      "JetBrainsMono-Variable.ttf",
      "Lora-Italic-Variable.ttf",
      "Lora-Variable.ttf",
      "OFL-BebasNeue.txt",
      "OFL-Inter.txt",
      "OFL-JetBrainsMono.txt",
      "OFL-Lora.txt",
      "OFL-PlayfairDisplay.txt",
      "OFL-SpaceGrotesk.txt",
      "PlayfairDisplay-Italic-Variable.ttf",
      "PlayfairDisplay-Variable.ttf",
      "SpaceGrotesk-Variable.ttf"
    ]
  },
  {
    // The shipped timeline compositions (D11). Built by
    // `scripts/build-example-compositions.mjs` from
    // `scripts/example-compositions/compositions.mjs`, and read straight off
    // disk by the `compositions` capability module — no database, no user — so
    // an unstaged file means `list_compositions` reports only what a user has
    // saved and the shipped half silently disappears from the packaged app.
    pkg: "@nodetool-ai/base-nodes",
    path: "nodetool/examples/compositions",
    bundleDir: "examples/compositions",
    files: [
      "callout.composition.json",
      "caption-bar.composition.json",
      "cta-end-card.composition.json",
      "logo-sting.composition.json",
      "lower-third.composition.json",
      "title-card.composition.json"
    ]
  },
  {
    // The Blender op scripts (D5). Staged whole next to the bundled server;
    // every file is named so an unstaged module fails the build instead of
    // the product.
    pkg: "@nodetool-ai/blender-nodes",
    path: "blender_ops",
    bundleDir: "_blender_ops",
    files: [
      "run_job.py",
      "framing.py",
      "errors.py",
      "depth.py",
      "exr.py",
      "ops/__init__.py",
      "ops/common.py",
      "ops/render_image.py",
      "ops/render_passes.py",
      "ops/render_animation.py",
      "tests/test_framing.py",
      "tests/test_depth.py",
      "tests/test_exr.py"
    ]
  }
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
