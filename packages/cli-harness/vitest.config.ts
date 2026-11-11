import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vite moves a CRLF script's shebang after its SSR imports, making it invalid JS.
    server: { deps: { external: [/[/\\]scripts[/\\](test-affected|ci-plan)\.mjs$/] } },
    include: ["tests/**/*.test.ts", "src/**/__tests__/**/*.test.ts"]
  }
});
