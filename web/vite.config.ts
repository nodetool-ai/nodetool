import { defineConfig, loadEnv, type Plugin, type ProxyOptions, type UserConfig } from "vite";
import type { Plugin as EsbuildPlugin } from "esbuild";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const rootNodeModules = resolve(configDir, "../node_modules");

// Build-time provenance injected into the app (shown in the About dialog).
// Both are derived from git so no manual bookkeeping is needed:
//  - commit hash: the short SHA of the checked-out commit
//  - build number: the total commit count on the current history, which is
//    monotonic and sequential
// A CI env override (GIT_COMMIT_HASH / BUILD_NUMBER) wins when set, and both
// fall back gracefully when git is unavailable (e.g. building from a tarball).
function runGit(command: string): string | null {
  try {
    return execSync(command, { cwd: configDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const GIT_COMMIT_HASH =
  process.env.GIT_COMMIT_HASH ?? runGit("git rev-parse --short HEAD") ?? "unknown";
const BUILD_NUMBER =
  process.env.BUILD_NUMBER ?? runGit("git rev-list --count HEAD") ?? "0";

// The in-browser workflow runner (web/src/lib/workflow/browserWorkflowRunner.ts)
// lazily imports @nodetool-ai/workflow-runner + @nodetool-ai/base-nodes so a
// pure-browser sub-graph can execute client-side. Those packages (via the
// kernel/runtime) statically import `node:*` built-ins for their server code
// paths. Browser-tagged execution never reaches them, but the bundler must
// still resolve the specifiers — map each to a browser-safe stub. Mirrors the
// workflow-runner e2e harness config.
const NODE_STUBS = resolve(configDir, "vite-node-stubs");
const NODE_BUILTIN_STUBS: Record<string, string> = {
  "node:fs/promises": `${NODE_STUBS}/fs-promises-stub.js`,
  "node:fs": `${NODE_STUBS}/fs-stub.js`,
  "node:path": `${NODE_STUBS}/path-stub.js`,
  "node:url": `${NODE_STUBS}/url-stub.js`,
  "node:crypto": `${NODE_STUBS}/crypto-stub.js`,
  "node:os": `${NODE_STUBS}/os-stub.js`,
  "node:events": `${NODE_STUBS}/events-stub.js`,
  "node:child_process": `${NODE_STUBS}/child-process-stub.js`,
  "node:worker_threads": `${NODE_STUBS}/empty.js`,
  "node:cluster": `${NODE_STUBS}/empty.js`,
  "node:dgram": `${NODE_STUBS}/empty.js`,
  "node:dns": `${NODE_STUBS}/empty.js`,
  "node:net": `${NODE_STUBS}/empty.js`,
  "node:tls": `${NODE_STUBS}/empty.js`,
  "node:zlib": `${NODE_STUBS}/empty.js`,
  "node:http": `${NODE_STUBS}/empty.js`,
  "node:https": `${NODE_STUBS}/empty.js`,
  "node:http2": `${NODE_STUBS}/empty.js`,
  "node:perf_hooks": `${NODE_STUBS}/empty.js`,
  "node:vm": `${NODE_STUBS}/empty.js`,
  // Not empty: memfs (QuickJS sandbox → universal Code node) subclasses
  // stream.Readable/Writable at module scope — see stream-stub.js.
  "node:stream": `${NODE_STUBS}/stream-stub.js`,
  "node:async_hooks": `${NODE_STUBS}/empty.js`,
  "node:util": `${NODE_STUBS}/empty.js`,
  "node:buffer": `${NODE_STUBS}/buffer-stub.js`,
  "node:assert": `${NODE_STUBS}/empty.js`,
  "node:process": `${NODE_STUBS}/empty.js`,
  "node:module": `${NODE_STUBS}/empty.js`
};

// Same stubs keyed by the bare specifier (no `node:`). Third-party deps in the
// browser-runner graph (e.g. `dotenv` → `fs`/`path`/`crypto`/`os`) import the
// un-prefixed names. The main app bundle externalizes these (a browser-compat
// warning), but a Web Worker bundle can't carry external imports, so the worker
// must stub them — see the `worker` config block.
const BARE_BUILTIN_STUBS: Record<string, string> = Object.fromEntries(
  Object.entries(NODE_BUILTIN_STUBS)
    .filter(([key]) => key !== "node:buffer")
    .map(([key, stub]) => [key.replace(/^node:/, ""), stub])
);

// npm packages — not builtins — that are Node-only *at module scope*, so a
// browser graph that merely contains one throws before any code calls into it.
// `@openclaw/fs-safe` backs `@nodetool-ai/storage`'s `FileStorageAdapter`; its
// native-binding loader builds a `createRequire` and reads `process.env` while
// the module evaluates. The browser never constructs that adapter — `root()`
// is called only from its constructor, and a browser has no local directory to
// point one at — so the stub throws on use.
const NODE_PACKAGE_STUBS: Record<string, string> = {
  "@openclaw/fs-safe": `${NODE_STUBS}/fs-safe-stub.js`
};

// Vite's `resolve.alias` doesn't intercept the `node:` protocol — these imports
// bypass the alias plugin and hit the default resolver. Catch them in a `pre`
// resolveId hook before any other plugin runs. `includeBare` additionally stubs
// the un-prefixed builtin names (needed only for the self-contained worker
// bundle, where externalizing a builtin is a hard error).
function stubNodeProtocolPlugin(includeBare = false): Plugin {
  return {
    name: "stub-node-protocol",
    enforce: "pre",
    resolveId(source) {
      return (
        NODE_BUILTIN_STUBS[source] ??
        NODE_PACKAGE_STUBS[source] ??
        (includeBare ? BARE_BUILTIN_STUBS[source] : undefined) ??
        null
      );
    }
  };
}

// The esbuild counterpart of stubNodeProtocolPlugin, for Vite's dependency
// pre-bundle (optimizeDeps). That pass is a separate esbuild run whose module
// resolution does NOT go through Vite's `resolve.alias` or the `resolveId`
// plugins above — so a pre-bundled dependency like `@sebastianwessel/quickjs`
// gets its `node:buffer` import externalized, and the resulting shim throws the
// moment the code touches `Buffer.allocUnsafe` at module load. Redirect the
// `node:`-prefixed builtins to the same stub files during pre-bundling so the
// real polyfill (buffer-stub → npm `buffer`) is bundled instead. Bare builtin
// names are intentionally left alone: the app externalizes them, and bare
// `buffer` must resolve to the npm package that buffer-stub.js itself imports.
function stubNodeBuiltinsEsbuildPlugin(): EsbuildPlugin {
  return {
    name: "stub-node-builtins-esbuild",
    setup(build) {
      build.onResolve({ filter: /^node:/ }, (args) => {
        const stub = NODE_BUILTIN_STUBS[args.path];
        return stub ? { path: stub } : undefined;
      });
    }
  };
}

// Worker-only telemetry cuts. The browser-runner worker never exports traces,
// but the kernel/runtime statically reach OpenTelemetry: the kernel imports
// `@nodetool-ai/runtime/tracing` (→ a no-op stub here), and `telemetry.js`
// lazy-loads the OTel Node SDK + OTLP/gRPC exporters — server-only packages that
// pull node builtins (`stream`, `http2`, gRPC) a worker can't carry. Those run
// only inside `initTelemetry()` (never in the browser), so empty them; the API
// surface the worker actually uses (`@opentelemetry/api`, `core`,
// `sdk-trace-base`) is browser-safe and left intact.
function stubServerTelemetryPlugin(): Plugin {
  const EMPTY = `${NODE_STUBS}/empty.js`;
  return {
    name: "stub-server-telemetry",
    enforce: "pre",
    resolveId(source) {
      if (source === "@nodetool-ai/runtime/tracing") {
        return `${NODE_STUBS}/tracing-stub.js`;
      }
      if (
        source.startsWith("@grpc/") ||
        source.startsWith("@opentelemetry/sdk-node") ||
        source.startsWith("@opentelemetry/exporter-") ||
        source.startsWith("@opentelemetry/otlp-")
      ) {
        return EMPTY;
      }
      return null;
    }
  };
}

// Strip remote `@import url(https://…)` statements from emitted CSS chunks.
// Third-party CSS can smuggle one in (e.g. @measured/puck imports Inter from
// rsms.me). Chrome treats a failed @import as a failure of the whole
// stylesheet, so when the CDN is blocked/unreachable the chunk's <link> errors,
// Vite fires `vite:preloadError`, and preloadErrorReload.ts reloads the page —
// every affected click becomes a page reload. Fonts are already self-hosted
// (@fontsource imports in ThemeNodetool), so remote font CSS is redundant;
// drop it at build time.
function stripExternalCssImportsPlugin(): Plugin {
  const EXTERNAL_IMPORT_RE =
    /@import\s*(?:url\(\s*)?["']?https?:\/\/[^"'()\s;]+["']?\s*\)?[^;]*;/gi;
  return {
    name: "strip-external-css-imports",
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) {
          continue;
        }
        const source =
          typeof asset.source === "string"
            ? asset.source
            : new TextDecoder().decode(asset.source);
        const stripped = source.replace(EXTERNAL_IMPORT_RE, "");
        if (stripped !== source) {
          asset.source = stripped;
        }
      }
    }
  };
}

// Cross-origin isolation for the perf harness page only. crossOriginIsolated
// unlocks performance.measureUserAgentSpecificMemory(), which attributes JS
// heap to every realm in the agent cluster — including the browser-runner
// Web Worker, whose memory is otherwise unreadable (dedicated workers expose
// no performance.memory). Scoped to /perf-realtime so the app keeps its
// normal embedding behavior.
/** Benign while the backend is still booting or tsx is restarting. */
function isBenignProxyError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const code =
    "code" in err && typeof err.code === "string" ? err.code : undefined;
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE") {
    return true;
  }
  if (err instanceof AggregateError) {
    return err.errors.length > 0 && err.errors.every(isBenignProxyError);
  }
  return false;
}

// Vite logs every failed /ws and /api proxy while the backend is down. During
// `npm run dev` that window is normal (tsx boot + restarts), so swallow those.
function suppressBenignDevProxyErrorsPlugin(): Plugin {
  return {
    name: "suppress-benign-dev-proxy-errors",
    configureServer(server) {
      const logger = server.config.logger;
      const logError = logger.error.bind(logger);
      logger.error = (msg, options) => {
        if (
          typeof msg === "string" &&
          (msg.includes("ws proxy error") || msg.includes("http proxy error")) &&
          isBenignProxyError(options?.error)
        ) {
          return;
        }
        logError(msg, options);
      };
    }
  };
}

function perfPageIsolationPlugin(): Plugin {
  return {
    name: "perf-page-isolation",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/perf-realtime")) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        } else if (url.includes("browserRunner.worker")) {
          // A require-corp document may only spawn dedicated workers whose
          // script response also carries COEP. Harmless for the normal app
          // (a non-isolated owner accepts any worker policy).
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        next();
      });
    }
  };
}

export default defineConfig(async ({ mode }) => {
  // Load all env vars (including non-VITE_ prefixed ones) for server-side config
  const env = loadEnv(mode, configDir, "");
  const browserslistToEsbuild = (await import("browserslist-to-esbuild"))
    .default;
  const isDebug = mode === "debug";

  const apiTarget = env.PROXY_API_TARGET || "http://localhost:7777";
  const proxyConfig: Record<string, ProxyOptions> = {
    "/api": {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    },
    "/ws": {
      target: apiTarget,
      ws: true,
      changeOrigin: true,
      // Match the other proxy entries: tolerate a self-signed backend cert
      // (the dev server enables TLS whenever a cert.pem is found). Without this
      // the WebSocket upgrade fails with "unable to verify the first certificate".
      secure: false
    },
    "/trpc": {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    },
    "/storage": {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\/storage/, "/api/storage")
    }
  };

  const extraAllowedHosts = (env.VITE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    define: {
      __GIT_COMMIT_HASH__: JSON.stringify(GIT_COMMIT_HASH),
      __BUILD_NUMBER__: JSON.stringify(BUILD_NUMBER)
    },
    server: {
      allowedHosts: [".nodetool.ai", "localhost", ...extraAllowedHosts],
      port: 3000,
      proxy: proxyConfig
    },
    optimizeDeps: {
      include: [
        "@trpc/client",
        "@trpc/react-query",
        "@trpc/server",
        "@tanstack/react-query",
      ],
      exclude: [
        "monaco-editor",
        "@monaco-editor/react",
        "@monaco-editor/loader",
      ],
      rolldownOptions: {
        plugins: [stubNodeBuiltinsEsbuildPlugin()]
      }
    },
    resolve: {
      // Use the `nodetool-dev` export condition so @nodetool-ai/* packages
      // resolve to their `src/*.ts` sources instead of built `dist/*.js`.
      // This is the repo-wide convention declared in each package's exports.
      conditions: ["nodetool-dev", "import", "module", "browser", "default"],
      alias: {
        "monaco-editor": resolve(rootNodeModules, "monaco-editor"),
        // FAL pricing bundles generated by `packages/fal-codegen` and consumed
        // by `web/src/utils/attachBundleFalUnitPricing.ts`. Declared as ambient
        // modules in `web/src/fal-*.d.ts`.
        "@nodetool/fal-node-type-pricing": resolve(
          configDir,
          "../packages/fal-nodes/src/generated/fal-node-type-pricing.json"
        ),
        "@nodetool/fal-unit-pricing-catalog": resolve(
          configDir,
          "../packages/fal-nodes/src/generated/fal-unit-pricing.json"
        ),
        "@nodetool/kie-node-type-pricing": resolve(
          configDir,
          "../packages/kie-nodes/src/generated/kie-node-type-pricing.json"
        ),
        "@nodetool/kie-unit-pricing-catalog": resolve(
          configDir,
          "../packages/kie-nodes/src/generated/kie-unit-pricing.json"
        ),
      },
    },
    // The in-browser runner Web Worker (browserRunner.worker.ts) is bundled as
    // its own self-contained entry. It inherits `resolve` (conditions/alias) but
    // NOT the main `plugins`, so re-apply the node-builtin stub here — and with
    // `includeBare` since a worker can't externalize builtins like the app can.
    worker: {
      format: "es",
      plugins: () => [stubServerTelemetryPlugin(), stubNodeProtocolPlugin(true)]
    },
    plugins: [
      suppressBenignDevProxyErrorsPlugin(),
      perfPageIsolationPlugin(),
      stubNodeProtocolPlugin(),
      stripExternalCssImportsPlugin(),
      react({
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"]
        }
      }),
      svgr()
    ],
    build: {
      // Note: `not ios < 14` excludes iOS 11–13. esbuild (via vite 8 / rolldown
      // worker bundling) cannot downlevel certain destructuring patterns in
      // monaco-editor's pre-bundled workers to those ancient targets.
      target: browserslistToEsbuild([">0.2%", "not dead", "not op_mini all", "not ios < 14"]),
      sourcemap: isDebug,
      minify: isDebug ? false : "esbuild",
      ...(isDebug
        ? {}
        : {
            rollupOptions: {
              external: ["web-worker"],
              output: {
                manualChunks(id) {
                  // Chunk only what the boot path itself needs.
                  //
                  // A manual chunk is a fixed bucket, and rolldown hosts shared
                  // runtime modules (its dynamic-import preload helper, CommonJS
                  // interop shims) inside one of them. When that bucket was a
                  // feature-only library, the entry chunk ended up statically
                  // importing megabytes of Monaco / plotly / three just to reach
                  // a helper function — and every one of those bytes was
                  // downloaded and parsed before the app could paint.
                  //
                  // So: name a chunk for a dependency the first screen actually
                  // uses, and leave feature-only libraries unnamed. Rolldown
                  // then places them alongside the dynamic entry that imports
                  // them, which is where they belong. `node scripts/chunk-graph.mjs`
                  // reports what the boot path pulls in and which edge put it
                  // there — check it after touching this function.
                  if (!id.includes("node_modules")) return;
                  // Reached from the boot path (msgpack, the browser runner) and
                  // from plotly's dependency graph. Unnamed it landed inside the
                  // plotly chunk, so booting downloaded 4.8 MB of charting
                  // library to get `Buffer`.
                  if (
                    /[\\/]node_modules[\\/](buffer|base64-js|ieee754)[\\/]/.test(
                      id
                    )
                  )
                    return "vendor-buffer";
                  if (
                    /[\\/]node_modules[\\/](react|react-dom|react-router-dom|react-router|scheduler)[\\/]/.test(
                      id
                    )
                  )
                    return "vendor-react";
                  if (
                    /[\\/]node_modules[\\/](@mui[\\/]material|@mui[\\/]icons-material|@mui[\\/]system|@mui[\\/]base|@emotion[\\/]react|@emotion[\\/]styled|@emotion[\\/]cache|@emotion[\\/]serialize|@emotion[\\/]utils|@emotion[\\/]hash)[\\/]/.test(
                      id
                    )
                  )
                    return "vendor-mui";
                  // Workflow graph engine. Keep elkjs out: it is reached only
                  // through `autoLayout`'s dynamic import, and naming it into
                  // this boot-path bucket puts all 1.4 MB back on the entry.
                  if (/[\\/]node_modules[\\/]@xyflow[\\/]/.test(id))
                    return "vendor-flow";
                  // Server state + RPC stack (must stay together — shared runtime)
                  if (
                    /[\\/]node_modules[\\/](@tanstack|@trpc|@msgpack)[\\/]/.test(
                      id
                    )
                  )
                    return "vendor-query";
                  // Supabase client
                  if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id))
                    return "vendor-supabase";
                  // Search / command palette / small utilities cluster
                  if (
                    /[\\/]node_modules[\\/](cmdk|chroma-js|uuid|zod)[\\/]/.test(
                      id
                    )
                  )
                    return "vendor-utils";
                  // Everything else — Monaco, Lexical, plotly, three.js,
                  // pdf.js, wavesurfer, the markdown stack, the data-table
                  // stack — is feature-only and stays unnamed on purpose. See
                  // the note at the top of this function.
                  return;
                }
              }
            }
          })
    }
  } satisfies UserConfig;
});
