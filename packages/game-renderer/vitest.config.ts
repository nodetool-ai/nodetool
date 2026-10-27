import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Concurrent software rendering can exhaust the scripts' wall-clock budgets.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // CI runners share CPUs, so a script call that takes a few milliseconds can overrun its 20 ms limit.
    env: { NODETOOL_GAME_SCRIPT_BUDGET_SCALE: "5" }
  }
});
