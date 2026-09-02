/**
 * esbuild-based hybrid bundler for the backend server artifact.
 *
 * Target-agnostic: the same bundled server.mjs runs under Electron (desktop
 * profile) and Docker (server profile) — the server never knows which; only
 * the staged native/optional packages differ per profile.
 *
 * Usage:
 *   node scripts/bundle-backend.mjs [--out <dir>] [--profile desktop|server]
 *                                   [--with-migrate]
 *
 * Defaults preserve the Electron flow: --out electron/backend-bundle,
 * --profile desktop, no migrate entry.
 *
 * Produces:
 *   <out>/server.mjs          — single bundled ESM entry point
 *   <out>/server.mjs.map      — source map
 *   <out>/_modules/           — external packages staged for the target
 *   <out>/package.json        — { "type": "module" }
 *   <out>/js-sandbox-worker/worker-entry.js
 *                             — QuickJS sandbox worker thread entry
 *   <out>/db-migrate.mjs      — bundled migration runner (--with-migrate only)
 */

import esbuild from "esbuild";
import fs from "fs";
import fsp from "fs/promises";
import Module from "module";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { verifyBackendBundle } from "./verify-backend-bundle.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const ELECTRON_DIR = path.join(ROOT_DIR, "electron");
const ENTRY_POINT = path.join(
  ROOT_DIR,
  "packages",
  "websocket",
  "dist",
  "server.js"
);
const MIGRATE_ENTRY_POINT = path.join(__dirname, "db-migrate.mjs");
const SANDBOX_WORKER_ENTRY_POINT = path.join(
  ROOT_DIR,
  "packages",
  "agents",
  "dist",
  "js-sandbox-worker",
  "worker-entry.js"
);

// --- CLI flags -------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    out: path.join(ELECTRON_DIR, "backend-bundle"),
    profile: "desktop",
    withMigrate: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--out requires a directory argument");
      }
      opts.out = path.resolve(value);
    } else if (arg === "--profile") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--profile requires a value");
      }
      opts.profile = value;
    } else if (arg === "--with-migrate") {
      opts.withMigrate = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.profile !== "desktop" && opts.profile !== "server") {
    throw new Error(
      `--profile must be "desktop" or "server", got: ${opts.profile}`
    );
  }
  return opts;
}

const OPTIONS = parseArgs(process.argv);
const BUNDLE_DIR = OPTIONS.out;
const PROFILE = OPTIONS.profile;

// ---------------------------------------------------------------------------
// External allowlist — packages that stay out of the bundle
// ---------------------------------------------------------------------------

// Packages that MUST be found and copied — build fails if any are missing.
// webgpu (Dawn) is on this list for every profile: the server renders
// timelines through the same GPU compositor the editor previews with, on
// lavapipe in the container (D9, docs/plans/motion-graphics.md).
const REQUIRED_EXTERNAL_PACKAGES = [
  "sharp",
  "better-sqlite3",
  "@jitl/quickjs-ng-wasmfile-release-sync",
  "mediabunny",
  "@mediabunny/server",
  "node-av",
  "webgpu",
];

// Staged into _modules/ on every profile.
const COMMON_EXTERNAL_PACKAGES = [
  // Native modules (contain .node binaries)
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  // Dawn. The GPU compositor behind nodetool.image.* and RenderTimeline needs
  // it on the server as well as on desktop; the Docker image installs lavapipe
  // so the container has a Vulkan ICD for it to reach.
  "webgpu",
  // @img/sharp-* is deliberately NOT seeded here. Other packages in the tree
  // depend on older sharp majors, so npm hoists their @img/sharp-<platform>
  // prebuilds to the root node_modules while sharp's own (matching) copies sit
  // nested under sharp/node_modules. Seeding the wildcard staged the hoisted
  // ones first, and the flat _modules layout then skipped sharp's own as
  // "already copied" — shipping a native binary from a different sharp major.
  // Letting sharp's optionalDependencies drive staging resolves them from
  // sharp's own directory, so JS and binary always match.
  // node-web-audio-api is a prod dependency of @nodetool-ai/audio-nodes,
  // which is in the websocket closure via base-nodes — every profile needs it.
  "node-web-audio-api",
  // onnxruntime-node is intentionally NOT staged: @huggingface/transformers is
  // a devDependency only, so no runtime import path exists in the packaged
  // backend. On desktop those nodes install via the Package Manager.

  // Native optional deps (loaded by bundleable packages)
  "msgpackr",
  "msgpackr-extract",
  "@msgpackr-extract/*",
  "bufferutil",
  "utf-8-validate",

  // Large optional packages (dynamic await import())
  "pdfjs-dist",
  "@napi-rs/canvas",
  "chart.js",
  // The sandbox uses Mediabunny in browsers and on Node. Keep both packages
  // external in the backend so the server adapter registers codecs on the
  // same Mediabunny module instance used by the sandbox media bridge.
  "mediabunny",
  "@mediabunny/server",
  "node-av",
  // Modules that source code lazy-imports but whose own top-level imports
  // would be hoisted into server.mjs if inlined, defeating the lazy intent.
  // pdf-parse hoisted `pdfjs-dist/legacy/build/pdf.mjs` and crashed on
  // `new DOMMatrix()` at backend startup. Same trap waits for any package
  // that side-effects at module init.
  "office-text-extractor",
  "pdf-parse",
  "@llamaindex/liteparse",
  "@hyzyla/pdfium",
  "tesseract.js",
  // Emscripten package with a package-relative .wasm asset. Keeping it external
  // preserves import.meta.url so emscripten-module.wasm resolves next to the
  // package's own JS instead of next to backend/server.mjs.
  "@jitl/quickjs-ng-wasmfile-release-sync",

  // Cloud/optional services (dynamic import via variable + webpackIgnore)
  "@supabase/supabase-js",

  // HuggingFaceProvider loads this through Function("return import(...)"), which
  // esbuild cannot see, so nothing stages it implicitly.
  "@huggingface/inference",

  // Telemetry (conditionally loaded)
  "@opentelemetry/sdk-node",
  "@opentelemetry/resources",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/exporter-trace-otlp-proto",
  "@opentelemetry/semantic-conventions",

  // MCP SDK (deep-path imports like /server/mcp.js)
  "@modelcontextprotocol/sdk",

  // CJS require() packages
  "openai",
  "ssh2",
  "cpu-features",
];

// Staged into _modules/ on the desktop profile only. All of these stay esbuild
// externals on every profile (bundling their .node binaries or hoisting their
// module-init side effects would break server.mjs); the server profile just
// doesn't ship them, matching today's Docker image.
const DESKTOP_ONLY_EXTERNAL_PACKAGES = [
  // Server: both call sites (packages/security/src/master-key.ts,
  // packages/runtime/src/providers/oauth/secure-credential-store.ts) are lazy
  // try/catch imports, and headless deployments run without a keychain.
  "keytar",
  // Server: dev-only in the workspace (reached via @playwright/test); the
  // Docker image ships no browser automation runtime.
  "playwright",
  "playwright-core",
];

const EXTERNAL_PACKAGES =
  PROFILE === "desktop"
    ? [...COMMON_EXTERNAL_PACKAGES, ...DESKTOP_ONLY_EXTERNAL_PACKAGES]
    : COMMON_EXTERNAL_PACKAGES;

// Packages that esbuild should treat as external (to avoid bundling .node binaries)
// but that should NOT be copied to _modules/ — they are loaded optionally at runtime
// with a try/catch fallback (e.g. linkedom falls back to its canvas shim if canvas
// is unavailable). Copying these would trigger a node-gyp rebuild on Linux CI.
const ESBUILD_ONLY_EXTERNAL_PACKAGES = [
  "canvas",
  // unzipper requires this only inside its optional S3 source adapter but
  // does not declare it. Keep the optional branch unresolved unless used.
  "@aws-sdk/client-s3",
];
const esbuildOnlyExternalSet = new Set(ESBUILD_ONLY_EXTERNAL_PACKAGES);

// esbuild must always treat every known-external package as external — even
// ones a profile doesn't stage — so their imports stay lazy at runtime.
const ESBUILD_EXTERNAL_PACKAGES = [
  ...COMMON_EXTERNAL_PACKAGES,
  ...DESKTOP_ONLY_EXTERNAL_PACKAGES,
  ...ESBUILD_ONLY_EXTERNAL_PACKAGES,
];

// Packages that ship prebuilt binaries for EVERY OS/arch inside one package
// (unlike sharp/keytar which split them into per-platform optionalDependencies
// that npm already prunes to the host). Staging all platforms wastes ~150 MB in
// each single-target artifact. After copying, keep only the target platform's
// binaries. Layout: <pkg>/bin/napi-v3/<platform>/<arch>/.
// Target defaults to the host; override with NODETOOL_BUNDLE_PLATFORM / _ARCH
// for cross-builds.
const TARGET_PLATFORM = process.env.NODETOOL_BUNDLE_PLATFORM || process.platform;
const TARGET_ARCH = process.env.NODETOOL_BUNDLE_ARCH || process.arch;
const MULTIPLATFORM_BINARY_PACKAGES = [
  // Currently empty — onnxruntime-node (the original entry) is no longer
  // staged. Add { name, binRoot } entries here when a staged package ships
  // per-platform binaries under a single root again.
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function packageVersion(pkgDir) {
  try {
    return (await readJson(path.join(pkgDir, "package.json"))).version;
  } catch {
    return "unknown";
  }
}

async function copyDir(src, dest) {
  await fsp.cp(src, dest, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    filter: (source) => path.basename(source) !== "node_modules",
  });
}

/**
 * Resolve a package's location from the workspace root node_modules,
 * falling back to nested node_modules inside workspace packages.
 * Returns the absolute path to the package directory, or null.
 */
function resolvePackageRoot(packageName) {
  // First check the standard module resolution paths from root
  const searchPaths = Module._nodeModulePaths(ROOT_DIR);
  for (const searchPath of searchPaths) {
    const candidate = path.join(searchPath, packageName);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  // Check electron directory's own node_modules (native deps listed in electron/package.json)
  const electronNM = path.join(ELECTRON_DIR, "node_modules", packageName);
  if (fs.existsSync(path.join(electronNM, "package.json"))) {
    return electronNM;
  }
  // Fallback: search nested node_modules inside workspace packages
  const packagesDir = path.join(ROOT_DIR, "packages");
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(
        packagesDir,
        entry.name,
        "node_modules",
        packageName
      );
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Expand wildcard patterns like "@img/sharp-*" by scanning the scope directory.
 */
function expandWildcardPattern(pattern) {
  const matches = [];
  if (!pattern.includes("*")) {
    return [pattern];
  }

  // Handle scoped packages: @scope/name-*
  const slashIndex = pattern.indexOf("/");
  if (slashIndex === -1) return [pattern]; // non-scoped wildcards not supported

  const scope = pattern.slice(0, slashIndex);
  const namePattern = pattern.slice(slashIndex + 1);
  const regexStr = "^" + namePattern.replace(/\*/g, ".*") + "$";
  const regex = new RegExp(regexStr);

  // Search in root, electron, and workspace package node_modules
  const searchDirs = [
    path.join(ROOT_DIR, "node_modules", scope),
    path.join(ELECTRON_DIR, "node_modules", scope),
  ];

  // Also search workspace packages
  const packagesDir = path.join(ROOT_DIR, "packages");
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        searchDirs.push(
          path.join(packagesDir, entry.name, "node_modules", scope)
        );
      }
    }
  }

  for (const scopeDir of searchDirs) {
    if (!fs.existsSync(scopeDir)) continue;
    for (const entry of fs.readdirSync(scopeDir)) {
      const fullName = `${scope}/${entry}`;
      if (regex.test(entry) && !matches.includes(fullName)) {
        matches.push(fullName);
      }
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// External package copier
// ---------------------------------------------------------------------------

/**
 * Resolve a dependency from the perspective of a parent package.
 * Uses Node's module resolution: starts from parentDir and walks up.
 */
function resolveDepFrom(parentDir, depName) {
  const searchPaths = Module._nodeModulePaths(parentDir);
  for (const searchPath of searchPaths) {
    const candidate = path.join(searchPath, depName);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Strip prebuilt binaries for non-target platforms/arches from staged packages
 * that bundle every platform in one package (e.g. onnxruntime-node ships
 * darwin+linux+win32 × x64+arm64, ~150 MB of which is dead weight in any single
 * artifact). Returns bytes reclaimed.
 */
async function pruneMultiplatformBinaries(bundleNodeModules) {
  let reclaimed = 0;
  for (const { name, binRoot } of MULTIPLATFORM_BINARY_PACKAGES) {
    const napiDir = path.join(bundleNodeModules, name, binRoot);
    let platforms;
    try {
      platforms = await fsp.readdir(napiDir, { withFileTypes: true });
    } catch {
      continue; // package not staged or different layout — skip
    }
    // Guard: never prune unless the target platform's binaries are actually
    // present. A mis-set NODETOOL_BUNDLE_PLATFORM or a changed package layout
    // would otherwise delete every platform dir and ship a broken artifact.
    const hasTarget = platforms.some(
      (p) => p.isDirectory() && p.name === TARGET_PLATFORM
    );
    if (!hasTarget) {
      console.warn(
        `  Skipped pruning ${name}: no binaries for target platform ` +
          `"${TARGET_PLATFORM}" under ${binRoot} (found: ` +
          `${platforms.filter((p) => p.isDirectory()).map((p) => p.name).join(", ") || "none"}). ` +
          `Keeping all platforms to avoid shipping a broken artifact.`
      );
      continue;
    }
    for (const platform of platforms) {
      if (!platform.isDirectory()) continue;
      const platformDir = path.join(napiDir, platform.name);
      if (platform.name !== TARGET_PLATFORM) {
        reclaimed += await dirSize(platformDir);
        await fsp.rm(platformDir, { recursive: true, force: true });
        continue;
      }
      // Matching platform: drop non-target arch subdirs.
      let arches;
      try {
        arches = await fsp.readdir(platformDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const arch of arches) {
        if (arch.isDirectory() && arch.name !== TARGET_ARCH) {
          const archDir = path.join(platformDir, arch.name);
          reclaimed += await dirSize(archDir);
          await fsp.rm(archDir, { recursive: true, force: true });
        }
      }
    }
    console.log(
      `  Pruned ${name} to ${TARGET_PLATFORM}/${TARGET_ARCH}`
    );
  }
  return reclaimed;
}

async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        // vanished mid-walk — ignore
      }
    }
  }
  return total;
}

/**
 * Stage every sandbox pack NodeTool ships under `_sandbox/<pack>/`, next to a
 * copy of the pack's package.json.
 *
 * The package.json travels with the files because the pack manifest *is* the
 * declaration: `discoverSandboxPack` reads `nodetool.sandboxModules` from it,
 * so a staged pack directory stays discoverable exactly like an installed one.
 * SKILL.md travels too — it is what an agent reads before importing the pack.
 * A declared file that is missing from the package fails the build; so does an
 * empty source directory, because a bundle that silently ships no pack is the
 * failure this staging exists to prevent.
 *
 * The pack list is the source directory itself, so a new pack ships with no
 * change here. These packages are not workspaces (no host code may import
 * them), which is why the directory is read by path instead of resolved.
 */
/**
 * Stage the system skills under `_skills/<name>/SKILL.md`, next to `server.mjs`.
 *
 * Same shape and same reason as the sandbox packs above: nothing imports them,
 * so they are not workspaces and must be copied by path. The directory listing
 * is the manifest — a skill added to the source tree ships with no change here
 * — and an empty source directory fails the build, because a bundle that
 * silently ships no skills is exactly what this staging prevents.
 */
async function stageSystemSkills(sourceDirRel) {
  console.log("\nStaging the system skills NodeTool ships...");
  const sourceDir = path.join(ROOT_DIR, sourceDirRel);
  let entries;
  try {
    entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  } catch {
    throw new Error(`System skills directory not found: ${sourceDir}`);
  }

  let staged = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(sourceDir, entry.name, "SKILL.md");
    if (!fs.existsSync(src)) continue;
    const destDir = path.join(BUNDLE_DIR, "_skills", entry.name);
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.copyFile(src, path.join(destDir, "SKILL.md"));
    staged += 1;
    console.log(`  Staged skill ${entry.name}`);
  }
  if (staged === 0) {
    throw new Error(
      `No system skills staged from ${sourceDir} — every directory must hold a SKILL.md.`
    );
  }
  return staged;
}

async function stageShippedSandboxPacks(sourceDirRel) {
  console.log("\nStaging the sandbox packs NodeTool ships...");
  const sourceDir = path.join(ROOT_DIR, sourceDirRel);
  let entries;
  try {
    entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  } catch {
    throw new Error(`Shipped sandbox pack directory not found: ${sourceDir}`);
  }

  let staged = 0;
  let packCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packRoot = path.join(sourceDir, entry.name);
    const manifestPath = path.join(packRoot, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const pkgJson = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
    const nodetool = pkgJson.nodetool ?? {};
    const modules = nodetool.sandboxModules;
    if (!Array.isArray(modules) || modules.length === 0) continue;
    if (typeof pkgJson.name !== "string" || pkgJson.name.length === 0) {
      throw new Error(`Sandbox pack ${packRoot} has no package name.`);
    }

    const files = [
      ...modules.map((module) => module?.file).filter(Boolean),
      ...(Array.isArray(nodetool.internal) ? nodetool.internal : []),
    ];
    if (fs.existsSync(path.join(packRoot, "SKILL.md"))) files.push("SKILL.md");

    const destRoot = path.join(BUNDLE_DIR, "_sandbox", ...pkgJson.name.split("/"));
    await fsp.mkdir(destRoot, { recursive: true });
    await fsp.copyFile(manifestPath, path.join(destRoot, "package.json"));
    for (const file of new Set(files)) {
      const src = path.join(packRoot, file);
      if (!fs.existsSync(src)) {
        throw new Error(
          `Sandbox pack ${pkgJson.name} declares ${file}, which is not in the package.`
        );
      }
      const dest = path.join(destRoot, ...file.split("/"));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(src, dest);
      staged += 1;
    }
    packCount += 1;
    console.log(`  Staged ${pkgJson.name} (${new Set(files).size} file(s))`);
  }

  if (packCount === 0) {
    throw new Error(
      `No sandbox pack found in ${sourceDir}. The packaged backend would ship ` +
      `no sandbox library at all.`
    );
  }
  console.log(`  Total: ${packCount} sandbox pack(s)`);
  return staged;
}

async function copyExternalPackages() {
  // Use "_modules" instead of "node_modules" because electron-builder
  // excludes node_modules directories by default in extraResources.
  const bundleNodeModules = path.join(BUNDLE_DIR, "_modules");
  await fsp.mkdir(bundleNodeModules, { recursive: true });

  // Track copied packages by their destination path to handle version
  // conflicts, and remember which source each destination came from so a
  // later, differing candidate can be reported instead of silently dropped.
  const copiedDests = new Map();
  // Track package names we've already queued to avoid infinite loops
  const queued = new Set();
  // Queue items: { name, resolveFrom } where resolveFrom is the parent dir
  const queue = [];
  // Track which required packages were successfully copied
  const copiedPackages = new Set();

  // Expand all external patterns and seed the queue
  for (const pattern of EXTERNAL_PACKAGES) {
    const expanded = expandWildcardPattern(pattern);
    for (const pkgName of expanded) {
      if (!queued.has(pkgName)) {
        queue.push({ name: pkgName, resolveFrom: ROOT_DIR });
        queued.add(pkgName);
      }
    }
  }

  let copiedCount = 0;

  while (queue.length > 0) {
    const { name: pkgName, resolveFrom, optional } = queue.shift();

    // Resolve from the parent's directory
    let sourceRoot = resolveDepFrom(resolveFrom, pkgName);

    // Fallback: try workspace nested node_modules
    if (!sourceRoot) {
      sourceRoot = resolvePackageRoot(pkgName);
    }

    if (!sourceRoot) {
      // npm prunes optionalDependencies to the host platform, so a missing
      // one is the normal case (e.g. sharp lists every OS/arch prebuild).
      if (!optional) {
        console.warn(
          `  Warning: external package ${pkgName} not found, skipping`
        );
      }
      continue;
    }

    copiedPackages.add(pkgName);

    const destRoot = path.join(bundleNodeModules, pkgName);

    // _modules/ is flat, so one version per package name wins. Report when a
    // second, different source wants the same slot — that skew is invisible at
    // build time but breaks the packaged app (a sharp/@img major mismatch
    // crashed the backend on startup).
    const already = copiedDests.get(destRoot);
    if (already) {
      if (already !== sourceRoot) {
        const stagedVersion = await packageVersion(already);
        const skippedVersion = await packageVersion(sourceRoot);
        if (stagedVersion !== skippedVersion) {
          console.warn(
            `  Warning: ${pkgName}@${stagedVersion} staged from ` +
              `${path.relative(ROOT_DIR, already)}, ignoring ` +
              `${skippedVersion} from ${path.relative(ROOT_DIR, sourceRoot)}`
          );
        }
      }
      continue;
    }

    await fsp.mkdir(path.dirname(destRoot), { recursive: true });
    await copyDir(sourceRoot, destRoot);
    copiedDests.set(destRoot, sourceRoot);
    copiedCount++;
    console.log(`  Copied ${pkgName}`);

    // Enqueue transitive dependencies, resolving from this package's location
    const pkgJsonPath = path.join(sourceRoot, "package.json");
    try {
      const pkgJson = await readJson(pkgJsonPath);
      const optionalDeps = pkgJson.optionalDependencies ?? {};
      const deps = { ...(pkgJson.dependencies ?? {}), ...optionalDeps };
      for (const depName of Object.keys(deps)) {
        // node-av uses werift only for optional WebRTC sources. Sandbox media
        // operations read in-memory files, so staging that graph adds weight
        // without providing a reachable runtime path.
        if (pkgName === "node-av" && depName === "werift") continue;
        // Skip packages that are external for esbuild but must NOT be staged.
        // These are loaded via runtime try/catch with a fallback (e.g. linkedom
        // → canvas) and copying them would trigger a node-gyp rebuild.
        if (esbuildOnlyExternalSet.has(depName)) continue;
        // Use a composite key to allow re-queuing from different resolve contexts
        const queueKey = `${depName}@${sourceRoot}`;
        if (!queued.has(queueKey)) {
          queue.push({
            name: depName,
            resolveFrom: sourceRoot,
            optional: depName in optionalDeps,
          });
          queued.add(queueKey);
        }
      }
    } catch {
      // If we can't read package.json, just skip transitive deps
    }
  }

  // Verify all required packages were copied
  const missingRequired = REQUIRED_EXTERNAL_PACKAGES.filter(
    (pkg) => !copiedPackages.has(pkg)
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Required external packages not found: ${missingRequired.join(", ")}. ` +
      `Run 'npm install' in the workspace root first.`
    );
  }

  return copiedCount;
}

// ---------------------------------------------------------------------------
// Staged-module pruning
// ---------------------------------------------------------------------------

/** On-disk size of a file or directory, in bytes. */
async function pathSize(target) {
  let stat;
  try {
    stat = await fsp.lstat(target);
  } catch {
    return 0;
  }
  return stat.isDirectory() ? dirSize(target) : stat.size;
}

// Files that are never needed at runtime, safe to strip from every staged
// package. Runtime-relevant extensions (.js, .cjs, .mjs, .json, .node, .wasm)
// are explicitly protected and never deleted by the generic pass. Junk-named
// directories are only pruned at a package root (parent has package.json):
// nested ones can be compiled runtime code (yaml/dist/doc/ is require()d by
// yaml's entry, playwright/lib/mcp/test/ by its CLI).
const JUNK_FILE_PATTERNS = [
  /\.(md|markdown|map|flow)$/i,
  /\.d\.(ts|mts|cts)$/,
  /^LICENSE(\..+)?$/i,
  /^LICENCE/i,
  /^CHANGELOG/i,
  /^AUTHORS/i,
];
const PROTECTED_FILE_RE = /\.(wasm|node|json|cjs|mjs|js)$/i;
const JUNK_DIR_NAMES = new Set([
  "test",
  "tests",
  "__tests__",
  "docs",
  "doc",
  "example",
  "examples",
  ".github",
  "coverage",
]);

// The emscripten wasm package's directory layout is load-bearing (the .wasm
// asset resolves relative to its JS) — strip only generic junk files inside
// it, never whole directories.
const NO_DIR_PRUNE_PACKAGES = ["@jitl/quickjs-ng-wasmfile-release-sync"];

/**
 * Strip docs, typings, source maps, tests, and other non-runtime files from
 * the staged _modules/ tree. Returns bytes reclaimed.
 */
async function pruneStagedJunk(modulesDir) {
  let reclaimed = 0;

  async function remove(target) {
    reclaimed += await pathSize(target);
    await fsp.rm(target, { recursive: true, force: true });
  }

  async function walk(dir, allowDirPrune) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const rel = path
          .relative(modulesDir, full)
          .split(path.sep)
          .join("/");
        const dirPruneOk =
          allowDirPrune &&
          !NO_DIR_PRUNE_PACKAGES.some(
            (pkg) => rel === pkg || rel.startsWith(pkg + "/")
          );
        const atPackageRoot = fs.existsSync(path.join(dir, "package.json"));
        if (
          dirPruneOk &&
          atPackageRoot &&
          JUNK_DIR_NAMES.has(entry.name.toLowerCase())
        ) {
          await remove(full);
          continue;
        }
        await walk(full, dirPruneOk);
      } else {
        if (PROTECTED_FILE_RE.test(entry.name)) continue;
        if (JUNK_FILE_PATTERNS.some((re) => re.test(entry.name))) {
          await remove(full);
        }
      }
    }
  }

  await walk(modulesDir, true);
  return reclaimed;
}

/**
 * Package-specific prunes for staged packages that ship large trees the
 * backend never loads. Each rule verifies the package's entry points before
 * deleting and skips with a warning if the layout doesn't match expectations.
 * Returns bytes reclaimed.
 */
async function pruneTargetedPackages(modulesDir) {
  let reclaimed = 0;

  async function remove(target) {
    if (!fs.existsSync(target)) return;
    reclaimed += await pathSize(target);
    await fsp.rm(target, { recursive: true, force: true });
  }

  // openai ships its TypeScript sources in src/ alongside the compiled
  // package-root output; main/exports point at the compiled files only.
  const openaiDir = path.join(modulesDir, "openai");
  const openaiPkgJson = path.join(openaiDir, "package.json");
  if (fs.existsSync(openaiPkgJson)) {
    const pkg = await readJson(openaiPkgJson);
    const entryRefs = JSON.stringify({ main: pkg.main, exports: pkg.exports });
    if (/\bsrc\//.test(entryRefs)) {
      console.warn(
        "  Warning: openai entry points reference src/, skipping src/ prune"
      );
    } else {
      await remove(path.join(openaiDir, "src"));
    }
  }

  // pdfjs-dist: every staged consumer (pdf-parse; office-text-extractor and
  // @llamaindex/liteparse have no pdfjs-dist references at all) imports the
  // legacy build (pdfjs-dist/legacy/*) only — see the EXTERNAL_PACKAGES
  // comment above. The modern build/ and the viewer web/ tree are dead weight.
  const pdfjsDir = path.join(modulesDir, "pdfjs-dist");
  if (fs.existsSync(pdfjsDir)) {
    await remove(path.join(pdfjsDir, "build"));
    await remove(path.join(pdfjsDir, "web"));
  }

  return reclaimed;
}

/**
 * node-web-audio-api ships one prebuilt .node per platform/arch at the
 * package root (node-web-audio-api.<platform>-<arch>[-<abi>].node — see its
 * load-native.cjs). Delete the prebuilds that can't load on the bundle
 * target. Guard: never delete anything unless a prebuild matching
 * TARGET_PLATFORM/TARGET_ARCH is confirmed present, so a wrong
 * NODETOOL_BUNDLE_PLATFORM leaves the package untouched. On linux both -gnu
 * and -musl variants of the target arch are kept, and unknown-token files
 * (e.g. a local node-web-audio-api.build-release.node) are never touched.
 * Returns bytes reclaimed.
 */
async function pruneWebAudioPrebuilds(modulesDir) {
  const pkgDir = path.join(modulesDir, "node-web-audio-api");
  if (!fs.existsSync(pkgDir)) return 0;

  const KNOWN_PLATFORMS = new Set(["darwin", "linux", "win32"]);
  const binRe = /^node-web-audio-api\.(.+)\.node$/;

  // Token examples: darwin-arm64, linux-x64-gnu, linux-arm64-musl,
  // linux-arm-gnueabihf, win32-x64-msvc.
  const parseToken = (token) => {
    const [platform, arch = ""] = token.split("-");
    return { platform, arch };
  };

  let targetMatched = false;
  const removable = [];
  for (const file of await fsp.readdir(pkgDir)) {
    const match = file.match(binRe);
    if (!match) continue;
    const { platform, arch } = parseToken(match[1]);
    if (!KNOWN_PLATFORMS.has(platform)) continue; // local builds etc. — keep
    if (platform === TARGET_PLATFORM && arch === TARGET_ARCH) {
      targetMatched = true;
    } else {
      removable.push(file);
    }
  }

  if (!targetMatched) {
    console.warn(
      `  Warning: no node-web-audio-api prebuild matches ` +
        `${TARGET_PLATFORM}/${TARGET_ARCH} — check NODETOOL_BUNDLE_PLATFORM/` +
        `NODETOOL_BUNDLE_ARCH; leaving all prebuilds in place`
    );
    return 0;
  }

  let reclaimed = 0;
  for (const file of removable) {
    const full = path.join(pkgDir, file);
    reclaimed += (await fsp.stat(full)).size;
    await fsp.rm(full);
  }
  return reclaimed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Bundle the Postgres migration runner (scripts/db-migrate.mjs) into a single
 * <out>/db-migrate.mjs. @nodetool-ai/models and postgres are pure JS
 * (migrations are code-defined in packages/models/src/migrations/versions.ts,
 * no import.meta.url asset loads), so they bundle in. Native modules stay
 * external — models statically imports better-sqlite3, which _modules/
 * provides at runtime.
 */
async function buildMigrateBundle() {
  console.log("\nBundling migration runner (db-migrate.mjs)...");
  await esbuild.build({
    entryPoints: [MIGRATE_ENTRY_POINT],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: path.join(BUNDLE_DIR, "db-migrate.mjs"),
    external: ESBUILD_EXTERNAL_PACKAGES,
    sourcemap: "external",
    banner: {
      js: [
        'import { createRequire as __ntCreateRequire } from "node:module";',
        "const require = __ntCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    logLevel: "warning",
  });
  console.log("  Wrote db-migrate.mjs");
}

/**
 * Bundle the QuickJS sandbox worker entry into
 * <out>/js-sandbox-worker/worker-entry.js.
 *
 * The sandbox interpreter runs on a worker thread, and a worker needs a real
 * file URL — server.mjs is one module, so the entry cannot be reached inside
 * it. host.ts resolves this path relative to its own import.meta.url, which in
 * the packaged app is server.mjs, so the directory name is part of the
 * contract. quickjs and its wasm variant stay external and resolve from the
 * adjacent promoted node_modules, exactly as they do for the server.
 */
async function buildSandboxWorkerBundle() {
  console.log("\nBundling sandbox worker (js-sandbox-worker/worker-entry.js)...");
  if (!fs.existsSync(SANDBOX_WORKER_ENTRY_POINT)) {
    throw new Error(
      `Sandbox worker entry point not found: ${SANDBOX_WORKER_ENTRY_POINT}\n` +
        "Run 'npm run build:packages' first."
    );
  }
  await esbuild.build({
    entryPoints: [SANDBOX_WORKER_ENTRY_POINT],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: path.join(BUNDLE_DIR, "js-sandbox-worker", "worker-entry.js"),
    external: ESBUILD_EXTERNAL_PACKAGES,
    sourcemap: "external",
    banner: {
      js: [
        'import { createRequire as __ntCreateRequire } from "node:module";',
        "const require = __ntCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    logLevel: "warning",
  });
  console.log("  Wrote js-sandbox-worker/worker-entry.js");
}

async function main() {
  console.log(
    `Building hybrid backend bundle with esbuild (profile: ${PROFILE})...\n`
  );

  // Verify entry point exists
  if (!fs.existsSync(ENTRY_POINT)) {
    throw new Error(
      `Entry point not found: ${ENTRY_POINT}\nRun 'npm run build:packages' first.`
    );
  }

  // Clean previous bundle
  if (fs.existsSync(BUNDLE_DIR)) {
    console.log("Cleaning previous bundle...");
    await fsp.rm(BUNDLE_DIR, { recursive: true, force: true });
  }
  await fsp.mkdir(BUNDLE_DIR, { recursive: true });

  // --- esbuild ---
  console.log("Running esbuild...");
  const result = await esbuild.build({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: path.join(BUNDLE_DIR, "server.mjs"),
    external: ESBUILD_EXTERNAL_PACKAGES,
    metafile: true,
    sourcemap: "external",
    banner: {
      js: [
        'import { createRequire as __ntCreateRequire } from "node:module";',
        "const require = __ntCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    logLevel: "warning",
  });

  // Print metafile analysis
  const analysis = await esbuild.analyzeMetafile(result.metafile, {
    verbose: false,
  });
  console.log("\nesbuild analysis (top inputs):");
  // Print first 30 lines of analysis
  const lines = analysis.split("\n");
  console.log(lines.slice(0, 30).join("\n"));
  if (lines.length > 30) {
    console.log(`  ... and ${lines.length - 30} more entries`);
  }

  // --- Copy external packages ---
  console.log("\nCopying external packages to staged backend modules...");
  const copiedCount = await copyExternalPackages();

  // Drop prebuilt binaries for other platforms/arches from packages that ship
  // all of them in one package.
  const modulesDir = path.join(BUNDLE_DIR, "_modules");
  const reclaimed = await pruneMultiplatformBinaries(modulesDir);
  if (reclaimed > 0) {
    console.log(
      `  Reclaimed ${(reclaimed / 1024 / 1024).toFixed(0)} MB of non-target platform binaries`
    );
  }

  console.log("\nPruning staged backend modules...");
  const junkBytes = await pruneStagedJunk(modulesDir);
  console.log(
    `  Junk prune reclaimed ${(junkBytes / 1024 / 1024).toFixed(1)} MB`
  );
  const targetedBytes = await pruneTargetedPackages(modulesDir);
  console.log(
    `  Targeted prune reclaimed ${(targetedBytes / 1024 / 1024).toFixed(1)} MB`
  );
  const webAudioBytes = await pruneWebAudioPrebuilds(modulesDir);
  console.log(
    `  node-web-audio-api prune reclaimed ${(webAudioBytes / 1024 / 1024).toFixed(1)} MB`
  );

  // --- Stage registered package runtime assets next to server.mjs ---
  // The registry in @nodetool-ai/config (package-asset-registry.ts) is the
  // single source of truth for files packages load at runtime relative to
  // their compiled code. esbuild flattens all sources into one directory, so
  // each registered file is staged at the bundle root by basename — the same
  // place `loadPackageAssetJson` resolves to in the packaged app.
  console.log("\nStaging registered package runtime assets next to server.mjs...");
  const registryPath = path.join(
    ROOT_DIR,
    "packages",
    "config",
    "dist",
    "package-asset-registry.js"
  );
  const {
    PACKAGE_RUNTIME_ASSETS,
    PACKAGE_RUNTIME_ASSET_DIRS,
    SHIPPED_SANDBOX_PACKS_SOURCE_DIR,
    SHIPPED_SYSTEM_SKILLS_SOURCE_DIR
  } = await import(
    pathToFileURL(registryPath).href
  );

  const stagedAssets = new Map();
  for (const asset of PACKAGE_RUNTIME_ASSETS) {
    const pkgRoot = resolvePackageRoot(asset.pkg);
    if (!pkgRoot) {
      throw new Error(
        `Registered asset package not found: ${asset.pkg}. ` +
        `Run 'npm install' and 'npm run build:packages' first.`
      );
    }
    const src = path.join(pkgRoot, "dist", asset.path);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Registered asset missing from build output: ${src} ` +
        `(${asset.pkg}/${asset.path}). Check the package's build copies it into dist/.`
      );
    }
    const basename = path.basename(asset.path);
    const existing = stagedAssets.get(basename);
    if (existing && existing !== src) {
      throw new Error(
        `Asset basename collision: ${basename} in both ${existing} and ${src}. ` +
        `Bundle root staging requires unique basenames.`
      );
    }
    await fsp.copyFile(src, path.join(BUNDLE_DIR, basename));
    stagedAssets.set(basename, src);
    console.log(`  Staged ${basename} (from ${asset.pkg}/dist/${asset.path})`);
  }
  console.log(`  Total: ${stagedAssets.size} registered asset(s) staged`);

  // --- Stage registered runtime asset directories ---
  // A directory of files a package ships next to its sources rather than in
  // dist/ (the bundled fonts). Copied whole, then checked file by file against
  // the registry: the packaged backend registers the faces from this directory
  // and the server streams them to the web, so a partial copy renders one
  // family as a fallback in a picture nobody re-renders.
  for (const dir of PACKAGE_RUNTIME_ASSET_DIRS) {
    const pkgRoot = resolvePackageRoot(dir.pkg);
    if (!pkgRoot) {
      throw new Error(
        `Registered asset directory package not found: ${dir.pkg}. ` +
        `Run 'npm install' first.`
      );
    }
    const src = path.join(pkgRoot, dir.path);
    const dest = path.join(BUNDLE_DIR, dir.bundleDir);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Registered asset directory missing: ${src} (${dir.pkg}/${dir.path}).`
      );
    }
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await copyDir(src, dest);
    const absent = dir.files.filter(
      (file) => !fs.existsSync(path.join(dest, file))
    );
    if (absent.length > 0) {
      throw new Error(
        `Registered asset directory ${dir.pkg}/${dir.path} is missing ` +
        `file(s) after staging: ${absent.join(", ")}. ` +
        `Add them to ${dir.path}/ or drop them from PACKAGE_RUNTIME_ASSET_DIRS ` +
        `in packages/config/src/package-asset-registry.ts.`
      );
    }
    console.log(
      `  Staged ${dir.bundleDir}/ with ${dir.files.length} file(s) ` +
      `(from ${dir.pkg}/${dir.path})`
    );
  }

  // --- Stage the sandbox packs NodeTool ships ---
  // A pack that ships inside the app carries manifest and guest sources the
  // backend never imports, so esbuild does not see them and nothing else copies
  // them. Both the pack list and the file list are data-driven — the source
  // directory, and each pack's own `nodetool.sandboxModules` manifest, which is
  // the declaration the catalog's discovery reads. The staged tree is where
  // `shippedPackSearchPaths()` looks in the packaged app. Installed packs are
  // unaffected: they resolve through the optional-node root at runtime, and
  // shadow the shipped copy when they carry the same name.
  await stageShippedSandboxPacks(SHIPPED_SANDBOX_PACKS_SOURCE_DIR);
  await stageSystemSkills(SHIPPED_SYSTEM_SKILLS_SOURCE_DIR);

  // Cross-check: any *-manifest.json in a package's dist/ that is NOT in the
  // registry is almost certainly a new provider manifest someone forgot to
  // register — it would load in dev but not in the packaged app. Fail loudly.
  const packagesDir = path.join(ROOT_DIR, "packages");

  async function findManifests(dir, out) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await findManifests(full, out);
      } else if (entry.isFile() && entry.name.endsWith("-manifest.json")) {
        out.push(full);
      }
    }
  }

  const discovered = [];
  for (const pkg of await fsp.readdir(packagesDir)) {
    await findManifests(path.join(packagesDir, pkg, "dist"), discovered);
  }
  const unregistered = discovered.filter(
    (src) => !stagedAssets.has(path.basename(src))
  );
  if (unregistered.length > 0) {
    throw new Error(
      `Manifest file(s) in dist/ not registered as package runtime assets:\n` +
      unregistered.map((f) => `  - ${path.relative(ROOT_DIR, f)}`).join("\n") +
      `\nAdd them to PACKAGE_RUNTIME_ASSETS in ` +
      `packages/config/src/package-asset-registry.ts so they are staged and verified.`
    );
  }

  // --- Copy example workflows and package assets ---
  // server.ts resolves examples relative to import.meta.url, so in the
  // packaged app (resources/backend/server.mjs) it looks for:
  //   resources/backend/examples/nodetool-base/   (workflow JSONs)
  //   resources/backend/assets/nodetool-base/     (thumbnail JPGs + constant
  //                                                 `package://` assets served
  //                                                 at /api/assets/packages/...)
  console.log("\nCopying example workflows and package assets...");
  const BASE_NODES_NODETOOL_DIR = path.join(
    ROOT_DIR,
    "packages",
    "base-nodes",
    "nodetool"
  );
  const examplesSrc = path.join(
    BASE_NODES_NODETOOL_DIR,
    "examples",
    "nodetool-base"
  );
  const assetsSrc = path.join(
    BASE_NODES_NODETOOL_DIR,
    "assets",
    "nodetool-base"
  );
  const examplesDest = path.join(BUNDLE_DIR, "examples", "nodetool-base");
  const assetsDest = path.join(BUNDLE_DIR, "assets", "nodetool-base");

  if (fs.existsSync(examplesSrc)) {
    await fsp.mkdir(path.dirname(examplesDest), { recursive: true });
    await copyDir(examplesSrc, examplesDest);
    const exampleCount = (await fsp.readdir(examplesDest)).filter((f) =>
      f.toLowerCase().endsWith(".json")
    ).length;
    console.log(`  Copied ${exampleCount} example workflow(s) to examples/nodetool-base/`);
  } else {
    console.warn(`  Warning: examples directory not found, skipping: ${examplesSrc}`);
  }

  // The example app bundles sit next to the example workflows, which is where
  // the server looks for them (`exampleAppsDir` defaults to that sibling).
  const exampleAppsSrc = path.join(BASE_NODES_NODETOOL_DIR, "examples", "apps");
  const exampleAppsDest = path.join(BUNDLE_DIR, "examples", "apps");
  if (fs.existsSync(exampleAppsSrc)) {
    await fsp.mkdir(path.dirname(exampleAppsDest), { recursive: true });
    await copyDir(exampleAppsSrc, exampleAppsDest);
    const appCount = (await fsp.readdir(exampleAppsDest)).filter((f) =>
      f.toLowerCase().endsWith(".app.json")
    ).length;
    console.log(`  Copied ${appCount} example app bundle(s) to examples/apps/`);
  } else {
    console.warn(
      `  Warning: example apps directory not found, skipping: ${exampleAppsSrc}`
    );
  }

  // The example storyboards sit next to them, same rule: the server resolves
  // `exampleStoryboardsDir` as the `storyboards` sibling of the examples dir.
  // Their stills and clips are `package://` assets and ride along in
  // assets/nodetool-base/storyboards/ below.
  const exampleStoryboardsSrc = path.join(
    BASE_NODES_NODETOOL_DIR,
    "examples",
    "storyboards"
  );
  const exampleStoryboardsDest = path.join(BUNDLE_DIR, "examples", "storyboards");
  if (fs.existsSync(exampleStoryboardsSrc)) {
    await fsp.mkdir(path.dirname(exampleStoryboardsDest), { recursive: true });
    await copyDir(exampleStoryboardsSrc, exampleStoryboardsDest);
    const boardCount = (await fsp.readdir(exampleStoryboardsDest)).filter((f) =>
      f.toLowerCase().endsWith(".storyboard.json")
    ).length;
    console.log(
      `  Copied ${boardCount} example storyboard(s) to examples/storyboards/`
    );
  } else {
    console.warn(
      `  Warning: example storyboards directory not found, skipping: ${exampleStoryboardsSrc}`
    );
  }

  if (fs.existsSync(assetsSrc)) {
    await fsp.mkdir(path.dirname(assetsDest), { recursive: true });
    await copyDir(assetsSrc, assetsDest);
    const assetCount = (await fsp.readdir(assetsDest)).filter((f) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
    ).length;
    console.log(`  Copied ${assetCount} thumbnail asset(s) to assets/nodetool-base/`);
  } else {
    console.warn(`  Warning: assets directory not found, skipping: ${assetsSrc}`);
  }

  // --- Generate minimal package.json ---
  await fsp.writeFile(
    path.join(BUNDLE_DIR, "package.json"),
    JSON.stringify({ type: "module" }, null, 2) + "\n"
  );

  // --- Sandbox worker entry (always: the sandbox falls back to running
  //     in-process without it, which blocks the event loop for a whole run) ---
  await buildSandboxWorkerBundle();

  // --- Migration runner entry (opt-in) ---
  if (OPTIONS.withMigrate) {
    await buildMigrateBundle();
  }

  // --- Stats ---
  console.log("\n--- Bundle Stats ---");

  // Count files
  let fileCount = 0;
  let totalSize = 0;
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        fileCount++;
        const stat = await fsp.stat(fullPath);
        totalSize += stat.size;
      }
    }
  }
  await walk(BUNDLE_DIR);

  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
  console.log(`  Files:    ${fileCount}`);
  console.log(`  Size:     ${sizeMB} MB`);
  console.log(`  External: ${copiedCount} packages copied to _modules/`);
  console.log(`  Output:   ${BUNDLE_DIR}`);
  console.log(`  Entry:    server.mjs`);

  // --- Verify staged layout ---
  // Cross-check what server.mjs actually references (manifests, examples,
  // assets, webgpu) against what was staged. Throws on any gap so a staging
  // regression fails the build here instead of silently shipping an app with
  // empty model lists.
  console.log("\nVerifying staged bundle layout...");
  for (const line of verifyBackendBundle(BUNDLE_DIR)) {
    console.log(`  ${line}`);
  }

  console.log("\nBackend bundle created successfully!");
}

main().catch((err) => {
  console.error("Failed to build backend bundle:", err);
  process.exit(1);
});
