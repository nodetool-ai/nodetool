import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/tests/**/*.test.ts",
      "tools/oxlint/anti-slop/tests/**/*.test.ts",
      "scripts/__tests__/**/*.test.mjs",
    ],
    coverage: {
      exclude: [
        "**/coverage/**",
        "**/test-ui-server.ts",
        "scripts/**",
      ],
    },
  },
});
