import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // Every other package here sets 30s; this one was left on Vitest's 5s
    // default, which is why it is the package that times out when the
    // `test-packages` leg runs the workspace in parallel. The AgentNode tool
    // loop tests take a few hundred milliseconds on an idle machine and pass
    // locally either way — the margin is the runner's, not the test's.
    testTimeout: 30000
  }
});
