/**
 * Tests for the browser surface artifact folding (src/debug/browser-runner.ts).
 *
 * Covers `buildBrowserReport` — the pure step that turns the Playwright run's
 * on-disk artifacts (record.json, console-errors.log, screenshot.png) into a
 * `BrowserRunReport` — plus the "no record" unavailable path. The spawn itself
 * is exercised by `web/tests/debug-harness/debug.spec.ts`.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBrowserReport } from "../src/debug/browser-runner.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "debug-browser-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("buildBrowserReport", () => {
  it("folds a completed run record + console errors + screenshot", async () => {
    // The shape a real harness run produces (see web/tests/debug-harness).
    writeFileSync(
      join(dir, "record.json"),
      JSON.stringify({
        status: "completed",
        durationMs: 142,
        outputs: [{ output_name: "result", value: "hello debug harness" }],
        events: [
          { type: "node_update", node_id: "o", node_type: "ns.Out", status: "completed" },
          {
            type: "output_update",
            node_id: "o",
            output_name: "result",
            output_type: "any",
            value: "hello debug harness"
          },
          { type: "job_update", status: "completed" }
        ]
      })
    );
    writeFileSync(join(dir, "console-errors.log"), "TypeError: boom\n");
    writeFileSync(join(dir, "screenshot.png"), "fake-png-bytes");
    writeFileSync(
      join(dir, "stages.json"),
      JSON.stringify([
        { index: 0, status: "running", file: "stages/00-running.png" },
        { index: 1, status: "completed", file: "stages/01-completed.png" }
      ])
    );

    const report = await buildBrowserReport(dir);
    expect(report.surface).toBe("browser");
    expect(report.ok).toBe(true);
    expect(report.status).toBe("completed");
    expect(report.durationMs).toBe(142);
    expect(report.consoleErrors).toEqual(["TypeError: boom"]);
    expect(report.screenshotFile).toBe("browser/screenshot.png");
    expect(report.recordFile).toBe("browser/record.json");
    expect(report.summary.outputs[0].value).toBe("hello debug harness");
    expect(report.unavailableReason).toBeUndefined();
    // Staged screenshots are folded in with bundle-relative paths.
    expect(report.stages).toEqual([
      { index: 0, status: "running", file: "browser/stages/00-running.png" },
      { index: 1, status: "completed", file: "browser/stages/01-completed.png" }
    ]);
  });

  it("reports unavailable when no record was produced", async () => {
    const report = await buildBrowserReport(dir, 1);
    expect(report.ok).toBe(false);
    expect(report.status).toBe("unavailable");
    expect(report.unavailableReason).toContain("no record");
  });

  it("marks a failed run not-ok", async () => {
    writeFileSync(
      join(dir, "record.json"),
      JSON.stringify({
        status: "error",
        error: "node blew up",
        events: [{ type: "job_update", status: "failed", error: "node blew up" }]
      })
    );
    const report = await buildBrowserReport(dir);
    expect(report.ok).toBe(false);
    expect(report.status).toBe("error");
    expect(report.error).toBe("node blew up");
    expect(report.screenshotFile).toBeUndefined();
  });
});
