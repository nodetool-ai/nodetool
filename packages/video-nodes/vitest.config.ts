import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests import this package by name. Resolve that to src/ rather than the
  // built dist/, so tests run the current source and coverage lands on it.
  resolve: {
    alias: [
      {
        find: /^@nodetool-ai\/video-nodes$/,
        replacement: resolve(__dirname, "src/index.ts")
      }
    ]
  },
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // RenderTimeline tries headless Chromium first. The node's own tests
    // cover the Node compositor; the browser path has its own suite, which
    // opts back in.
    env: { NODETOOL_TIMELINE_RENDERER: "node" }
  }
});
