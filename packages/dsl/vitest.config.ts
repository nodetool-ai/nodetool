import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
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
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts"),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool-ai/base-nodes": resolve(__dirname, "../base-nodes/src/index.ts"),
      "@nodetool-ai/config": resolve(__dirname, "../config/src/index.ts"),
      "@nodetool-ai/code-runners": resolve(
        __dirname,
        "../code-runners/src/index.ts"
      ),
      "@nodetool-ai/elevenlabs-nodes": resolve(
        __dirname,
        "../elevenlabs-nodes/src/index.ts"
      ),
      "@nodetool-ai/minimax-nodes": resolve(
        __dirname,
        "../minimax-nodes/src/index.ts"
      ),
      "@nodetool-ai/transformers-js-nodes": resolve(
        __dirname,
        "../transformers-js-nodes/src/index.ts"
      )
    }
  },
  test: {
    root: resolve(__dirname),
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000
  }
});
