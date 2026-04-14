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
import { fileURLToPath } from "url";

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
];

const EXTERNAL_PACKAGES = [
  // Native modules (contain .node binaries)
  "better-sqlite3",
  "sqlite-vec",
  "sharp",
  "@img/sharp-*",
  "node-web-audio-api",
  "keytar",

  // Native optional deps (loaded by bundleable packages)
  "msgpackr",
  "msgpackr-extract",
  "@msgpackr-extract/*",
  "bufferutil",
  "utf-8-validate",

  // Large optional packages (dynamic await import())
  "playwright",
  "playwright-core",
  "tesseract.js",
  "tesseract.js-core",
  "pdfjs-dist",
  "chartjs-node-canvas",
  "canvas",
  "@napi-rs/canvas",
  "chart.js",

  // Cloud/optional services (dynamic import via variable + webpackIgnore)
  "@aws-sdk/*",
  "@supabase/supabase-js",

  // Telemetry (conditionally loaded)
  "@opentelemetry/sdk-node",
  "@opentelemetry/resources",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/exporter-trace-otlp-proto",
  "@opentelemetry/semantic-conventions",
  "@traceloop/node-server-sdk",

  // MCP SDK (deep-path imports like /server/mcp.js)
  "@modelcontextprotocol/sdk",

  // CJS packages with __dirname-relative file reads at runtime
  "jsdom",

  // Sandboxed code execution (native addon, optional)
  "isolated-vm",

  // CJS require() packages
  "openai",
  "ssh2",
  "cpu-features",
];

// ---------------------------------------------------------------------------
// esbuild plugin: resolve workspace subpath imports
// ---------------------------------------------------------------------------

const resolveWorkspaceSubpathPlugin = {
  name: "resolve-workspace-subpath",
  setup(build) {
    build.onResolve({ filter: /^@nodetool\/models\/secret$/ }, () => ({
      path: path.resolve(ROOT_DIR, "packages", "models", "dist", "secret.js"),
    }));
  },
};

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
    external: EXTERNAL_PACKAGES,
    metafile: true,
    sourcemap: "external",
    banner: {
      js: [
        'import { createRequire } from "node:module";',
        "const require = createRequire(import.meta.url);",
      ].join("\n"),
    },
    plugins: [resolveWorkspaceSubpathPlugin],
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

  // --- Copy manifest JSON files next to server.mjs ---
  // These packages use `dirname(fileURLToPath(import.meta.url))` at runtime,
  // which resolves to the bundle directory when bundled, so the manifests
  // must live alongside server.mjs.
  const manifests = [
    ["kie-nodes", "kie-manifest.json"],
    ["replicate-nodes", "replicate-manifest.json"],
    ["fal-nodes", "fal-manifest.json"],
  ];
  for (const [pkg, file] of manifests) {
    const src = path.join(ROOT_DIR, "packages", pkg, "dist", file);
    const dest = path.join(BUNDLE_DIR, file);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, dest);
    } else {
      console.warn(`  Warning: manifest not found, skipping: ${src}`);
    }
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
  console.log("\nBackend bundle created successfully!");
}

main().catch((err) => {
  console.error("Failed to build backend bundle:", err);
  process.exit(1);
});
