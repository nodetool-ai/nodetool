import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Retain the original CLI budget for fixtures that spawn real npm pack/install processes.
    testTimeout: 30000
  }
});
