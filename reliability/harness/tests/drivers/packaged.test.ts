/**
 * `PackagedDriver` test — boots the staged backend bundle's `server.mjs` and
 * runs a journey against it over the real WS protocol. EXPENSIVE (staging
 * alone takes minutes, and this test also boots a whole Node process), so
 * it's opt-in behind `RELIABILITY_PACKAGED=1` — same gating rationale as
 * `backend:smoke`'s own CI leg.
 *
 * `RELIABILITY_PACKAGED=1 npx vitest run tests/drivers/packaged.test.ts` from
 * `reliability/harness/`. Assumes a bundle is already staged at
 * `electron/backend-bundle` (`npm run prepare-backend --workspace=electron`,
 * or `stageBackendBundle()`) — staging itself is not re-run on every test
 * invocation, to keep the opt-in test itself fast to iterate on.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "node:path";
import { loadJourney } from "../../src/core/journey.js";
import { PackagedDriver } from "../../src/drivers/packaged.js";
import { findRepoRoot } from "../../src/drivers/repo-root.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const RUN_PACKAGED = process.env.RELIABILITY_PACKAGED === "1";
const bundleDir = join(findRepoRoot(), "electron", "backend-bundle");
const staged = existsSync(join(bundleDir, "server.mjs"));

describe.skipIf(!RUN_PACKAGED)("PackagedDriver (opt-in, RELIABILITY_PACKAGED=1)", () => {
  it(
    "runs linear-text-pipeline against the staged server.mjs over the real WS protocol",
    { timeout: 180_000 },
    async () => {
      if (!staged) {
        throw new Error(
          `no staged bundle at ${bundleDir} — run ` +
            `'npm run prepare-backend --workspace=electron' first`
        );
      }
      const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
      const record = await new PackagedDriver({ bundleDir }).run(journey);
      expect(record.surface).toBe("packaged");
      expect(record.status).toBe("completed");
      expect(record.error).toBeNull();
      expect(record.frames.length).toBeGreaterThan(0);
    }
  );
});

describe.skipIf(RUN_PACKAGED)("PackagedDriver (skipped)", () => {
  it("documents the opt-in gate", () => {
    expect(RUN_PACKAGED).toBe(false);
  });
});
