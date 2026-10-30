import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * A vite plugin that intercepts imports for unbuilt @nodetool-ai/* workspace
 * packages and replaces them with an empty module. Tests that need specific
 * behaviour from a package must use vi.mock() to provide their own
 * implementation.
 */
function nodetoolStubPlugin(): Plugin {
  const stubPath = resolve(__dirname, "tests/__stubs__/nodetool.ts");
  // Packages that have no compiled dist/ in this repo checkout
  const unbuilt = new Set([
    "@nodetool-ai/runtime",
    "@nodetool-ai/runtime/safe-url",
    "@nodetool-ai/runtime/tracing",
    "@nodetool-ai/runtime/context",
    "@nodetool-ai/runtime/entities",
    "@nodetool-ai/runtime/media-ref-bytes",
    "@nodetool-ai/runtime/prompt-asset-refs",
    "@nodetool-ai/security",
    "@nodetool-ai/models",
    "@nodetool-ai/chat",
    "@nodetool-ai/agents",
    "@nodetool-ai/agents/js-sandbox",
    "@nodetool-ai/kernel",
    "@nodetool-ai/node-sdk",
    "@nodetool-ai/base-nodes",
    "@nodetool-ai/elevenlabs-nodes",
    "@nodetool-ai/minimax-nodes",
    "@nodetool-ai/transformers-js-nodes",
    "@nodetool-ai/fal-nodes",
    "@nodetool-ai/replicate-nodes",
    "@nodetool-ai/dsl",
    "@nodetool-ai/config",
    "@nodetool-ai/deploy",
    "@nodetool-ai/vectorstore",
    // The chat context loads asset persistence from here; the real module pulls
    // sharp and the storage adapters into a unit test that needs neither.
    "@nodetool-ai/websocket/assets",
    // Direct CLI dependencies not installed at the workspace root
    "marked",
    "marked-terminal",
    "js-yaml"
  ]);

  return {
    name: "nodetool-stub",
    enforce: "pre",
    resolveId(id) {
      if (unbuilt.has(id)) {
        return `\0virtual:nodetool-stub:${id}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0virtual:nodetool-stub:")) {
        // Return the stub module content by re-exporting from the shared stub.
        // The stub path is inlined so each virtual module has a unique ID while
        // sharing the same implementation.
        return `export * from ${JSON.stringify(stubPath)};`;
      }
      return null;
    }
  };
}

// Tests that need real workspace packages run without the stub plugin.
const realPackageTests = [

];

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 2,
    testTimeout: 30000,
    // CI runners share CPUs, so a game script call that takes a few milliseconds can overrun its 20 ms
    // limit. Spawned CLIs inherit the scale.
    env: { NODETOOL_GAME_SCRIPT_BUDGET_SCALE: "5" },
    projects: [
      {
        extends: true,
        plugins: [nodetoolStubPlugin()],
        resolve: {
          // app-runtime is dependency-free source, so tests exercise the real
          // runtime core rather than a stub.
          alias: [
            {
              find: /^@nodetool-ai\/app-runtime$/,
              replacement: resolve(__dirname, "../app-runtime/src/index.ts")
            },
            // The analytics package is dependency-free source; the telemetry
            // tests exercise the real consent and validation code.
            {
              find: /^@nodetool-ai\/analytics$/,
              replacement: resolve(__dirname, "../analytics/src/index.ts")
            },
            {
              find: /^@nodetool-ai\/analytics\/node$/,
              replacement: resolve(__dirname, "../analytics/src/node/index.ts")
            }
          ]
        },
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
          exclude: realPackageTests
        }
      },
      {
        extends: true,
        test: {
          name: "real-packages",
          include: realPackageTests
        }
      }
    ]
  }
});
