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
import { spawn, type ChildProcess } from "node:child_process";
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

/** Grace period between SIGTERM and SIGKILL when tearing down the child's process group. */
const GROUP_KILL_GRACE_MS = 5_000;

/**
 * Kill the Playwright child on timeout. Playwright's webServer (Vite) and the
 * tsx e2e backend spawned by globalSetup are children of this process, not of
 * `child` itself, so a plain `child.kill()` orphans them holding ports
 * 3000/7777. On POSIX, `child` is spawned detached (its own process group), so
 * we can kill the whole group via the negative pid; on win32 (no process
 * groups, and no `shell: true` here) fall back to killing just the child.
 */
function killChild(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    const pgid = child.pid;
    try {
      process.kill(-pgid, "SIGTERM");
    } catch {
      // Process group may already be gone.
    }
    setTimeout(() => {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // Process group may already be gone.
      }
    }, GROUP_KILL_GRACE_MS).unref();
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Already exited.
  }
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
    ...(input.captureStages ? { NODETOOL_DEBUG_STAGES: "1" } : {}),
    // Read by debug.spec.ts to arm the in-page run's own timeout, so the
    // Playwright spec doesn't fall back to its internal RUN_TIMEOUT_MS cap.
    ...(input.timeoutMs ? { NODETOOL_DEBUG_TIMEOUT: String(input.timeoutMs) } : {})
  };

  // The child-kill timer below is the outer backstop; it must stay comfortably
  // above the in-page timeout the spec applies, or the child gets killed
  // before the harness can settle and write record.json.
  const killTimeoutMs =
    input.timeoutMs !== undefined
      ? Math.max(input.timeoutMs + 60_000, DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  const isWindows = process.platform === "win32";
  const exitCode = await new Promise<number>((resolvePromise) => {
    const child = spawn(playwrightBin, ["test", "-c", CONFIG_REL], {
      cwd: webDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      // .bin/playwright is a shell shim on win32 (no .exe), so it needs a
      // shell to resolve; shell mode has no process groups, so detach only
      // on POSIX where killChild can use them for whole-tree teardown.
      ...(isWindows ? { shell: true } : { detached: true })
    });
    const onChunk = (buf: Buffer) => input.onLog?.(buf.toString());
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    const timer = setTimeout(() => {
      killChild(child);
      resolvePromise(124);
    }, killTimeoutMs);
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
