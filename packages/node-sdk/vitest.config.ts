import { defineConfig } from "vitest/config";
import { resolve } from "path";
export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/config": resolve(__dirname, "../config/src/index.ts"),
      // Subpaths must precede the root alias — Vite alias matching is
      // prefix-based, so `@nodetool-ai/runtime` would otherwise rewrite
      // `@nodetool-ai/runtime/tracing` to `…/src/index.ts/tracing`.
      "@nodetool-ai/runtime/tracing": resolve(
        __dirname,
        "../runtime/src/tracing-helpers.ts"
      ),
      "@nodetool-ai/runtime/context": resolve(
        __dirname,
        "../runtime/src/context.ts"
      ),
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
