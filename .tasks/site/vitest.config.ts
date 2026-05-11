import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.ts"],
    // One test file per process: each gets its own SQLite file so they don't
    // collide on the singleton DB.
    pool: "forks",
    poolOptions: { forks: { singleFork: false } },
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
