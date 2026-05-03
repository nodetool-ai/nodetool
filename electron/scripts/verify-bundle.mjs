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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ELECTRON_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAIN_JS = path.join(ELECTRON_DIR, "dist-electron", "main.js");

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
