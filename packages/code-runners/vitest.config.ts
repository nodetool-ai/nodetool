import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    timeout: 30_000,
    include: ["tests/**/*.test.ts"]
  }
});
