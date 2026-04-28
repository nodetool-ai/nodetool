import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src/index.ts"),
      "@nodetool-ai/config": resolve(__dirname, "../config/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
