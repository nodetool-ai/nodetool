import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        external: ["better-sqlite3", "sqlite-vec"]
      }
    }
  }
});
