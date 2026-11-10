// Resources the build keeps out of the bundle. Plugins add files here, and
// build.mjs writes them to <dir>/<stem>.assets/, the directory the runner
// grants as `__host.bundleAssets` (HostOptions::bundleAssetsDir). Guest code
// reads each one on first use through host/bundle-assets.mjs.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const files = new Map();
let enabled = false;

// Only guest/build.mjs writes the directory. Other builds (the unit test
// bundles) keep every resource inline.
export function enableBundleAssets() {
  enabled = true;
}

export function bundleAssetsEnabled() {
  return enabled;
}
const runtime = fileURLToPath(new URL("./host/bundle-assets.mjs", import.meta.url));

// Adds `bytes` under `name` (a relative path) and returns the name.
export function addBundleAsset(name, bytes) {
  const previous = files.get(name);
  if (previous && !previous.equals(bytes)) throw new Error(`bundle asset ${name} has two contents`);
  files.set(name, Buffer.from(bytes));
  return name;
}

export function bundleAssetsDir(outfile) {
  return join(dirname(outfile), `${basename(outfile, extname(outfile))}.assets`);
}

// Replaces the directory with the collected files.
export function writeBundleAssets(outfile) {
  const dir = bundleAssetsDir(outfile);
  rmSync(dir, { recursive: true, force: true });
  for (const [name, bytes] of files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), bytes);
  }
  return { dir, count: files.size, bytes: [...files.values()].reduce((n, b) => n + b.length, 0) };
}

const TIKTOKEN_ENCODINGS = ["gpt2", "r50k_base", "p50k_base", "p50k_edit", "cl100k_base", "o200k_base"];

// text-encoding's multi-byte encoding tables, parsed when a decoder first
// needs one. UTF-8, UTF-16 and the single-byte encodings use none.
export function lazyEncodingIndexesPlugin() {
  return {
    name: "lazy-encoding-indexes",
    setup(b) {
      if (!enabled) return;
      b.onLoad({ filter: /[\\/]text-encoding[\\/]lib[\\/]encoding-indexes\.js$/ }, (args) => {
        const tables = createRequire(args.path)(args.path)["encoding-indexes"];
        if (!tables || typeof tables !== "object") throw new Error(`text-encoding: ${args.path} no longer exports encoding-indexes`);
        // encoding.js indexes every single-byte table at load, and they
        // are small, so those stay inline. The multi-byte tables move out.
        const inline = {};
        for (const [key, table] of Object.entries(tables)) {
          if (!/^[\w-]+$/.test(key)) throw new Error(`text-encoding: unexpected table name ${key}`);
          if (Array.isArray(table) && table.length <= 128) {
            inline[key] = table;
          } else {
            addBundleAsset(`text-encoding/${key}.json`, Buffer.from(JSON.stringify(table)));
          }
        }
        return {
          // CommonJS, because encoding.js requires it. The banner runs before
          // any import, so it reads __host directly. Each table is its own
          // file, parsed the first time a decoder indexes it.
          contents: `const loaded = new Map(Object.entries(${JSON.stringify(inline)}));
const names = new Set(${JSON.stringify(Object.keys(tables))});
const load = (key) => {
  if (!loaded.has(key)) {
    const assets = globalThis.__host?.bundleAssets;
    if (!assets?.available()) throw new Error("text-encoding: the runner has no bundle assets directory for the legacy encoding tables");
    loaded.set(key, JSON.parse(assets.readText("text-encoding/" + key + ".json")));
  }
  return loaded.get(key);
};
module.exports = { "encoding-indexes": new Proxy({}, {
  get: (_, key) => (names.has(key) ? load(key) : undefined),
  has: (_, key) => names.has(key),
}) };`,
          loader: "js",
        };
      });
    },
  };
}

// The tiktoken ranks, the Rapier WebAssembly module and nothing else that a
// node needs at load. The font corpus is in host/canvas-build.mjs.
export function bundleAssetPlugins() {
  return [
    lazyEncodingIndexesPlugin(),
    {
      name: "bundle-assets",
      setup(b) {
        if (!enabled) return;
        // js-tiktoken's index inlines every encoding's ranks. Read one when
        // an encoder for it is made.
        b.onLoad({ filter: /[\\/]js-tiktoken[\\/]dist[\\/]index\.js$/ }, async (args) => {
          const dir = dirname(args.path);
          const source = readFileSync(args.path, "utf8");
          const chunk = /from '(\.\/chunk-[\w-]+\.js)'/.exec(source)?.[1];
          if (!chunk) throw new Error(`js-tiktoken: ${args.path} no longer imports its chunk`);
          const require = createRequire(args.path);
          for (const name of TIKTOKEN_ENCODINGS) {
            const ranks = require(join(dir, "ranks", `${name}.cjs`));
            addBundleAsset(`tiktoken/${name}.json`, Buffer.from(JSON.stringify(ranks.default ?? ranks)));
          }
          return {
            contents: `
import { never, Tiktoken, getEncodingNameForModel } from ${JSON.stringify(chunk)};
import { readBundleText } from ${JSON.stringify(runtime)};
export { Tiktoken, getEncodingNameForModel };
const NAMES = ${JSON.stringify(TIKTOKEN_ENCODINGS)};
export function getEncoding(encoding, extendSpecialTokens) {
  if (!NAMES.includes(encoding)) { never(encoding); throw new Error("Unknown encoding"); }
  return new Tiktoken(JSON.parse(readBundleText("tiktoken/" + encoding + ".json")), extendSpecialTokens);
}
export function encodingForModel(model, extendSpecialTokens) {
  return getEncoding(getEncodingNameForModel(model), extendSpecialTokens);
}`,
            loader: "js",
            resolveDir: dir,
          };
        });
        // rapier3d-compat inlines its WebAssembly module as base64.
        b.onLoad({ filter: /[\\/]rapier3d-compat[\\/]rapier\.mjs$/ }, (args) => {
          const source = readFileSync(args.path, "utf8");
          const pattern = /[A-Za-z_$][\w$]*\.toByteArray\("(AGFzbQ[A-Za-z0-9+/=]+)"\)/g;
          const found = [...source.matchAll(pattern)];
          if (found.length !== 1) throw new Error(`rapier: ${args.path} has ${found.length} inlined modules, expected 1`);
          const name = addBundleAsset("rapier/rapier3d.wasm", Buffer.from(found[0][1], "base64"));
          return {
            contents: `import { readBundleAsset as __readBundleAsset } from ${JSON.stringify(runtime)};\n` +
              source.replace(found[0][0], () => `__readBundleAsset(${JSON.stringify(name)})`),
            loader: "js",
            resolveDir: dirname(args.path),
          };
        });
      },
    },
  ];
}
