/**
 * Build the pack's guest modules from `packages/dsl/src/flow`.
 *
 * The flow surface is TypeScript whose only runtime import is
 * `../guest-core.js`; every type in a signature is erased. So the build is a
 * per-file transform, not a bundle: one guest module per namespace, all of them
 * sharing the one `guest-core.js` this build ships from
 * `packages/dsl/src/flow/guest-core.ts`. Bundling instead would inline that
 * core — and the capability import behind it — into all 69 entries.
 *
 * The manifest's `sandboxModules` list is written from the same pass, so the
 * pack cannot declare a module it did not build.
 *
 *   node packages/sandbox-packs/sandbox-flow/scripts/build.mjs
 *   node packages/sandbox-packs/sandbox-flow/scripts/build.mjs --check
 *
 * `--check` writes nothing and exits non-zero when the built output differs
 * from what is committed. The pack carries its own copy of the flow surface, so
 * it can rot against `packages/dsl` — and this copy is what agents author
 * against.
 */

import { createRequire } from "node:module";
import { readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
/** @type {import("esbuild")} */
const esbuild = require("esbuild");

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "..");
const flowSource = join(packDir, "..", "..", "dsl", "src", "flow");
const generatedSource = join(flowSource, "generated");
const generatedOut = join(packDir, "sandbox", "generated");

const banner = "// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit\n";

const check = process.argv.includes("--check");

/** Built files, path → contents. Written at the end, or compared under --check. */
const outputs = new Map();
/** Paths that differ from what is on disk. */
const stale = [];

function emit(path, contents) {
  outputs.set(path, contents);
  if (!check) return;
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // Missing counts as stale, reported by the null comparison below.
  }
  if (current !== contents) stale.push(path);
}

async function transform(file, sourcefile) {
  const built = await esbuild.transform(readFileSync(file, "utf8"), {
    loader: "ts",
    format: "esm",
    target: "es2022",
    sourcefile
  });
  return `${banner}${built.code}`;
}

if (!check) {
  rmSync(generatedOut, { recursive: true, force: true });
  mkdirSync(generatedOut, { recursive: true });
}

const core = await transform(join(flowSource, "guest-core.ts"), "guest-core.ts");
emit(join(packDir, "sandbox", "guest-core.js"), core);

const sources = readdirSync(generatedSource)
  .filter((file) => file.endsWith(".ts"))
  .sort();

const modules = [];
let bytes = 0;
for (const file of sources) {
  const stem = file.replace(/\.ts$/, "");
  const code = await transform(join(generatedSource, file), file);
  emit(join(generatedOut, `${stem}.js`), code);
  bytes += Buffer.byteLength(code, "utf8");
  modules.push({ name: stem, kind: "js", file: `sandbox/generated/${stem}.js` });
}

modules.sort((left, right) => (left.name < right.name ? -1 : 1));
// The root is hand-written: it re-exports the core's untyped `callNode` under
// the pack's own name, which no generated namespace can do.
modules.unshift({ name: ".", kind: "js", file: "sandbox/index.js" });

const manifestPath = join(packDir, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.nodetool.sandboxModules = modules;
// The core is a sibling every namespace imports, not a module anyone declares.
manifest.nodetool.internal = ["sandbox/guest-core.js"];
emit(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (check) {
  if (stale.length > 0) {
    console.error(
      `sandbox-flow is stale — ${stale.length === 1 ? "1 file differs" : `${stale.length} files differ`} from @nodetool-ai/dsl:`
    );
    for (const path of stale.slice(0, 10)) console.error(`  ${path}`);
    if (stale.length > 10) console.error(`  … and ${stale.length - 10} more`);
    console.error("Run `npm run build:sandbox-flow` and commit the result.");
    process.exit(1);
  }
  console.log(`sandbox-flow is up to date (${modules.length} modules).`);
} else {
  for (const [path, contents] of outputs) writeFileSync(path, contents);
}

console.log(
  `${modules.length} modules, ${bytes} bytes of generated JavaScript, ${Buffer.byteLength(core, "utf8")} bytes of core`
);
