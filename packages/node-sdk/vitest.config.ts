import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/config": resolve(__dirname, "../config/src/index.ts"),
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
