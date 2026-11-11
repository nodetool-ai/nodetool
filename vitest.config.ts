import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [{
    name: "strip-script-shebang",
    enforce: "pre",
    // Vite otherwise leaves a CRLF shebang after the generated SSR imports.
    transform(code, id) {
      if (id.endsWith(".mjs") && code.startsWith("#!")) {
        return { code: code.replace(/^#![^\r\n]*(?:\r?\n|$)/, ""), map: null };
      }
    },
  }],
  test: {
    include: [
      "packages/*/tests/**/*.test.ts",
      "tools/oxlint/*/tests/**/*.test.ts",
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
