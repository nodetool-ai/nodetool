import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Auto-clean shared state between every test so suites cannot leak mocks,
    // global stubs (e.g. `vi.stubGlobal("fetch", ...)`), or env changes into
    // each other. This keeps the suite deterministic regardless of how the
    // pool schedules files across worker processes under CI load.
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true
  }
});
