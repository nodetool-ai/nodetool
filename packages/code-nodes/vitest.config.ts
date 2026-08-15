import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // Every CodeNode test spins up the real QuickJS worker thread
    // (packages/agents/src/js-sandbox-worker/) — its startup cost can exceed
    // the default 5s under CI's contended parallel task load. Under tsx each
    // spawn recompiles the whole sandbox graph, so the first test in a file
    // pays it in full: one CI run measured 7.2s, 12.9s and >20s for three
    // cold spawns, and 20s was tight enough that the slowest failed the run
    // while its neighbours passed. Warm, that same test takes 1.4s.
    testTimeout: 60000
  }
});
