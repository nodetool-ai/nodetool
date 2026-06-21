/**
 * Workflow debug harness spec — the browser surface of `nodetool debug`.
 *
 * Loads the e2e_runner harness page in manual mode, kicks off the caller-supplied
 * graph via `window.__E2E__.runGraph(...)` WITHOUT awaiting it, then polls
 * `window.__E2E__.snapshot()` and captures a canvas screenshot at every stage of
 * the run (initial render → each node starting/finishing → settled). The record,
 * the staged screenshots, a final screenshot and any browser console errors are
 * written into NODETOOL_DEBUG_OUT for the CLI to read back.
 *
 * Inputs (env):
 *   NODETOOL_DEBUG_GRAPH   path to a JSON file: either a bare graph or { graph }.
 *   NODETOOL_DEBUG_OUT     directory to write record.json / screenshot.png / stages/.
 *   NODETOOL_DEBUG_PARAMS  optional JSON object of run params.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunRecord, RunSnapshot } from "../../src/e2e_runner/types";

const GRAPH_PATH = process.env.NODETOOL_DEBUG_GRAPH;
const OUT_DIR = process.env.NODETOOL_DEBUG_OUT;
const PARAMS_JSON = process.env.NODETOOL_DEBUG_PARAMS;
/** Opt-in: capture a screenshot at every run stage (expensive). */
const CAPTURE_STAGES =
  process.env.NODETOOL_DEBUG_STAGES === "1" || process.env.NODETOOL_DEBUG_STAGES === "true";

const POLL_MS = 120;
/** Don't snap more often than this even if stages tick fast. */
const MIN_INTERVAL_MS = 180;
/** Cap the number of intermediate stage frames (excludes the final). */
const MAX_STAGES = 16;
const MAX_WAIT_MS = 5 * 60_000;

interface StageShot {
  index: number;
  stage: number;
  status: string;
  /** Path relative to OUT_DIR. */
  file: string;
}

/** Run the graph while capturing a screenshot at each new stage. */
async function captureStages(page: Page, stagesDir: string): Promise<StageShot[]> {
  const shots: StageShot[] = [];
  let lastStage = -1;
  let lastShotAt = 0;
  const deadline = Date.now() + MAX_WAIT_MS;

  const snap = async (): Promise<StageShot | null> => {
    const s = (await page.evaluate(() => window.__E2E__!.snapshot())) as RunSnapshot;
    const due = s.stage !== lastStage && Date.now() - lastShotAt >= MIN_INTERVAL_MS;
    if (due && shots.length < MAX_STAGES) {
      lastStage = s.stage;
      lastShotAt = Date.now();
      const index = shots.length;
      const file = `stages/${String(index).padStart(2, "0")}-${s.status}.png`;
      await page.screenshot({ path: resolve(stagesDir, "..", file) });
      shots.push({ index, stage: s.stage, status: s.status, file });
    }
    return s.settled ? ({ index: -1, stage: s.stage, status: s.status, file: "" }) : null;
  };

  // Let the canvas paint the initial graph before the first frame.
  await page.waitForTimeout(300);
  while (Date.now() < deadline) {
    const settled = await snap();
    if (settled) break;
    await page.waitForTimeout(POLL_MS);
  }
  return shots;
}

test("debug harness runs the target workflow", async ({ page }) => {
  test.setTimeout(MAX_WAIT_MS + 30_000);

  if (!GRAPH_PATH || !OUT_DIR) {
    test.skip(true, "NODETOOL_DEBUG_GRAPH and NODETOOL_DEBUG_OUT are required");
    return;
  }

  mkdirSync(CAPTURE_STAGES ? resolve(OUT_DIR, "stages") : OUT_DIR, { recursive: true });
  const raw = JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as {
    graph?: { nodes: unknown[]; edges: unknown[] };
    nodes?: unknown[];
    edges?: unknown[];
  };
  const graph = raw.graph ?? { nodes: raw.nodes ?? [], edges: raw.edges ?? [] };
  const params = PARAMS_JSON ? (JSON.parse(PARAMS_JSON) as Record<string, unknown>) : {};

  // Known noise from the harness page scaffolding (not the workflow under test):
  // it has no agent WebSocket backend and renders a component that calls
  // useNavigate outside a Router. Filter these so the report reflects the
  // workflow, not the test harness.
  const HARNESS_NOISE = [/\/ws\/agent/, /useNavigate\(\) may be used only/];
  const isWorkflowError = (text: string) => !HARNESS_NOISE.some((re) => re.test(text));

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && isWorkflowError(msg.text())) consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (isWorkflowError(String(err))) consoleErrors.push(String(err));
  });

  await page.goto("/e2e-runner.html?manual=1");
  await page.waitForFunction(() => Boolean(window.__E2E__), undefined, {
    timeout: 90_000
  });

  let record: RunRecord;
  let stages: StageShot[] = [];
  try {
    if (CAPTURE_STAGES) {
      // Start the run but DON'T await it here, so we can screenshot mid-flight.
      await page.evaluate(
        ([g, p]) => {
          (window as unknown as { __DEBUG_RUN__?: Promise<RunRecord> }).__DEBUG_RUN__ =
            window.__E2E__!.runGraph(
              g as { nodes: unknown[]; edges: unknown[] },
              p as Record<string, unknown>
            );
        },
        [graph, params] as const
      );
      stages = await captureStages(page, resolve(OUT_DIR, "stages"));
      record = (await page.evaluate(
        () => (window as unknown as { __DEBUG_RUN__: Promise<RunRecord> }).__DEBUG_RUN__
      )) as RunRecord;
    } else {
      // Cheap default: run to completion, capture only the final frame below.
      record = (await page.evaluate(
        ([g, p]) =>
          window.__E2E__!.runGraph(
            g as { nodes: unknown[]; edges: unknown[] },
            p as Record<string, unknown>
          ),
        [graph, params] as const
      )) as RunRecord;
    }
  } catch (err) {
    // Surface the failure as an error record rather than failing the spec — the
    // CLI wants the artifacts regardless of how the run ended.
    record = {
      id: "adhoc",
      name: "ad-hoc graph",
      file: "",
      status: "error",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      params,
      jobId: null,
      error: err instanceof Error ? err.message : String(err),
      outputs: [],
      logs: [],
      artifacts: [],
      nodeIO: {},
      events: [],
      counts: { nodes: 0, outputs: 0, errors: 0, edgeUpdates: 0 },
      expectationFailures: []
    };
  }

  // Final settled frame (canonical screenshot.png).
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, "screenshot.png") });

  writeFileSync(resolve(OUT_DIR, "record.json"), JSON.stringify(record, null, 2));
  if (CAPTURE_STAGES) {
    writeFileSync(resolve(OUT_DIR, "stages.json"), JSON.stringify(stages, null, 2));
  }
  if (consoleErrors.length > 0) {
    writeFileSync(resolve(OUT_DIR, "console-errors.log"), consoleErrors.join("\n"));
  }

  expect(record, "harness returned a record").toBeTruthy();
});
