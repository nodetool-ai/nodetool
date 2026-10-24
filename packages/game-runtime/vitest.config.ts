import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // CI runners share CPUs, so a script call that takes a few milliseconds can overrun its 20 ms limit.
    // Tests of the limits themselves set the scale back to 1.
    env: { NODETOOL_GAME_SCRIPT_BUDGET_SCALE: "5" }
  }
});
