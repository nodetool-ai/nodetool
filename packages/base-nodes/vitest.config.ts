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
      "@nodetool-ai/node-sdk/cost-estimate": resolve(
        __dirname,
        "../node-sdk/src/cost-estimate.ts"
      ),
      "@nodetool-ai/node-sdk/pricing-params": resolve(
        __dirname,
        "../node-sdk/src/pricing-params.ts"
      ),
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
      "@nodetool-ai/runtime/safe-url": resolve(
        __dirname,
        "../runtime/src/providers/safe-url.ts"
      ),
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
    exclude: ["tests/e2e/**/*.test.ts"],
    // The example-workflow suites execute real graphs, and a graph with a Code
    // node spins up the QuickJS worker thread
    // (packages/agents/src/js-sandbox-worker/). Under tsx that spawn
    // recompiles the whole sandbox graph, so the first one in a file is the
    // slowest thing here — and against CI's contended parallel load it does
    // not fit in vitest's 5s default: one run lost six tests across three
    // files, every one of them at exactly 5000ms. `code-nodes` carries the
    // same allowance for the same reason.
    testTimeout: 60000
    // No `passWithNoTests`: this package has 31 suites, and two blocking CI
    // commands select from them by filename substring — the `parity` leg
    // (`npm test -w @nodetool-ai/base-nodes -- parity example-workflows`) and
    // `test:integration` (`-- example-workflows-execute`). With
    // passWithNoTests, renaming a targeted file made those filters match
    // nothing and exit 0, so the gate reported green while running no tests.
  }
});
