/**
 * esbuild-based hybrid bundler for the Electron backend.
 *
 * Produces:
 *   backend-bundle/server.mjs          — single bundled ESM entry point
 *   backend-bundle/server.mjs.map      — source map
 *   backend-bundle/_modules/           — external packages staged for afterPack
 *   backend-bundle/package.json        — { "type": "module" }
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

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ELECTRON_DIR = path.resolve(__dirname, "..");
const BUNDLE_DIR = path.join(ELECTRON_DIR, "backend-bundle");
const ENTRY_POINT = path.join(
  ROOT_DIR,
  "packages",
  "websocket",
  "dist",
  "server.js"
);

// ---------------------------------------------------------------------------
// External allowlist — packages that stay out of the bundle
// ---------------------------------------------------------------------------

// Packages that MUST be found and copied — build fails if any are missing.
const REQUIRED_EXTERNAL_PACKAGES = [
  "sharp",
  "better-sqlite3",
  "@jitl/quickjs-ng-wasmfile-release-sync",
  "webgpu",
];

const EXTERNAL_PACKAGES = [
  // Native modules (contain .node binaries)
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  "@img/sharp-*",
  "node-web-audio-api",
  "keytar",
  "onnxruntime-node",
  "webgpu",

  // Native optional deps (loaded by bundleable packages)
  "msgpackr",
  "msgpackr-extract",
  "@msgpackr-extract/*",
  "bufferutil",
  "utf-8-validate",

  // Large optional packages (dynamic await import())
  "playwright",
  "playwright-core",
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
  "@aws-sdk/*",
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

// Packages that esbuild should treat as external (to avoid bundling .node binaries)
// but that should NOT be copied to _modules/ — they are loaded optionally at runtime
// with a try/catch fallback (e.g. linkedom falls back to its canvas shim if canvas
// is unavailable). Copying these would trigger a node-gyp rebuild on Linux CI.
const ESBUILD_ONLY_EXTERNAL_PACKAGES = [
  "canvas",
];
const esbuildOnlyExternalSet = new Set(ESBUILD_ONLY_EXTERNAL_PACKAGES);

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Building hybrid backend bundle with esbuild...\n");

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
    external: [...EXTERNAL_PACKAGES, ...ESBUILD_ONLY_EXTERNAL_PACKAGES],
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
