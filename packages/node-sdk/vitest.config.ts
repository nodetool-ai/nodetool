import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool/protocol": resolve(__dirname, "../protocol/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
