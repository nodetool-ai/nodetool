import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // Every CodeNode test spins up the real QuickJS worker thread
    // (packages/agents/src/js-sandbox-worker/) — its startup cost can exceed
    // the default 5s under CI's contended parallel task load.
    testTimeout: 20000
  }
});
