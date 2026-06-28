import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
    // GPU/shader regression tests do real Dawn (WebGPU) work — adapter init plus
    // compute runs 5–8s on shared CI runners, past vitest's 5s default and into
    // intermittent "Test timed out in 5000ms" failures. Give them headroom; the
    // assertions are unchanged, so a genuinely hung test still trips the limit.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
