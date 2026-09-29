/**
 * A synchronous, Jest-only stand-in for `yoga-layout` that computes REAL
 * layouts — not a mock that skips the math.
 *
 * `yoga-layout` is ESM-only with a top-level `await` (`index.js` does
 * `await loadYoga()`), which Jest's CJS-based transform pipeline cannot load
 * at all: `require("yoga-layout")` throws `SyntaxError: Cannot use import
 * statement outside a module`, and even Node's own native `require(esm)`
 * support explicitly refuses a module containing top-level await
 * (`ERR_REQUIRE_ASYNC_MODULE`) — there is no way to `require()` it as-is.
 *
 * The actual WASM compile/instantiate step doesn't need to be async at all
 * in Node (unlike a browser main thread, Node has no size limit on
 * synchronous `WebAssembly.Instance`), and Emscripten's own glue exposes the
 * sanctioned extension point for exactly this: `Module.instantiateWasm`. So
 * this file:
 *   1. Loads yoga-layout's three ESM sub-modules that do NOT contain a
 *      top-level await (the wasm glue, `wrapAssembly.js`, the generated
 *      enums) by stripping their `import`/`export`/`import.meta` syntax with
 *      Babel's own commonjs-module transform and evaluating the result —
 *      `index.js`/`load.js` (which DO await) are never touched.
 *   2. Extracts the wasm module's embedded base64 payload directly from the
 *      glue source (the same string the glue itself would otherwise fetch)
 *      and instantiates it synchronously via `instantiateWasm`.
 *   3. Feeds the now-synchronously-populated module object into the same
 *      `wrapAssembly` the real package uses, producing the same `Yoga`
 *      object `import Yoga from "yoga-layout"` would.
 *
 * Wired in jest.config.ts via `moduleNameMapper` for `^yoga-layout$`. Not
 * shipped product code — Jest-only test infrastructure.
 */
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

function findYogaLayoutRoot() {
  // `yoga-layout` is hoisted to the repo root's node_modules (verified via
  // `npm explain yoga-layout`); walk up from this file rather than trying to
  // `require.resolve("yoga-layout")`, which would recurse back into this
  // same moduleNameMapper entry.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "node_modules", "yoga-layout");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "yogaLayoutSync.cjs: could not find yoga-layout under any ancestor node_modules of " +
      __dirname
  );
}

function loadEsmSubmoduleAsCjs(absPath) {
  const source = fs
    .readFileSync(absPath, "utf8")
    // Only use of `import.meta` here is `_scriptDir`, irrelevant to a
    // base64-embedded wasm payload with no script-relative fetch.
    .replace(/import\.meta\.url/g, '""');
  const { code } = babel.transform(source, {
    filename: absPath,
    babelrc: false,
    configFile: false,
    plugins: ["@babel/plugin-transform-modules-commonjs"]
  });
  const mod = { exports: {} };
  const requireFromHere = (specifier) =>
    specifier.startsWith(".")
      ? loadEsmSubmoduleAsCjs(path.resolve(path.dirname(absPath), specifier))
      : require(specifier);
  // eslint-disable-next-line no-new-func
  const run = new Function("module", "exports", "require", "__filename", "__dirname", code);
  run(mod, mod.exports, requireFromHere, absPath, path.dirname(absPath));
  return mod.exports;
}

function loadYogaSync() {
  const yogaRoot = findYogaLayoutRoot();
  const wasmGluePath = path.join(yogaRoot, "dist", "binaries", "yoga-wasm-base64-esm.js");
  const wrapAssemblyPath = path.join(yogaRoot, "dist", "src", "wrapAssembly.js");
  const enumsPath = path.join(yogaRoot, "dist", "src", "generated", "YGEnums.js");

  const loadYogaFactory = loadEsmSubmoduleAsCjs(wasmGluePath).default;

  const glueSource = fs.readFileSync(wasmGluePath, "utf8");
  const match = glueSource.match(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/);
  if (!match) {
    throw new Error("yogaLayoutSync.cjs: could not find the embedded wasm payload in yoga-layout's glue file.");
  }
  const wasmModule = new WebAssembly.Module(Buffer.from(match[1], "base64"));

  // Emscripten's sanctioned synchronous-instantiation hook: called
  // synchronously, in-line, during `loadYogaFactory(options)` itself — by
  // the time that call returns, `options` (the same object, mutated in
  // place) already carries the populated wasm exports.
  const options = {
    instantiateWasm(imports, successCallback) {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      successCallback(instance);
      return instance.exports;
    }
  };
  loadYogaFactory(options);
  if (!options.asm) {
    throw new Error("yogaLayoutSync.cjs: synchronous wasm instantiation did not populate asm exports.");
  }

  const wrapAssembly = loadEsmSubmoduleAsCjs(wrapAssemblyPath).default;
  const yoga = wrapAssembly(options);

  // The real package's `index.js` is `export default Yoga; export * from
  // "./generated/YGEnums.js";` — two SEPARATE export sources at the module
  // level (`Yoga` the wrapped lib, `Align`/`Direction`/... the plain TS
  // enums), not one merged object. Reproduce that shape here: named enum
  // exports live directly on `module.exports`, the wrapped lib under
  // `.default`. (The enums module's OWN `default` export — a `constants`
  // object of `ALIGN_AUTO`-style names — is dropped; nothing here imports
  // it, matching what `export *` does with a re-exported default.)
  const enumsExports = loadEsmSubmoduleAsCjs(enumsPath);
  const named = { ...enumsExports };
  delete named.default;
  // `__esModule: true` so TS's `__importDefault` interop helper (ts-jest's
  // compiled output for `import Yoga, {...} from "yoga-layout"`) returns
  // this object as-is instead of re-wrapping it as `{default: <this
  // object>}` — which would bury `Yoga.Node` an extra `.default` deep.
  return { ...named, default: yoga, __esModule: true };
}

let cached;
function getYoga() {
  if (!cached) cached = loadYogaSync();
  return cached;
}

module.exports = getYoga();
