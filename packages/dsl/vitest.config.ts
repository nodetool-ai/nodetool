import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
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
