import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool-ai/agents": resolve(__dirname, "../agents/src/index.ts"),
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts")
    }
  },
  test: {
    // Tests in this package are pending migration to their owning split
    // packages (core-nodes, llm-nodes, image-nodes, etc.). Until then,
    // they're disabled — they reference the original `../src/nodes/*`
    // file layout which no longer exists. The new packages have their
    // own test suites covering the same code.
    include: ["tests/__placeholder__.test.ts"],
    exclude: ["tests/e2e/**/*.test.ts"],
    passWithNoTests: true
  }
});
