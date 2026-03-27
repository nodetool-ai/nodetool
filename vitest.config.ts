import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    coverage: {
      exclude: [
        "**/coverage/**",
        "**/test-ui-server.ts",
        "scripts/**",
      ],
    },
  },
});
