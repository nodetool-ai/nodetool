import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 2,
    testTimeout: 30_000
  }
});
