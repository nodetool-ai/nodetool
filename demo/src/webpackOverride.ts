/**
 * Webpack override that lets Remotion bundle the real NodeTool web components.
 *
 * Mirrors the two things web/vite.config.ts does to make `@nodetool-ai/*` and
 * the node UI bundle for the browser:
 *
 *  1. Resolve the `nodetool-dev` export condition, so `@nodetool-ai/*` packages
 *     resolve to their TypeScript sources (no dist build step needed).
 *  2. Stub Node built-ins that the kernel/runtime statically reference for their
 *     server code paths but the browser-tagged render never executes. We reuse
 *     the exact stub files from web/vite-node-stubs so behavior matches the app.
 *
 * If a render fails on a server-only module (e.g. an OpenTelemetry exporter or a
 * gRPC package pulled in transitively), add its specifier to `IGNORE` below.
 */
import path from "node:path";
import type { WebpackOverrideFn } from "@remotion/bundler";

// Remotion loads remotion.config.ts (which imports this file) as CJS, so
// `import.meta.url` is unavailable. Anchor on the demo project root instead —
// Remotion always runs with cwd at this directory (see package.json scripts).
const DEMO_ROOT = process.cwd();
const STUBS = path.resolve(DEMO_ROOT, "../web/vite-node-stubs");
const PKGS = path.resolve(DEMO_ROOT, "../packages");
/** Runtime target for the `@web-demo` facade (typed via tsconfig paths). */
const WEB_DEMO_ENTRY = path.resolve(DEMO_ROOT, "../web/src/demo/index.ts");

/**
 * Generated pricing JSON aliased as bare specifiers, mirroring web/vite.config.ts.
 * The web code imports these as modules (declared ambiently in web/src/fal-*.d.ts).
 */
const GENERATED_JSON: Record<string, string> = {
  "@nodetool/fal-node-type-pricing": "fal-nodes/src/generated/fal-node-type-pricing.json",
  "@nodetool/fal-unit-pricing-catalog": "fal-nodes/src/generated/fal-unit-pricing.json",
  "@nodetool/kie-node-type-pricing": "kie-nodes/src/generated/kie-node-type-pricing.json",
  "@nodetool/kie-unit-pricing-catalog": "kie-nodes/src/generated/kie-unit-pricing.json",
};

/** Built-in → stub file (browser-safe partial implementations). */
const STUBBED: Record<string, string> = {
  "fs/promises": "fs-promises-stub.js",
  fs: "fs-stub.js",
  path: "path-stub.js",
  url: "url-stub.js",
  crypto: "crypto-stub.js",
  os: "os-stub.js",
  events: "events-stub.js",
  child_process: "child-process-stub.js",
};

/** Built-ins with no API surface the browser path needs → empty module. */
const EMPTIED = [
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
  "stream",
  "async_hooks",
  "util",
  "buffer",
  "assert",
  "process",
  "module",
];

/** Server-only specifiers to resolve to an empty module if they appear. */
const IGNORE = [
  "@nodetool-ai/runtime/tracing",
];

function buildAlias(): Record<string, string> {
  const empty = path.join(STUBS, "empty.js");
  const alias: Record<string, string> = {
    // Route the typed facade to the real web source at bundle time.
    "@web-demo$": WEB_DEMO_ENTRY,
  };

  for (const [name, file] of Object.entries(STUBBED)) {
    const target = path.join(STUBS, file);
    // Match both the `node:` protocol and bare specifier, exactly.
    alias[`node:${name}$`] = target;
    alias[`${name}$`] = target;
  }
  for (const name of EMPTIED) {
    alias[`node:${name}$`] = empty;
    alias[`${name}$`] = empty;
  }
  for (const spec of IGNORE) {
    alias[`${spec}$`] = spec === "@nodetool-ai/runtime/tracing"
      ? path.join(STUBS, "tracing-stub.js")
      : empty;
  }
  for (const [spec, rel] of Object.entries(GENERATED_JSON)) {
    alias[`${spec}$`] = path.join(PKGS, rel);
  }
  return alias;
}

/**
 * esbuild target for the loader. Remotion defaults to `chrome85`, which rejects
 * top-level await (used by `@nodetool-ai/config`). The render runs in a modern
 * headless Chrome, so bump it to a TLA-capable target.
 */
const ESBUILD_TARGET = "chrome109";

interface LoaderUse {
  loader?: string;
  options?: Record<string, unknown>;
}

/** Mutate Remotion's esbuild-loader rules in place to use a modern target. */
function bumpEsbuildTargets(rules: unknown[]): void {
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const use = (rule as { use?: unknown }).use;
    if (!Array.isArray(use)) continue;
    for (const entry of use) {
      if (!entry || typeof entry !== "object") continue;
      const u = entry as LoaderUse;
      if (typeof u.loader === "string" && u.loader.includes("esbuild-loader") && u.options) {
        u.options = { ...u.options, target: ESBUILD_TARGET };
      }
    }
  }
}

export const webpackOverride: WebpackOverrideFn = (config) => {
  const resolve = config.resolve ?? {};
  const existingConditions = resolve.conditionNames ?? ["...", "browser"];
  const existingRules = config.module?.rules ?? [];
  bumpEsbuildTargets(existingRules as unknown[]);
  return {
    ...config,
    // Top-level await (used by @nodetool-ai/config) needs webpack's experiment
    // enabled in addition to a TLA-capable esbuild target (see bumpEsbuildTargets).
    experiments: { ...config.experiments, topLevelAwait: true },
    module: {
      ...config.module,
      rules: [
        ...existingRules,
        // Web imports icons as React components via Vite's svgr query
        // (`import Icon from "./x.svg?react"`). Webpack needs @svgr/webpack to
        // match the same `?react` resource query. Plain `.svg` imports keep
        // Remotion's default (asset URL) handling.
        {
          test: /\.svg$/,
          resourceQuery: /react/,
          use: ["@svgr/webpack"],
        },
      ],
    },
    resolve: {
      ...resolve,
      // `nodetool-dev` first so package `exports` map to `src/*.ts`. The "..."
      // sentinel preserves Remotion's own default condition names.
      conditionNames: Array.from(
        new Set(["nodetool-dev", ...existingConditions, "browser", "..."])
      ),
      // NodeTool packages use the TS ESM convention of importing source files
      // with a `.js` extension (e.g. `./node-import.js` → `node-import.ts`).
      // Vite resolves this natively; webpack needs an explicit extensionAlias.
      extensionAlias: {
        ".js": [".ts", ".tsx", ".js", ".jsx"],
        ".mjs": [".mts", ".mjs"],
        ".cjs": [".cts", ".cjs"],
        ...(resolve.extensionAlias ?? {}),
      },
      alias: {
        ...(resolve.alias ?? {}),
        ...buildAlias(),
      },
    },
  };
};
