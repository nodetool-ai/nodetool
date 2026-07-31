import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The python-bridge reconnect tests drive real sockets and wait up to 10s
    // for a reconnect. Vitest's 5s default cut them off below their own stated
    // budget, so they passed on a fast machine and timed out under CI load.
    // 30s matches every other package here.
    testTimeout: 30000,
    // Auto-clean shared state between every test so suites cannot leak mocks,
    // global stubs (e.g. `vi.stubGlobal("fetch", ...)`), or env changes into
    // each other. This keeps the suite deterministic regardless of how the
    // pool schedules files across worker processes under CI load.
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true
  }
});
