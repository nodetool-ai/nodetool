/**
 * Workflow debug harness spec — the browser surface of `nodetool debug`.
 *
 * Loads the e2e_runner harness page in manual mode, runs the caller-supplied
 * graph through `window.__E2E__.runGraph(...)`, and writes the resulting record,
 * a canvas screenshot and any browser console errors into NODETOOL_DEBUG_OUT.
 * The CLI reads those artifacts back to build the browser run report.
 *
 * Inputs (env):
 *   NODETOOL_DEBUG_GRAPH   path to a JSON file: either a bare graph or { graph }.
 *   NODETOOL_DEBUG_OUT     directory to write record.json / screenshot.png / console-errors.log.
 *   NODETOOL_DEBUG_PARAMS  optional JSON object of run params.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RunRecord } from "../../src/e2e_runner/types";

const GRAPH_PATH = process.env.NODETOOL_DEBUG_GRAPH;
const OUT_DIR = process.env.NODETOOL_DEBUG_OUT;
const PARAMS_JSON = process.env.NODETOOL_DEBUG_PARAMS;

test("debug harness runs the target workflow", async ({ page }) => {
  test.setTimeout(5 * 60_000);

  if (!GRAPH_PATH || !OUT_DIR) {
    test.skip(true, "NODETOOL_DEBUG_GRAPH and NODETOOL_DEBUG_OUT are required");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
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
  try {
    record = (await page.evaluate(
      ([g, p]) =>
        window.__E2E__!.runGraph(
          g as { nodes: unknown[]; edges: unknown[] },
          p as Record<string, unknown>
        ),
      [graph, params] as const
    )) as RunRecord;
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

  // Let the canvas settle on the finished graph before capturing.
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, "screenshot.png") });

  writeFileSync(resolve(OUT_DIR, "record.json"), JSON.stringify(record, null, 2));
  if (consoleErrors.length > 0) {
    writeFileSync(resolve(OUT_DIR, "console-errors.log"), consoleErrors.join("\n"));
  }

  expect(record, "harness returned a record").toBeTruthy();
});
