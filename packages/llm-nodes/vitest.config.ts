import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests import this package by name. Resolve that to src/ rather than the
  // built dist/, so tests run the current source and coverage lands on it.
  resolve: {
    alias: [
      {
        find: /^@nodetool-ai\/llm-nodes\/gemini$/,
        replacement: resolve(__dirname, "src/nodes/gemini.ts")
      },
      {
        find: /^@nodetool-ai\/llm-nodes\/openai$/,
        replacement: resolve(__dirname, "src/nodes/openai.ts")
      },
      {
        find: /^@nodetool-ai\/llm-nodes\/xai$/,
        replacement: resolve(__dirname, "src/nodes/xai.ts")
      },
      {
        find: /^@nodetool-ai\/llm-nodes$/,
        replacement: resolve(__dirname, "src/index.ts")
      }
    ]
  },
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
