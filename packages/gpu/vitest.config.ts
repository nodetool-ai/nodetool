import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/swiftshaderIcd.ts"],
    // Shader tests render on lavapipe. When CI runs the node packages in
    // parallel, a starved worker can take several times longer than vitest's
    // 5s default. The assertions are unchanged, so a hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
