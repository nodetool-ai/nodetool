import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
