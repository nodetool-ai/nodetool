import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@nodetool-ai/protocol",
        replacement: resolve(__dirname, "../protocol/src")
      },
      {
        find: "@nodetool-ai/sdk",
        replacement: resolve(__dirname, "../sdk/src/index.ts")
      }
    ]
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
