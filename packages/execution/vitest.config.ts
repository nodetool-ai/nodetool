import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      // Subpaths before the root alias (Vite alias is prefix-based).
      "@nodetool-ai/runtime/tracing": resolve(
        __dirname,
        "../runtime/src/tracing-helpers.ts"
      ),
      "@nodetool-ai/runtime/context": resolve(
        __dirname,
        "../runtime/src/context.ts"
      ),
      "@nodetool-ai/runtime/media-ref-bytes": resolve(
        __dirname,
        "../runtime/src/media-ref-bytes.ts"
      ),
      "@nodetool-ai/runtime/prompt-asset-refs": resolve(
        __dirname,
        "../runtime/src/prompt-asset-refs.ts"
      ),
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts"),
      "@nodetool-ai/node-sdk/code-body": resolve(
        __dirname,
        "../node-sdk/src/code-body.ts"
      ),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      "@nodetool-ai/config": resolve(__dirname, "../config/src/index.ts"),
      // Dependency-free source, so the app-debug tests exercise the real
      // runtime core rather than a build of it.
      "@nodetool-ai/app-runtime": resolve(
        __dirname,
        "../app-runtime/src/index.ts"
      ),
      // Same reason: the timeline validator should check the assembly code as
      // written, not a build of it.
      "@nodetool-ai/timeline": resolve(__dirname, "../timeline/src/index.ts")
    }
  },
  test: {
    root: resolve(__dirname),
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000
  }
});
