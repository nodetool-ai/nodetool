import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // The shared provider transport is a leaf module; test it from source so
      // the suite does not depend on a built runtime dist.
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
