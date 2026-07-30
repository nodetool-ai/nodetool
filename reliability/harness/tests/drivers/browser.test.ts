/**
 * Unit tests for the browser driver's pure conversion half
 * (`runRecordFromBrowserRecord`) against a fabricated `record.json` shape,
 * plus `isAvailable()`/`supports()`. See the module doc comment in
 * `src/drivers/browser.ts` for why this is a converter-first test: whether a
 * live Playwright run is actually exercised in this environment is reported
 * separately (see the task's "browser caveat").
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { BrowserDriver, runRecordFromBrowserRecord } from "../../src/drivers/browser.js";
import { loadJourney } from "../../src/core/journey.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");

describe("runRecordFromBrowserRecord", () => {
  it("folds a decoded browser record.json into a RunRecord", () => {
    const record = runRecordFromBrowserRecord(
      {
        status: "completed",
        error: null,
        durationMs: 123,
        jobId: "job-1",
        events: [
          { type: "job_update", status: "running", job_id: "job-1" },
          { type: "job_update", status: "completed", job_id: "job-1" }
        ]
      },
      { journeyId: "linear-text-pipeline" }
    );
    expect(record.surface).toBe("browser");
    expect(record.status).toBe("completed");
    expect(record.jobId).toBe("job-1");
    expect(record.frames).toHaveLength(2);
    expect(record.frames.every((f) => f.direction === "server_to_client")).toBe(true);
  });

  it("defaults to status \"unknown\" and no frames for an empty record", () => {
    const record = runRecordFromBrowserRecord({});
    expect(record.status).toBe("unknown");
    expect(record.frames).toHaveLength(0);
  });
});

describe("BrowserDriver.supports", () => {
  it("supports a single unscripted run interaction", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
    expect(new BrowserDriver().supports(journey)).toBe(true);
  });

  it("does not support a scripted cancel journey", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "mid-run-cancel-node"));
    expect(new BrowserDriver().supports(journey)).toBe(false);
  });
});

describe("BrowserDriver.isAvailable", () => {
  it("reports availability without throwing", () => {
    // Environment-dependent (Playwright + the debug-harness config must both
    // exist) — this only proves the check itself is safe to call, not which
    // way it resolves in any given sandbox.
    expect(() => new BrowserDriver().isAvailable()).not.toThrow();
  });
});
