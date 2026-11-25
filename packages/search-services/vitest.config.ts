import { defineConfig } from "vitest/config";

// The PostgreSQL cases start PGlite and apply the whole migration chain, which
// takes longer than the 5 second default on a loaded CI runner.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 } });
