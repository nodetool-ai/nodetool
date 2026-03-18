import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool/protocol": resolve(__dirname, "../protocol/src/index.ts"),
      "@nodetool/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool/runtime": resolve(__dirname, "../runtime/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
