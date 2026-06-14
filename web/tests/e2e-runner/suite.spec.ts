/**
 * E2E workflow suite driver.
 *
 * Loads the harness page in manual mode, steps through each workflow, captures a
 * canvas screenshot + per-workflow artifacts (record, outputs, raw events),
 * writes results.json, generates the self-contained HTML report, then asserts
 * that every non-skipped workflow completed and met its expectations.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ARTIFACT_DIR, TRACE_FILE } from "./globalSetup";
import { generateReport, type ReportRecord } from "./generateReport";
import type { RunRecord } from "../../src/e2e_runner/types";

test.describe.configure({ mode: "serial" });

test("workflow suite executes and records artifacts", async ({ page }) => {
  test.setTimeout(20 * 60_000);

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/e2e-runner.html?manual=1");
  await page.waitForFunction(() => Boolean(window.__E2E__), undefined, {
    timeout: 90_000
  });

  const total = await page.evaluate(() => window.__E2E__!.manifest().length);
  expect(total, "manifest should list workflows").toBeGreaterThan(0);

  const screenshotsDir = resolve(ARTIFACT_DIR, "screenshots");
  mkdirSync(screenshotsDir, { recursive: true });
  const records: ReportRecord[] = [];

  for (let i = 0; i < total; i++) {
    const rec = (await page.evaluate(() => window.__E2E__!.runNext())) as
      | RunRecord
      | null;
    if (!rec) break;

    // Let the canvas settle on the finished graph before capturing.
    await page.waitForTimeout(400);
    const screenshotRel = `screenshots/${rec.id}.png`;
    await page.screenshot({ path: resolve(ARTIFACT_DIR, screenshotRel) });

    const wfDir = resolve(ARTIFACT_DIR, "workflows", rec.id);
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(resolve(wfDir, "record.json"), JSON.stringify(rec, null, 2));
    writeFileSync(
      resolve(wfDir, "outputs.json"),
      JSON.stringify(rec.outputs, null, 2)
    );
    writeFileSync(
      resolve(wfDir, "events.json"),
      JSON.stringify(rec.events, null, 2)
    );

    records.push({ ...(rec as unknown as ReportRecord), screenshot: screenshotRel });
  }

  writeFileSync(resolve(ARTIFACT_DIR, "results.json"), JSON.stringify(records, null, 2));
  if (consoleErrors.length > 0) {
    writeFileSync(
      resolve(ARTIFACT_DIR, "console-errors.log"),
      consoleErrors.join("\n")
    );
    console.log(
      `[e2e suite] ${consoleErrors.length} browser console error(s):\n` +
        consoleErrors.map((e) => `  ${e}`).join("\n")
    );
  }
  const reportPath = generateReport(records, {
    outDir: ARTIFACT_DIR,
    title: "NodeTool E2E Workflow Report",
    traceFile: existsSync(TRACE_FILE) ? "traces.jsonl" : undefined,
    generatedAt: new Date().toISOString()
  });
  console.log(`[e2e suite] Report written to ${reportPath}`);

  // Assertions — written after artifacts so the report is always produced.
  const hardFailures = records.filter(
    (r) => r.status !== "completed" && r.status !== "skipped"
  );
  const expectationFailures = records.filter(
    (r) => r.expectationFailures.length > 0
  );

  expect(
    hardFailures.map((r) => `${r.id}: ${r.status}${r.error ? ` (${r.error})` : ""}`),
    "all non-skipped workflows should complete"
  ).toEqual([]);
  expect(
    expectationFailures.map((r) => `${r.id}: ${r.expectationFailures.join("; ")}`),
    "all expectations should be met"
  ).toEqual([]);
});
