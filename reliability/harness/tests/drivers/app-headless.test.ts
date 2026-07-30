/**
 * Unit tests for the app-headless driver's pure conversion half
 * (`runRecordFromAppDebugReport`) and its `supports()`/`journeyHasAppDoc`
 * applicability check. No journey today carries an `app_doc` (C4 item 8's
 * "headless-app or n/a-clean" leg), so the fabricated report here is what
 * proves the conversion works ahead of a real one existing.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  AppHeadlessDriver,
  journeyHasAppDoc,
  runRecordFromAppDebugReport
} from "../../src/drivers/app-headless.js";
import { loadJourney } from "../../src/core/journey.js";

const JOURNEYS_DIR = resolve(__dirname, "../../../journeys");

describe("journeyHasAppDoc / AppHeadlessDriver.supports", () => {
  it("is false for every seed journey (none carry an app_doc yet)", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
    expect(journeyHasAppDoc(journey)).toBe(false);
    expect(new AppHeadlessDriver().supports(journey)).toBe(false);
  });

  it("is true once the workflow carries a top-level app_doc", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
    const withApp = { ...journey, workflow: { ...journey.workflow, app_doc: { version: 1 } } };
    expect(journeyHasAppDoc(withApp)).toBe(true);
    expect(new AppHeadlessDriver().supports(withApp)).toBe(true);
  });

  it("run() throws a clear not-applicable error when unsupported", async () => {
    const journey = await loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
    await expect(new AppHeadlessDriver().run(journey)).rejects.toThrow(/n\/a/);
  });
});

describe("runRecordFromAppDebugReport", () => {
  it("folds a single completed run's messages into a RunRecord", () => {
    const report = {
      target: { workflowId: "app-journey" },
      runs: [{ status: "completed", error: null, durationMs: 42 }]
    };
    const messages = [
      [
        { type: "job_update", status: "running" },
        { type: "job_update", status: "completed" }
      ]
    ];
    const record = runRecordFromAppDebugReport(report, messages, { journeyId: "app-journey" });
    expect(record.surface).toBe("app-headless");
    expect(record.status).toBe("completed");
    expect(record.error).toBeNull();
    expect(record.workflowId).toBe("app-journey");
    expect(record.frames).toHaveLength(2);
    expect(record.frames[0].direction).toBe("server_to_client");
  });

  it("reports the first non-completed run's status/error when a run failed", () => {
    const report = {
      target: { workflowId: "app-journey" },
      runs: [
        { status: "completed", error: null },
        { status: "failed", error: "node X failed" }
      ]
    };
    const record = runRecordFromAppDebugReport(report, [[], []]);
    expect(record.status).toBe("failed");
    expect(record.error).toBe("node X failed");
  });

  it("reports status \"unknown\" when no operation ever ran", () => {
    const record = runRecordFromAppDebugReport({ target: null, runs: [] }, []);
    expect(record.status).toBe("unknown");
    expect(record.frames).toHaveLength(0);
  });
});
