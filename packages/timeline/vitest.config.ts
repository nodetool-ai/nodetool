import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The `*.gpu.test.ts` suites render through Dawn, and CI has no GPU: the
    // first case in a file pays for the device plus pipeline compilation on
    // lavapipe, which is past the 5s default. Same override as image-nodes.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
