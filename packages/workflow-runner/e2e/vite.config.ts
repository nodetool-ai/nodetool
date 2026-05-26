import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * Vite config for the workflow-runner browser E2E test harness.
 *
 * Imports the kernel + a small inline executor map. The kernel pulls
 * `@nodetool-ai/config` which statically imports `node:fs` / `node:os`
 * / `node:path` / `node:url` for non-browser code paths; explicit
 * `resolve.alias` entries map every `node:*` specifier to a stub that
 * exposes the named exports those modules destructure. The stubs throw
 * on call but browser-tagged execution never reaches them.
 */
const STUBS = resolve(import.meta.dirname, "stubs");

const NODE_PROTOCOL_STUBS: Record<string, string> = {
  "node:fs/promises": `${STUBS}/fs-promises-stub.js`,
  "node:fs": `${STUBS}/fs-stub.js`,
  "node:path": `${STUBS}/path-stub.js`,
  "node:url": `${STUBS}/url-stub.js`,
  "node:crypto": `${STUBS}/crypto-stub.js`,
  "node:os": `${STUBS}/os-stub.js`,
  "node:events": `${STUBS}/events-stub.js`,
  "node:child_process": `${STUBS}/empty.js`,
  "node:worker_threads": `${STUBS}/empty.js`,
  "node:cluster": `${STUBS}/empty.js`,
  "node:dgram": `${STUBS}/empty.js`,
  "node:dns": `${STUBS}/empty.js`,
  "node:net": `${STUBS}/empty.js`,
  "node:tls": `${STUBS}/empty.js`,
  "node:zlib": `${STUBS}/empty.js`,
  "node:http": `${STUBS}/empty.js`,
  "node:https": `${STUBS}/empty.js`,
  "node:http2": `${STUBS}/empty.js`,
  "node:perf_hooks": `${STUBS}/empty.js`,
  "node:vm": `${STUBS}/empty.js`,
  "node:stream": `${STUBS}/empty.js`,
  "node:util": `${STUBS}/empty.js`,
  "node:buffer": `${STUBS}/empty.js`,
  "node:assert": `${STUBS}/empty.js`,
  "node:process": `${STUBS}/empty.js`
};

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
      const stub = NODE_PROTOCOL_STUBS[source];
      if (stub) return stub;
      return null;
    }
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [stubNodeProtocolPlugin()],
  define: {
    // Browser-side modules don't have access to `process`. Shim a minimal
    // object so top-level references (e.g. `process.env["NODETOOL_ENV"]`)
    // don't throw on bundle init. Anything that needs real env vars must
    // gate on IS_NODE / typeof process checks.
    "process.env": "{}",
    "process.platform": JSON.stringify("browser"),
    "process.versions": "{}"
  },
  resolve: {
    alias: [
      { find: "node:fs/promises", replacement: `${STUBS}/fs-promises-stub.js` },
      { find: "node:fs", replacement: `${STUBS}/fs-stub.js` },
      { find: "node:path", replacement: `${STUBS}/path-stub.js` },
      { find: "node:url", replacement: `${STUBS}/url-stub.js` },
      { find: "node:crypto", replacement: `${STUBS}/crypto-stub.js` },
      { find: "node:os", replacement: `${STUBS}/os-stub.js` },
      { find: "node:events", replacement: `${STUBS}/events-stub.js` },
      { find: "node:child_process", replacement: `${STUBS}/empty.js` },
      { find: "node:worker_threads", replacement: `${STUBS}/empty.js` },
      { find: "node:cluster", replacement: `${STUBS}/empty.js` },
      { find: "node:dgram", replacement: `${STUBS}/empty.js` },
      { find: "node:dns", replacement: `${STUBS}/empty.js` },
      { find: "node:net", replacement: `${STUBS}/empty.js` },
      { find: "node:tls", replacement: `${STUBS}/empty.js` },
      { find: "node:zlib", replacement: `${STUBS}/empty.js` },
      { find: "node:http", replacement: `${STUBS}/empty.js` },
      { find: "node:https", replacement: `${STUBS}/empty.js` },
      { find: "node:http2", replacement: `${STUBS}/empty.js` },
      { find: "node:perf_hooks", replacement: `${STUBS}/empty.js` },
      { find: "node:vm", replacement: `${STUBS}/empty.js` },
      { find: "node:stream", replacement: `${STUBS}/empty.js` },
      { find: "node:util", replacement: `${STUBS}/empty.js` },
      { find: "node:buffer", replacement: `${STUBS}/empty.js` },
      { find: "node:assert", replacement: `${STUBS}/empty.js` },
      { find: "node:process", replacement: `${STUBS}/empty.js` }
    ]
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
    exclude: [
      "@nodetool-ai/base-nodes",
      "@nodetool-ai/workflow-runner",
      "@nodetool-ai/node-sdk",
      "@nodetool-ai/runtime",
      "@nodetool-ai/kernel",
      "@nodetool-ai/protocol",
      "@nodetool-ai/agents",
      "@nodetool-ai/config",
      "@nodetool-ai/models"
    ]
  },
  server: {
    port: 5179,
    strictPort: true,
    host: "127.0.0.1"
  }
});
