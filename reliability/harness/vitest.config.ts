import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/protocol": resolve(__dirname, "../../packages/protocol/src")
    }
  },
  test: {
    root: resolve(__dirname),
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000
  }
});
