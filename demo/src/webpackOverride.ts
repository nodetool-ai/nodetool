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
import { fileURLToPath } from "node:url";
import type { WebpackOverrideFn } from "@remotion/bundler";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUBS = path.resolve(here, "../../web/vite-node-stubs");
/** Runtime target for the `@web-demo` facade (typed via tsconfig paths). */
const WEB_DEMO_ENTRY = path.resolve(here, "../../web/src/demo/index.ts");

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
  return alias;
}

export const webpackOverride: WebpackOverrideFn = (config) => {
  const resolve = config.resolve ?? {};
  const existingConditions = resolve.conditionNames ?? ["...", "browser"];
  return {
    ...config,
    resolve: {
      ...resolve,
      // `nodetool-dev` first so package `exports` map to `src/*.ts`. The "..."
      // sentinel preserves Remotion's own default condition names.
      conditionNames: Array.from(
        new Set(["nodetool-dev", ...existingConditions, "browser", "..."])
      ),
      alias: {
        ...(resolve.alias ?? {}),
        ...buildAlias(),
      },
    },
  };
};
