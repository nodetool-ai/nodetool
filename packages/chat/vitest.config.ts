import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool/protocol": resolve(__dirname, "../protocol/src/index.ts"),
      "@nodetool/config": resolve(__dirname, "../config/src/index.ts"),
      "@nodetool/runtime": resolve(__dirname, "../runtime/src/index.ts"),
      "@nodetool/agents": resolve(__dirname, "../agents/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
