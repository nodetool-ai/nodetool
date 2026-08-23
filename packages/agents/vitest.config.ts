import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // The default worker count overloads QuickJS and native media libraries on
    // large Windows hosts. The overload causes unrelated 30-second timeouts.
    maxWorkers: process.platform === "win32" ? 4 : undefined
  }
});
