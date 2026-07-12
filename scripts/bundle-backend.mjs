/**
 * esbuild-based hybrid bundler for the backend server artifact.
 *
 * Target-agnostic: the same bundled server.mjs runs under Electron (desktop
 * profile) and Docker (server profile) — the server never knows which; only
 * the staged native/optional packages differ per profile.
 *
 * Usage:
 *   node scripts/bundle-backend.mjs [--out <dir>] [--profile desktop|server]
 *                                   [--with-migrate] [--with-sandbox-agent]
 *
 * Defaults preserve the Electron flow: --out electron/backend-bundle,
 * --profile desktop, no migrate entry.
 *
 * Produces:
 *   <out>/server.mjs          — single bundled ESM entry point
 *   <out>/server.mjs.map      — source map
 *   <out>/_modules/           — external packages staged for the target
 *   <out>/package.json        — { "type": "module" }
 *   <out>/db-migrate.mjs      — bundled migration runner (--with-migrate only)
 *   <out>/sandbox-agent.mjs   — bundled in-container tool server
 *                               (--with-sandbox-agent only)
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
const SANDBOX_AGENT_ENTRY_POINT = path.join(
  ROOT_DIR,
  "packages",
  "sandbox-agent",
  "dist",
  "entry.js"
);

// --- CLI flags -------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    out: path.join(ELECTRON_DIR, "backend-bundle"),
    profile: "desktop",
    withMigrate: false,
    withSandboxAgent: false,
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
    } else if (arg === "--with-sandbox-agent") {
      opts.withSandboxAgent = true;
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
const COMMON_REQUIRED_EXTERNAL_PACKAGES = [
  "sharp",
  "better-sqlite3",
  "@jitl/quickjs-ng-wasmfile-release-sync",
];
// webgpu is required on desktop only: the GPU compositor needs the dawn.node
// binary there, while the server profile does no local GPU compute (the gpu
// package lazy-imports webgpu behind an install-hint error).
const DESKTOP_REQUIRED_EXTERNAL_PACKAGES = ["webgpu"];
const REQUIRED_EXTERNAL_PACKAGES =
  PROFILE === "desktop"
    ? [
        ...COMMON_REQUIRED_EXTERNAL_PACKAGES,
        ...DESKTOP_REQUIRED_EXTERNAL_PACKAGES,
      ]
    : COMMON_REQUIRED_EXTERNAL_PACKAGES;

// Staged into _modules/ on every profile.
const COMMON_EXTERNAL_PACKAGES = [
  // Native modules (contain .node binaries)
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  "@img/sharp-*",
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
  // Server: no local GPU compute; gpu lazy-imports with an install-hint error.
  "webgpu",
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

async function copyExternalPackages() {
  // Use "_modules" instead of "node_modules" because electron-builder
  // excludes node_modules directories by default in extraResources.
  const bundleNodeModules = path.join(BUNDLE_DIR, "_modules");
  await fsp.mkdir(bundleNodeModules, { recursive: true });

  // Track copied packages by their destination path to handle version conflicts
  const copiedDests = new Set();
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
    const { name: pkgName, resolveFrom } = queue.shift();

    // Resolve from the parent's directory
    let sourceRoot = resolveDepFrom(resolveFrom, pkgName);

    // Fallback: try workspace nested node_modules
    if (!sourceRoot) {
      sourceRoot = resolvePackageRoot(pkgName);
    }

    if (!sourceRoot) {
      console.warn(`  Warning: external package ${pkgName} not found, skipping`);
      continue;
    }

    copiedPackages.add(pkgName);

    const destRoot = path.join(bundleNodeModules, pkgName);

    // Skip if already copied to this destination
    if (copiedDests.has(destRoot)) continue;

    await fsp.mkdir(path.dirname(destRoot), { recursive: true });
    await copyDir(sourceRoot, destRoot);
    copiedDests.add(destRoot);
    copiedCount++;
    console.log(`  Copied ${pkgName}`);

    // Enqueue transitive dependencies, resolving from this package's location
    const pkgJsonPath = path.join(sourceRoot, "package.json");
    try {
      const pkgJson = await readJson(pkgJsonPath);
      const deps = {
        ...(pkgJson.dependencies ?? {}),
        ...(pkgJson.optionalDependencies ?? {}),
      };
      for (const depName of Object.keys(deps)) {
        // Skip packages that are external for esbuild but must NOT be staged.
        // These are loaded via runtime try/catch with a fallback (e.g. linkedom
        // → canvas) and copying them would trigger a node-gyp rebuild.
        if (esbuildOnlyExternalSet.has(depName)) continue;
        // Use a composite key to allow re-queuing from different resolve contexts
        const queueKey = `${depName}@${sourceRoot}`;
        if (!queued.has(queueKey)) {
          queue.push({ name: depName, resolveFrom: sourceRoot });
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

/**
 * npm installs BOTH linux libc flavors of @napi-rs/canvas's platform packages
 * (canvas-linux-x64-gnu ~32 MB and canvas-linux-x64-musl ~29 MB), and the
 * transitive crawl stages both. The loader (@napi-rs/canvas/js-binding.js)
 * requires exactly one sibling: it branches on platform/arch and, on linux, on
 * isMusl() — there is no cross-libc fallback, so deleting the non-matching
 * variants cannot break resolution as long as the matching one is present.
 *
 * Package naming: @napi-rs/canvas-<platform>-<arch>[-<abi>] where <abi> is
 * gnu/musl (or gnueabihf/musleabihf on arm, msvc on win32); darwin variants
 * have no abi suffix. Two steps: (a) drop variants whose platform/arch don't
 * match the bundle target; (b) on linux, keep only the target libc —
 * NODETOOL_BUNDLE_LIBC=gnu|musl overrides, else detect from
 * process.report.getReport().header.glibcVersionRuntime (truthy → gnu, else
 * musl). Host detection is valid because linux bundles are always built on the
 * OS family they run on (Docker builds inside the target image base).
 *
 * Guards: nothing is deleted unless a kept variant with a .node binary is
 * confirmed present; if the libc can't be determined and no override is set,
 * both linux variants are kept with a warning. Returns bytes reclaimed.
 */
async function pruneCanvasLibcVariants(modulesDir) {
  const scopeDir = path.join(modulesDir, "@napi-rs");
  let entries;
  try {
    entries = await fsp.readdir(scopeDir, { withFileTypes: true });
  } catch {
    return 0; // @napi-rs scope not staged — nothing to do
  }

  const KNOWN_PLATFORMS = new Set([
    "darwin",
    "linux",
    "win32",
    "android",
    "freebsd",
  ]);
  const variants = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^canvas-(.+)$/);
    if (!match) continue;
    // Token examples: linux-x64-gnu, linux-x64-musl, linux-arm-gnueabihf,
    // darwin-arm64, win32-x64-msvc.
    const [platform, arch = "", ...rest] = match[1].split("-");
    if (!KNOWN_PLATFORMS.has(platform)) continue; // unknown layout — keep
    variants.push({ name: entry.name, platform, arch, abi: rest.join("-") });
  }
  if (variants.length === 0) return 0;

  // Resolve the target libc for linux targets.
  let targetLibc = null;
  if (TARGET_PLATFORM === "linux") {
    const override = process.env.NODETOOL_BUNDLE_LIBC;
    if (override === "gnu" || override === "musl") {
      targetLibc = override;
    } else if (override) {
      console.warn(
        `  Warning: NODETOOL_BUNDLE_LIBC must be "gnu" or "musl", got ` +
          `"${override}" — ignoring`
      );
    }
    if (targetLibc === null && process.platform === "linux") {
      targetLibc = process.report?.getReport?.().header?.glibcVersionRuntime
        ? "gnu"
        : "musl";
    }
  }

  const kept = [];
  const removable = [];
  for (const variant of variants) {
    if (
      variant.platform !== TARGET_PLATFORM ||
      variant.arch !== TARGET_ARCH
    ) {
      removable.push(variant);
    } else if (TARGET_PLATFORM === "linux" && targetLibc !== null) {
      // gnu also matches gnueabihf, musl also matches musleabihf.
      if (variant.abi.startsWith(targetLibc)) {
        kept.push(variant);
      } else {
        removable.push(variant);
      }
    } else {
      // Non-linux target, or linux with undetermined libc: keep.
      kept.push(variant);
    }
  }

  if (TARGET_PLATFORM === "linux" && targetLibc === null && kept.length > 1) {
    console.warn(
      `  Warning: cannot determine target libc for @napi-rs/canvas (set ` +
        `NODETOOL_BUNDLE_LIBC=gnu|musl) — keeping all linux variants`
    );
  }

  // Guard: only delete when a kept variant with its prebuilt binary exists.
  const keptWithBinary = [];
  for (const variant of kept) {
    const dir = path.join(scopeDir, variant.name);
    try {
      const files = await fsp.readdir(dir);
      if (files.some((f) => f.endsWith(".node"))) keptWithBinary.push(variant);
    } catch {
      // unreadable — treat as absent
    }
  }
  if (keptWithBinary.length === 0) {
    console.warn(
      `  Warning: no @napi-rs/canvas variant with a .node binary matches ` +
        `${TARGET_PLATFORM}/${TARGET_ARCH}` +
        (targetLibc ? `/${targetLibc}` : "") +
        ` — check NODETOOL_BUNDLE_PLATFORM/NODETOOL_BUNDLE_ARCH/` +
        `NODETOOL_BUNDLE_LIBC; leaving all variants in place`
    );
    return 0;
  }

  let reclaimed = 0;
  for (const variant of removable) {
    const dir = path.join(scopeDir, variant.name);
    reclaimed += await pathSize(dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }
  return reclaimed;
}

/**
 * tesseract.js-core ships six WASM cores (plain / simd / relaxedsimd, each in
 * lstm and non-lstm form), each as a .js loader + a .wasm binary + a .wasm.js
 * single-file alternative — ~44 MB, of which Node loads exactly one pair.
 *
 * Selection (tesseract.js v7, src/worker-script/node/getCore.js): probes
 * wasm-feature-detect and requires tesseract-core-relaxedsimd[-lstm] /
 * tesseract-core-simd[-lstm] / tesseract-core[-lstm]. Node 22's V8 supports
 * both SIMD and relaxed SIMD, so the relaxedsimd branch wins. The call site
 * (src/worker-script/index.js) passes the boolean `lstmOnly` where getCore
 * expects an OEM enum, so `[OEM.DEFAULT, OEM.LSTM_ONLY].includes(oem)` is
 * always false and the non-lstm ("full") core loads regardless — which is
 * also the safe one, since it supports every OEM mode. The kept .js loader
 * reads its sibling .wasm via fs.readFileSync(__dirname + "/<base>.wasm");
 * the .wasm.js files are a browser-oriented alternative Node never touches.
 *
 * Guards: skips with a warning if the staged tesseract.js selection logic
 * doesn't match these expectations, if feature detection fails, or if the
 * selected loader/wasm pair is missing. Returns bytes reclaimed.
 */
async function pruneTesseractCores(modulesDir) {
  const coreDir = path.join(modulesDir, "tesseract.js-core");
  if (!fs.existsSync(coreDir)) return 0;

  const tessDir = path.join(modulesDir, "tesseract.js");
  let getCoreSrc;
  let workerIndexSrc;
  let createWorkerSrc;
  try {
    getCoreSrc = await fsp.readFile(
      path.join(tessDir, "src", "worker-script", "node", "getCore.js"),
      "utf8"
    );
    workerIndexSrc = await fsp.readFile(
      path.join(tessDir, "src", "worker-script", "index.js"),
      "utf8"
    );
    createWorkerSrc = await fsp.readFile(
      path.join(tessDir, "src", "createWorker.js"),
      "utf8"
    );
  } catch {
    console.warn(
      `  Warning: staged tesseract.js worker-script sources not found — ` +
        `skipping tesseract.js-core prune`
    );
    return 0;
  }

  const expectedRequires = [
    "tesseract.js-core/tesseract-core-relaxedsimd-lstm",
    "tesseract.js-core/tesseract-core-relaxedsimd",
    "tesseract.js-core/tesseract-core-simd-lstm",
    "tesseract.js-core/tesseract-core-simd",
    "tesseract.js-core/tesseract-core-lstm",
    "tesseract.js-core/tesseract-core",
  ];
  const selectionMatches =
    expectedRequires.every((spec) => getCoreSrc.includes(`'${spec}'`)) &&
    // Boolean-for-enum call: guarantees the non-lstm core is selected. If a
    // future tesseract.js passes the real OEM, re-derive which core to keep.
    workerIndexSrc.includes("adapter.getCore(lstmOnly") &&
    // The boolean originates here — an upstream fix could change only this
    // file (send the OEM enum under the same payload key), so it must be
    // part of the guard too.
    createWorkerSrc.includes("lstmOnly: lstmOnlyCore");
  if (!selectionMatches) {
    console.warn(
      `  Warning: tesseract.js core-selection logic changed — skipping ` +
        `tesseract.js-core prune (update pruneTesseractCores)`
    );
    return 0;
  }

  // Run the same feature detection tesseract.js runs at runtime. WASM feature
  // support depends on the Node/V8 version, not the OS, and both profiles run
  // vanilla Node 22 — same as this build script.
  let base;
  try {
    // Resolve from the workspace root: _modules/ is flat (not a node_modules
    // layout), so staged packages can't resolve their own deps here. The
    // workspace copy is the same package the staged tesseract.js was crawled
    // from, and detection depends only on this Node's V8, not on the copy.
    const rootRequire = Module.createRequire(
      path.join(ROOT_DIR, "package.json")
    );
    const { simd, relaxedSimd } = rootRequire("wasm-feature-detect");
    if (await relaxedSimd()) {
      base = "tesseract-core-relaxedsimd";
    } else if (await simd()) {
      base = "tesseract-core-simd";
    } else {
      console.warn(
        `  Warning: WASM SIMD not detected (unexpected on Node 22) — ` +
          `skipping tesseract.js-core prune`
      );
      return 0;
    }
  } catch (err) {
    console.warn(
      `  Warning: wasm-feature-detect unavailable (${err.message}) — ` +
        `skipping tesseract.js-core prune`
    );
    return 0;
  }

  const keep = new Set([`${base}.js`, `${base}.wasm`]);
  for (const file of keep) {
    if (!fs.existsSync(path.join(coreDir, file))) {
      console.warn(
        `  Warning: expected tesseract.js-core file missing: ${file} — ` +
          `skipping tesseract.js-core prune`
      );
      return 0;
    }
  }

  let reclaimed = 0;
  for (const file of await fsp.readdir(coreDir)) {
    // Matches all core loaders, .wasm binaries, and .wasm.js alternatives;
    // index.js and package.json survive.
    if (!/^tesseract-core.*\.(js|wasm)$/.test(file)) continue;
    if (keep.has(file)) continue;
    const full = path.join(coreDir, file);
    reclaimed += await pathSize(full);
    await fsp.rm(full, { force: true });
  }
  return reclaimed;
}

/**
 * SERVER PROFILE ONLY. The staged better-sqlite3 carries node-gyp compilation
 * intermediates (build/ obj.target, .o files, Makefiles — ~18 MB) and the
 * SQLite source amalgamation (deps/ — ~10 MB). At runtime lib/database.js
 * loads the addon via require('bindings')('better_sqlite3.node'), which
 * resolves build/Release/better_sqlite3.node — so the server bundle needs
 * only lib/, package.json, and build/Release/*.node.
 *
 * Do NOT apply this on the desktop profile: electron/scripts/after-pack.cjs
 * re-runs `node-gyp rebuild` on the staged copy against Electron's ABI, which
 * needs deps/, src/, and binding.gyp. The caller gates on PROFILE === "server".
 *
 * Guard: only prunes when build/Release contains at least one .node file.
 * Returns bytes reclaimed.
 */
async function pruneBetterSqliteBuildArtifacts(modulesDir) {
  const pkgDir = path.join(modulesDir, "better-sqlite3");
  if (!fs.existsSync(pkgDir)) return 0;

  const buildDir = path.join(pkgDir, "build");
  const releaseDir = path.join(buildDir, "Release");
  let releaseEntries;
  try {
    releaseEntries = await fsp.readdir(releaseDir, { withFileTypes: true });
  } catch {
    releaseEntries = [];
  }
  const hasAddon = releaseEntries.some(
    (e) => e.isFile() && e.name.endsWith(".node")
  );
  if (!hasAddon) {
    console.warn(
      `  Warning: better-sqlite3 build/Release has no .node addon — ` +
        `skipping build-artifact prune`
    );
    return 0;
  }

  let reclaimed = 0;
  async function remove(target) {
    reclaimed += await pathSize(target);
    await fsp.rm(target, { recursive: true, force: true });
  }

  await remove(path.join(pkgDir, "deps"));
  await remove(path.join(pkgDir, "src"));
  await remove(path.join(pkgDir, "binding.gyp"));
  for (const entry of await fsp.readdir(buildDir)) {
    if (entry !== "Release") await remove(path.join(buildDir, entry));
  }
  for (const entry of releaseEntries) {
    if (!(entry.isFile() && entry.name.endsWith(".node"))) {
      await remove(path.join(releaseDir, entry.name));
    }
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
 * Bundle the in-container sandbox tool server (@nodetool-ai/sandbox-agent)
 * into a single <out>/sandbox-agent.mjs. It shares the Docker image with the
 * main server and is started by an alternate entrypoint
 * (packages/sandbox-agent/docker/entrypoint.sh) instead of a separate image.
 * Its dependency closure (fastify, chrome-launcher, chrome-remote-interface,
 * zod, @nodetool-ai/{config,sandbox}) is pure JS, so everything bundles in;
 * the shared external list keeps native modules resolving from the adjacent
 * staged node_modules if they ever enter the closure.
 */
async function buildSandboxAgentBundle() {
  console.log("\nBundling sandbox tool server (sandbox-agent.mjs)...");
  if (!fs.existsSync(SANDBOX_AGENT_ENTRY_POINT)) {
    throw new Error(
      `Sandbox agent entry point not found: ${SANDBOX_AGENT_ENTRY_POINT}\n` +
        "Run 'npm run build:packages' first."
    );
  }
  await esbuild.build({
    entryPoints: [SANDBOX_AGENT_ENTRY_POINT],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: path.join(BUNDLE_DIR, "sandbox-agent.mjs"),
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
  console.log("  Wrote sandbox-agent.mjs");
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
  const canvasBytes = await pruneCanvasLibcVariants(modulesDir);
  console.log(
    `  @napi-rs/canvas libc prune reclaimed ${(canvasBytes / 1024 / 1024).toFixed(1)} MB`
  );
  const tesseractBytes = await pruneTesseractCores(modulesDir);
  console.log(
    `  tesseract.js-core prune reclaimed ${(tesseractBytes / 1024 / 1024).toFixed(1)} MB`
  );
  // Desktop keeps better-sqlite3's sources: after-pack.cjs rebuilds the addon
  // against Electron's ABI from the staged copy.
  if (PROFILE === "server") {
    const sqliteBytes = await pruneBetterSqliteBuildArtifacts(modulesDir);
    console.log(
      `  better-sqlite3 build-artifact prune reclaimed ${(sqliteBytes / 1024 / 1024).toFixed(1)} MB`
    );
  }

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
  const { PACKAGE_RUNTIME_ASSETS } = await import(pathToFileURL(registryPath).href);

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

  // --- Migration runner entry (opt-in) ---
  if (OPTIONS.withMigrate) {
    await buildMigrateBundle();
  }

  // --- Sandbox tool server entry (opt-in) ---
  if (OPTIONS.withSandboxAgent) {
    await buildSandboxAgentBundle();
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
  for (const line of verifyBackendBundle(BUNDLE_DIR, {
    requireWebgpu: PROFILE === "desktop",
  })) {
    console.log(`  ${line}`);
  }

  console.log("\nBackend bundle created successfully!");
}

main().catch((err) => {
  console.error("Failed to build backend bundle:", err);
  process.exit(1);
});
