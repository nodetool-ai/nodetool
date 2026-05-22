#!/usr/bin/env node
/**
 * Static check on the Vite-bundled Electron main process output.
 *
 * Catches the class of regression where a runtime package (sharp, openai,
 * @anthropic-ai/sdk, etc.) accidentally gets pulled into dist-electron/main.js
 * by Vite/Rollup. The packaged app then crashes at launch because Rollup's
 * @rollup/plugin-commonjs cannot satisfy the dynamic require for the
 * native binding ("Could not dynamically require ../src/build/Release/...").
 *
 * Prefer asserting that telltale strings of forbidden bundled modules are
 * NOT present, rather than parsing the JS — Rollup's renaming makes
 * function-name introspection brittle.
 *
 * Usage: node scripts/verify-bundle.mjs
 *        Exits 1 with diagnostics if any check fails.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST_ELECTRON = path.join(ELECTRON_DIR, "dist-electron");
const MAIN_JS = path.join(DIST_ELECTRON, "main.js");
const ALLOWED_BUNDLE_FILES = new Set([
  "main.js",
  "preload.js",
  "preload-workflow.js",
]);

// Markers that indicate a native module was inlined into main.js by Rollup.
// Each entry is { pattern, module, why }. We use plain substring matching for
// speed and reliability; the strings here only appear when the named module
// has been bundled — they don't show up incidentally.
const FORBIDDEN_MARKERS = [
  // sharp tries to dynamicRequire its native binding from these paths.
  { module: "sharp", pattern: "@img/sharp-darwin-" },
  { module: "sharp", pattern: "@img/sharp-linux-" },
  { module: "sharp", pattern: "@img/sharp-win32-" },
  { module: "sharp", pattern: "sharp-wasm32" },
  // Generic native binding paths — any bundled native module trips these.
  { module: "<native>", pattern: "/build/Release/better_sqlite3.node" },
  { module: "<native>", pattern: "/build/Release/keytar.node" },
  { module: "<native>", pattern: "onnxruntime_binding.node" },
];

function fail(msg) {
  console.error(`verify-bundle: ${msg}`);
  process.exit(1);
}

const main = (() => {
  try {
    return readFileSync(MAIN_JS, "utf8");
  } catch (e) {
    fail(`could not read ${MAIN_JS}: ${e.message}`);
  }
})();

function listJsFiles(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const jsFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      jsFiles.push(...listJsFiles(rootDir, entryPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }
    jsFiles.push(path.relative(rootDir, entryPath).replaceAll(path.sep, "/"));
  }

  return jsFiles;
}

const bundleFiles = (() => {
  try {
    return listJsFiles(DIST_ELECTRON);
  } catch (e) {
    fail(`could not read ${DIST_ELECTRON}: ${e.message}`);
  }
})();

const unexpectedChunks = bundleFiles.filter((name) => !ALLOWED_BUNDLE_FILES.has(name));
if (unexpectedChunks.length > 0) {
  console.error("verify-bundle: unexpected code-split chunks in dist-electron/");
  for (const name of unexpectedChunks) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nThe Electron main process must be a single main.js bundle. " +
      "Split chunks (e.g. logger-*.js) break circular imports at launch. " +
      "Set inlineDynamicImports: true and codeSplitting: false in vite.config.ts."
  );
  process.exit(1);
}

const leaked = FORBIDDEN_MARKERS.filter(({ pattern }) => main.includes(pattern));

if (leaked.length > 0) {
  const groups = new Map();
  for (const { module, pattern } of leaked) {
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push(pattern);
  }
  console.error("verify-bundle: forbidden modules detected in dist-electron/main.js");
  for (const [module, patterns] of groups) {
    console.error(`  ${module}:`);
    for (const p of patterns) console.error(`    - ${p}`);
  }
  console.error(
    "\nThis means a runtime package leaked into the Electron main bundle. " +
    "Add the package to mainExternalModules in vite.config.ts, or import " +
    "from a narrower subpath that doesn't pull the heavy module in."
  );
  process.exit(1);
}

const sizeMB = (Buffer.byteLength(main) / 1048576).toFixed(2);
console.log(`verify-bundle: dist-electron/main.js OK (${sizeMB} MB, no forbidden markers)`);

// --- webgpu (dawn.node) staging check ---
// The server-side GPU compositor loads `webgpu` via a variable-specifier
// dynamic import, so esbuild can't see it. It must be copied to _modules/ or
// the packaged compositor fails with "requires the optional 'webgpu' package".
//
// This check only runs when backend-bundle/_modules/ already exists (i.e.
// after prepare-backend). vite:build and the `build` script both invoke
// verify-bundle BEFORE prepare-backend, so guard to avoid a spurious failure.
{
  const webgpuDist = path.join(
    ELECTRON_DIR,
    "backend-bundle",
    "_modules",
    "webgpu",
    "dist"
  );
  let dawnFiles = [];
  try {
    dawnFiles = readdirSync(webgpuDist).filter((f) => f.endsWith(".dawn.node"));
  } catch {
    // backend-bundle/_modules/ not present yet — prepare-backend hasn't run.
    // Skip the check rather than failing a step that runs before staging.
    const backendBundle = path.join(ELECTRON_DIR, "backend-bundle", "_modules");
    let bundleExists = false;
    try {
      readdirSync(backendBundle);
      bundleExists = true;
    } catch {
      bundleExists = false;
    }
    if (bundleExists) {
      fail(
        `webgpu not staged: ${webgpuDist} missing. Add "webgpu" to EXTERNAL_PACKAGES in bundle-backend.mjs.`
      );
    } else {
      console.log("verify-bundle: webgpu staging check skipped (backend-bundle not yet present)");
    }
    dawnFiles = null; // signal skip
  }
  if (dawnFiles !== null) {
    if (dawnFiles.length === 0) {
      fail(`webgpu staged but no *.dawn.node binary found in ${webgpuDist}`);
    }
    console.log(`verify-bundle: webgpu staged with ${dawnFiles.length} dawn.node binary(ies)`);
  }
}
