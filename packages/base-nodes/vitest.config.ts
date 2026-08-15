import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@nodetool-ai/execution/app-debug": resolve(
        __dirname,
        "../execution/src/app-debug/index.ts"
      ),
      "@nodetool-ai/execution/debug": resolve(
        __dirname,
        "../execution/src/debug/index.ts"
      ),
      "@nodetool-ai/execution/timeline-debug": resolve(
        __dirname,
        "../execution/src/timeline-debug/index.ts"
      ),
      "@nodetool-ai/execution/sketch-debug": resolve(
        __dirname,
        "../execution/src/sketch-debug/index.ts"
      ),
      "@nodetool-ai/execution/js-script-debug": resolve(
        __dirname,
        "../execution/src/js-script-debug/index.ts"
      ),
      "@nodetool-ai/execution/service": resolve(
        __dirname,
        "../execution/src/service/index.ts"
      ),
      "@nodetool-ai/execution": resolve(__dirname, "../execution/src/index.ts"),
      "@nodetool-ai/kernel": resolve(__dirname, "../kernel/src/index.ts"),
      "@nodetool-ai/protocol": resolve(__dirname, "../protocol/src"),
      "@nodetool-ai/node-sdk/code-body": resolve(
        __dirname,
        "../node-sdk/src/code-body.ts"
      ),
      "@nodetool-ai/node-sdk": resolve(__dirname, "../node-sdk/src/index.ts"),
      // Subpaths before the root alias (Vite alias is prefix-based).
      "@nodetool-ai/agents/js-sandbox": resolve(
        __dirname,
        "../agents/src/js-sandbox.ts"
      ),
      "@nodetool-ai/agents": resolve(__dirname, "../agents/src/index.ts"),
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
      "@nodetool-ai/runtime": resolve(__dirname, "../runtime/src/index.ts")
    },
    // integration-nodes nests its own nodemailer (imapflow/mailparser pin it
    // to v8, integration-nodes needs v9); dedupe so vi.mock("nodemailer")
    // intercepts the same instance the mail node actually imports.
    dedupe: ["nodemailer"]
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**/*.test.ts"]
    // No `passWithNoTests`: this package has 31 suites, and two blocking CI
    // commands select from them by filename substring — the `parity` leg
    // (`npm test -w @nodetool-ai/base-nodes -- parity example-workflows`) and
    // `test:integration` (`-- example-workflows-execute`). With
    // passWithNoTests, renaming a targeted file made those filters match
    // nothing and exit 0, so the gate reported green while running no tests.
  }
});
