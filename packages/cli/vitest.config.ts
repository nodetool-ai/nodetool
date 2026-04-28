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
    "@nodetool-ai/security",
    "@nodetool-ai/models",
    "@nodetool-ai/chat",
    "@nodetool-ai/agents",
    "@nodetool-ai/kernel",
    "@nodetool-ai/node-sdk",
    "@nodetool-ai/base-nodes",
    "@nodetool-ai/elevenlabs-nodes",
    "@nodetool-ai/transformers-js-nodes",
    "@nodetool-ai/fal-nodes",
    "@nodetool-ai/replicate-nodes",
    "@nodetool-ai/dsl",
    "@nodetool-ai/protocol",
    "@nodetool-ai/config",
    "@nodetool-ai/deploy",
    "@nodetool-ai/vectorstore",
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

export default defineConfig({
  plugins: [nodetoolStubPlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000
  }
});
