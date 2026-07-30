/**
 * Live `BrowserDriver` test — actually spawns Playwright against the
 * `e2e_runner` debug-harness page (Vite dev server + hermetic backend via
 * `globalSetup`). Slow (dev server cold start) and environment-dependent
 * (Playwright + Chromium must be installed), so it's skipped rather than
 * failed the build when `isAvailable()` says no — see the module doc comment
 * in `src/drivers/browser.ts` for why a live run isn't guaranteed in every
 * sandbox, and `tests/drivers/browser.test.ts` for the converter unit tests
 * that always run.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney } from "../../src/core/journey.js";
import { BrowserDriver } from "../../src/drivers/browser.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");
const driver = new BrowserDriver();
const available = driver.isAvailable();

describe.skipIf(!available)("BrowserDriver (live Playwright run)", () => {
  it(
    "runs linear-text-pipeline through the real web stack",
    { timeout: 180_000 },
    async (ctx) => {
      const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
      try {
        const record = await driver.run(journey);
        expect(record.surface).toBe("browser");
        expect(record.status).toBe("completed");
        expect(record.frames.length).toBeGreaterThan(0);
      } catch (err) {
        // A missing/mismatched Chromium *binary* (not code, not config) is a
        // sandbox provisioning gap this task is explicitly allowed to skip
        // rather than fail on ("never run playwright install" + the C4 task's
        // "document which mode you achieved") — anything else is a real
        // failure of this driver.
        const message = String(err);
        if (/Executable doesn't exist/.test(message)) {
          ctx.skip();
          return;
        }
        throw err;
      }
    }
  );
});

describe.skipIf(available)("BrowserDriver (unavailable in this environment)", () => {
  it("documents why", () => {
    expect(available).toBe(false);
  });
});
