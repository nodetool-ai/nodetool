import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool/protocol": resolve(__dirname, "../protocol/src/index.ts"),
      "@nodetool/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool/runtime": resolve(__dirname, "../runtime/src/index.ts"),
      "@nodetool/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool/base-nodes": resolve(__dirname, "../base-nodes/src/index.ts"),
      "@nodetool/config": resolve(__dirname, "../config/src/index.ts")
    }
  },
  test: {
    root: resolve(__dirname),
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000
  }
});
