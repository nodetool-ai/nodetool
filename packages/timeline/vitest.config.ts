import { resolve } from "path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  // Tests import this package by name. Resolve that to src/ rather than the
  // built dist/, so tests run the current source and coverage lands on it.
  resolve: {
    alias: [
      {
        find: /^@nodetool-ai\/timeline$/,
        replacement: resolve(__dirname, "src/index.ts")
      }
    ]
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The `*.gpu.test.ts` suites render through Dawn, and CI has no GPU: the
    // first case in a file pays for the device plus pipeline compilation on
    // lavapipe, which is past the 5s default. Same override as image-nodes.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
