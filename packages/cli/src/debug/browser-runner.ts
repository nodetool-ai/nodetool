/**
 * Real-browser ("browser") debug surface: drives the `e2e_runner` harness page
 * in headless Chromium via Playwright to execute the workflow end-to-end through
 * the actual web stack, capturing browser console errors, a canvas screenshot,
 * and the same logs / node IO / outputs the server surface reports.
 *
 * The heavy lifting (Vite + hermetic backend + the harness page) already exists
 * in `web/`; this module just resolves the web workspace, shells out to the
 * Playwright spec, and folds the resulting RunRecord into a `BrowserRunReport`.
 * It degrades gracefully (an `unavailableReason`) when the web deps or browser
 * binaries aren't installed.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectExecutionSummary } from "./collector.js";
import type { BrowserRunReport, DebugGraph } from "./types.js";

const CONFIG_REL = "playwright.debug-harness.config.ts";
const DEFAULT_TIMEOUT_MS = 6 * 60_000;

/** Walk up from this module to the repo root (the dir whose `web/` has our config). */
function findWebDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "web");
    if (existsSync(join(candidate, CONFIG_REL))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export interface BrowserRunInput {
  graph: DebugGraph;
  params: Record<string, unknown>;
  /** Bundle dir for the browser surface; record/screenshot/console land here. */
  outDir: string;
  /** Capture a screenshot at every run stage (expensive) vs. only the final frame. */
  captureStages?: boolean;
  timeoutMs?: number;
  /** Stream the Playwright child's stdout/stderr through. */
  onLog?: (line: string) => void;
}

interface BrowserRecord {
  status?: string;
  error?: string | null;
  durationMs?: number | null;
  events?: Array<Record<string, unknown>>;
}

interface StageEntry {
  index: number;
  status: string;
  /** Path relative to the browser out dir (e.g. "stages/00-running.png"). */
  file: string;
}

function unavailable(reason: string): BrowserRunReport {
  return {
    surface: "browser",
    ok: false,
    status: "unavailable",
    error: null,
    durationMs: null,
    summary: collectExecutionSummary([]),
    consoleErrors: [],
    unavailableReason: reason
  };
}

export async function runInBrowser(input: BrowserRunInput): Promise<BrowserRunReport> {
  const webDir = findWebDir();
  if (!webDir) return unavailable("could not locate the web workspace");

  const playwrightBin = join(webDir, "node_modules", ".bin", "playwright");
  if (!existsSync(playwrightBin)) {
    return unavailable(
      "web dependencies not installed (run `npm install` and `npx playwright install chromium`)"
    );
  }

  await mkdir(input.outDir, { recursive: true });
  const graphPath = join(input.outDir, "_graph.json");
  await writeFile(graphPath, JSON.stringify({ graph: input.graph }), "utf8");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODETOOL_DEBUG_GRAPH: graphPath,
    NODETOOL_DEBUG_OUT: input.outDir,
    NODETOOL_DEBUG_PARAMS: JSON.stringify(input.params ?? {}),
    ...(input.captureStages ? { NODETOOL_DEBUG_STAGES: "1" } : {})
  };

  const exitCode = await new Promise<number>((resolvePromise) => {
    const child = spawn(playwrightBin, ["test", "-c", CONFIG_REL], {
      cwd: webDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const onChunk = (buf: Buffer) => input.onLog?.(buf.toString());
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise(124);
    }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolvePromise(127);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolvePromise(code ?? 1);
    });
  });

  return buildBrowserReport(input.outDir, exitCode);
}

/**
 * Fold the artifacts a Playwright debug run leaves in `outDir`
 * (record.json, console-errors.log, screenshot.png) into a `BrowserRunReport`.
 * Pure file IO — separated from the spawn so it's directly testable against a
 * real captured bundle.
 */
export async function buildBrowserReport(
  outDir: string,
  exitCode = 0
): Promise<BrowserRunReport> {
  const recordPath = join(outDir, "record.json");
  if (!existsSync(recordPath)) {
    return unavailable(
      `Playwright run produced no record (exit ${exitCode}); check that the web app builds and chromium is installed`
    );
  }

  let record: BrowserRecord;
  try {
    record = JSON.parse(await readFile(recordPath, "utf8")) as BrowserRecord;
  } catch (err) {
    return unavailable(`could not parse browser record: ${String(err)}`);
  }

  const consoleErrors = existsSync(join(outDir, "console-errors.log"))
    ? (await readFile(join(outDir, "console-errors.log"), "utf8")).split("\n").filter(Boolean)
    : [];

  const summary = collectExecutionSummary(record.events ?? []);
  const status = record.status ?? summary.status;

  const report: BrowserRunReport = {
    surface: "browser",
    ok: status === "completed",
    status,
    error: record.error ?? summary.error,
    durationMs: record.durationMs ?? null,
    summary,
    consoleErrors,
    recordFile: "browser/record.json"
  };
  if (existsSync(join(outDir, "screenshot.png"))) {
    report.screenshotFile = "browser/screenshot.png";
  }

  if (existsSync(join(outDir, "stages.json"))) {
    try {
      const stages = JSON.parse(await readFile(join(outDir, "stages.json"), "utf8")) as StageEntry[];
      report.stages = stages.map((s) => ({
        index: s.index,
        status: s.status,
        file: `browser/${s.file}`
      }));
    } catch {
      // A malformed stages manifest just means no staged screenshots.
    }
  }

  return report;
}
