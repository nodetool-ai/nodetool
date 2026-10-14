import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests import this package by name. Resolve that to src/ rather than the
  // built dist/, so tests run the current source and coverage lands on it.
  resolve: {
    alias: [
      {
        find: /^@nodetool-ai\/automation-nodes$/,
        replacement: resolve(__dirname, "src/index.ts")
      }
    ]
  },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true
  }
});
