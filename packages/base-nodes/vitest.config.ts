import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool-ai/agents": resolve(__dirname, "../agents/src/index.ts"),
      // Subpaths before the root alias (Vite alias is prefix-based).
      "@nodetool-ai/runtime/tracing": resolve(
        __dirname,
        "../runtime/src/tracing-helpers.ts"
      ),
      "@nodetool-ai/runtime/context": resolve(
        __dirname,
        "../runtime/src/context.ts"
      ),
      "@nodetool-ai/runtime/media-ref-bytes": resolve(
        __dirname,
        "../runtime/src/media-ref-bytes.ts"
      ),
      "@nodetool-ai/runtime/prompt-asset-refs": resolve(
        __dirname,
        "../runtime/src/prompt-asset-refs.ts"
      ),
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**/*.test.ts"],
    passWithNoTests: true
  }
});
