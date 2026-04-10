import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * A vite plugin that intercepts imports for unbuilt @nodetool/* workspace
 * packages and replaces them with an empty module. Tests that need specific
 * behaviour from a package must use vi.mock() to provide their own
 * implementation.
 */
function nodetoolStubPlugin(): Plugin {
  const stubPath = resolve(__dirname, "tests/__stubs__/nodetool.ts");
  // Packages that have no compiled dist/ in this repo checkout
  const unbuilt = new Set([
    "@nodetool/runtime",
    "@nodetool/security",
    "@nodetool/models",
    "@nodetool/chat",
    "@nodetool/agents",
    "@nodetool/kernel",
    "@nodetool/node-sdk",
    "@nodetool/base-nodes",
    "@nodetool/elevenlabs-nodes",
    "@nodetool/fal-nodes",
    "@nodetool/replicate-nodes",
    "@nodetool/dsl",
    "@nodetool/protocol",
    "@nodetool/config",
    // Direct CLI dependencies not installed at the workspace root
    "marked",
    "marked-terminal"
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
