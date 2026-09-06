import { defineConfig, type Plugin } from "vite";
import type { Plugin as EsbuildPlugin } from "esbuild";
import { resolve } from "node:path";

/**
 * Vite config for the workflow-runner browser E2E test harness.
 *
 * Imports the kernel + a small inline executor map. The kernel pulls
 * `@nodetool-ai/config` which statically imports `node:fs` / `node:os`
 * / `node:path` / `node:url` for non-browser code paths; {@link SPECIFIER_STUBS}
 * maps those builtins to a stub that exposes the named exports those modules
 * destructure. The stubs throw on call but browser-tagged execution never
 * reaches them.
 */
const STUBS = resolve(import.meta.dirname, "stubs");

/** Node builtins the harness answers with a stub, keyed by bare name. */
const BUILTIN_STUBS: Record<string, string> = {
  "fs/promises": `${STUBS}/fs-promises-stub.js`,
  fs: `${STUBS}/fs-stub.js`,
  path: `${STUBS}/path-stub.js`,
  url: `${STUBS}/url-stub.js`,
  crypto: `${STUBS}/crypto-stub.js`,
  os: `${STUBS}/os-stub.js`,
  events: `${STUBS}/events-stub.js`,
  child_process: `${STUBS}/child-process-stub.js`,
  worker_threads: `${STUBS}/empty.js`,
  cluster: `${STUBS}/empty.js`,
  dgram: `${STUBS}/empty.js`,
  dns: `${STUBS}/empty.js`,
  net: `${STUBS}/empty.js`,
  tls: `${STUBS}/empty.js`,
  zlib: `${STUBS}/empty.js`,
  http: `${STUBS}/empty.js`,
  https: `${STUBS}/empty.js`,
  http2: `${STUBS}/empty.js`,
  perf_hooks: `${STUBS}/empty.js`,
  vm: `${STUBS}/empty.js`,
  // Not empty: memfs — pulled in by the QuickJS sandbox behind the Code node —
  // subclasses stream.Readable/Writable at module scope, and an undefined
  // super constructor throws while the chunk evaluates.
  stream: `${STUBS}/stream-stub.js`,
  util: `${STUBS}/empty.js`,
  // Not empty either: the QuickJS wrapper touches Buffer at module load.
  buffer: `${STUBS}/buffer-stub.js`,
  assert: `${STUBS}/empty.js`,
  process: `${STUBS}/empty.js`,
  async_hooks: `${STUBS}/empty.js`,
  module: `${STUBS}/empty.js`
};

/**
 * Builtins stubbed for their **bare** specifier too, not just `node:x`.
 *
 * A bare builtin name is not a builtin to a bundler — it resolves against
 * `node_modules` first, and whatever it finds wins. `pptxgenjs` depends on an
 * empty squatter package literally named `https` (one package.json, a `main`
 * pointing at a file that does not exist), so esbuild resolved the
 * `import('https')` inside `@opentelemetry/otlp-exporter-base` to it and the
 * dep optimizer died with "Failed to resolve entry for package". That killed
 * pre-bundling outright: every module request answered 504 and all 27 specs
 * timed out waiting for the harness page to boot.
 *
 * The browserify-shim names — `buffer`, `events`, `stream`, `util`,
 * `process`, `assert`, `url`, `crypto`, `path` — stay off this list on
 * purpose. `buffer-stub.js` imports the real npm `buffer`, and
 * `stream-stub.js` pulls `readable-stream`, which reaches npm `events`,
 * `string_decoder` and `buffer` by bare name. Stubbing those bare specifiers
 * would make the stubs import themselves.
 */
const BARE_STUBBED = new Set([
  "fs/promises",
  "fs",
  "os",
  "child_process",
  "worker_threads",
  "cluster",
  "dgram",
  "dns",
  "net",
  "tls",
  "zlib",
  "http",
  "https",
  "http2",
  "perf_hooks",
  "vm",
  "async_hooks",
  "module"
]);

/**
 * npm packages — not builtins — that are Node-only *at module scope*, so
 * having one in a browser graph throws before any code calls into it.
 *
 * `@openclaw/fs-safe` backs `@nodetool-ai/storage`'s `FileStorageAdapter`.
 * Its native-binding loader builds a `createRequire` and reads `process.env`
 * while the module evaluates; both fail in a browser and took the harness
 * entry down with them. Nothing here ever constructs that adapter — a
 * browser has no local directory — so the stub throws on use.
 */
const PACKAGE_STUBS: Record<string, string> = {
  "@openclaw/fs-safe": `${STUBS}/fs-safe-stub.js`
};

/**
 * Every specifier form that maps to a stub. Insertion order matters: Vite's
 * alias matches a string `find` as a path prefix, so `fs/promises` has to be
 * offered before `fs`.
 */
const SPECIFIER_STUBS: Record<string, string> = {};
for (const [name, stub] of Object.entries(BUILTIN_STUBS)) {
  SPECIFIER_STUBS[`node:${name}`] = stub;
  if (BARE_STUBBED.has(name)) SPECIFIER_STUBS[name] = stub;
}
Object.assign(SPECIFIER_STUBS, PACKAGE_STUBS);

const STUB_SPECIFIER_FILTER = new RegExp(
  `^(${Object.keys(SPECIFIER_STUBS)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .join("|")})$`
);

/**
 * The esbuild counterpart of {@link stubNodeProtocolPlugin}, for Vite's
 * dependency pre-bundle. That pass is a separate esbuild run whose resolution
 * does not go through `resolve.alias` or the `resolveId` hooks below, so
 * `@sebastianwessel/quickjs` would otherwise get its `node:buffer` import
 * externalized and throw the moment it touches `Buffer` at module load.
 */
function stubNodeBuiltinsEsbuildPlugin(): EsbuildPlugin {
  return {
    name: "stub-node-builtins-esbuild",
    setup(build) {
      build.onResolve({ filter: STUB_SPECIFIER_FILTER }, (args) => {
        const stub = SPECIFIER_STUBS[args.path];
        return stub ? { path: stub } : undefined;
      });
    }
  };
}

/**
 * Vite's built-in `resolve.alias` doesn't intercept `node:*` protocol
 * imports — they bypass the alias plugin and hit the default resolver
 * which complains. This plugin maps them to our hand-rolled stubs at
 * the resolveId stage, before any other plugin gets a chance.
 */
function stubNodeProtocolPlugin(): Plugin {
  return {
    name: "stub-node-protocol",
    enforce: "pre",
    resolveId(source) {
      const stub = SPECIFIER_STUBS[source];
      if (stub) return stub;
      return null;
    }
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [stubNodeProtocolPlugin()],
  // No `process` define on purpose: the real web app doesn't shim `process`,
  // so neither should this harness. Browser-portable code must gate on
  // `typeof process !== "undefined"` (see ProcessingContext's safeProcessEnv).
  resolve: {
    alias: Object.entries(SPECIFIER_STUBS).map(([find, replacement]) => ({
      find,
      replacement
    }))
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: { plugins: [stubNodeBuiltinsEsbuildPlugin()] },
    exclude: [
      "@nodetool-ai/base-nodes",
      "@nodetool-ai/core-nodes",
      "@nodetool-ai/workflow-runner",
      "@nodetool-ai/node-sdk",
      "@nodetool-ai/runtime",
      "@nodetool-ai/kernel",
      "@nodetool-ai/protocol",
      "@nodetool-ai/agents",
      "@nodetool-ai/config",
      "@nodetool-ai/models",
      "@nodetool-ai/code-nodes",
      // The QuickJS engine locates its `.wasm` with
      // `new URL("emscripten-module.wasm", import.meta.url)`. Pre-bundling
      // moves the emscripten module into the dep cache directory without
      // moving the `.wasm` next to it, so that URL points at a file the dev
      // server does not have and the HTML fallback answers instead — the guest
      // then compiles `<!do…` and aborts with "expected magic word". Excluded,
      // the module is served from its own directory and the URL resolves.
      "@jitl/quickjs-ng-wasmfile-release-sync",
      "quickjs-emscripten-core"
    ],
    // Nothing imports mediabunny statically — the `video.*` bridge behind the
    // Code node reaches it only once a test calls it. Vite would then discover
    // it mid-run, re-optimize, and reload the page out from under
    // `page.evaluate`, which surfaces as "Execution context was destroyed".
    // Only the first (cold) run is affected, which is every CI run.
    include: ["mediabunny"]
  },
  server: {
    port: 5179,
    strictPort: true,
    host: "127.0.0.1"
  }
});
