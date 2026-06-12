import { defineConfig } from "vitest/config";

/**
 * Browser integration suite — launches real headless Chrome with the extension
 * loaded. Kept separate from the default unit run (`vitest.config.ts`): slow,
 * needs Chrome and a free port 7777, and is not safe to parallelize (single
 * shared browser + a fixed port).
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.itest.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: "forks"
  }
});
