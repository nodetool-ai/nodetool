import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/runtime/provider-transport": resolve(
        __dirname,
        "../runtime/src/providers/provider-transport.ts"
      )
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
