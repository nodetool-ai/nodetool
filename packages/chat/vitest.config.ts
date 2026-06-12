import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    // The agents package exposes both a root export and a `./memory`
    // subpath. Vite's alias map is prefix-based, so the most specific
    // entry must come first — otherwise `@nodetool-ai/agents/memory` gets
    // rewritten to `../agents/src/index.ts/memory` and fails to resolve.
    alias: [
      {
        find: "@nodetool-ai/agents/memory",
        replacement: resolve(__dirname, "../agents/src/long-term-memory.ts")
      },
      {
        find: "@nodetool-ai/agents",
        replacement: resolve(__dirname, "../agents/src/index.ts")
      },
      {
        find: "@nodetool-ai/protocol",
        replacement: resolve(__dirname, "../protocol/src")
      },
      {
        find: "@nodetool-ai/config",
        replacement: resolve(__dirname, "../config/src/index.ts")
      },
      {
        find: "@nodetool-ai/runtime/tracing",
        replacement: resolve(__dirname, "../runtime/src/tracing-helpers.ts")
      },
      {
        find: "@nodetool-ai/runtime/context",
        replacement: resolve(__dirname, "../runtime/src/context.ts")
      },
      {
        find: "@nodetool-ai/runtime/media-ref-bytes",
        replacement: resolve(__dirname, "../runtime/src/media-ref-bytes.ts")
      },
      {
        find: "@nodetool-ai/runtime/prompt-asset-refs",
        replacement: resolve(__dirname, "../runtime/src/prompt-asset-refs.ts")
      },
      {
        find: "@nodetool-ai/runtime",
        replacement: resolve(__dirname, "../runtime/src/index.ts")
      }
    ]
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});
