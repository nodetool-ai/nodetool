import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Concurrent software rendering can exhaust the scripts' wall-clock budgets.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
