/**
 * The workflow debug harness orchestrator.
 *
 * Resolves a target workflow, runs it on the requested surfaces (headless server
 * and/or real browser), folds everything into a `DebugReport`, and writes a
 * self-contained debug bundle to disk. Returns the report so an agent can act on
 * it directly and iterate (edit → re-run) without re-reading files.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { initTelemetry } from "@nodetool-ai/runtime";
import { runOnServer } from "./server-runner.js";
import { runInBrowser } from "./browser-runner.js";
import { buildVerdict } from "./verdict.js";
import { renderReportMarkdown } from "./markdown.js";
import { resolveTarget } from "./target.js";
import type {
  DebugGraph,
  DebugOptions,
  DebugReport
} from "./types.js";

export interface DebugHarnessDeps {
  /** Load a workflow graph by DB id (injected to keep models out of light paths). */
  loadFromDb: (id: string) => Promise<{ graph: DebugGraph } | null>;
  /** Progress/log sink for surfacing child-process output. */
  onLog?: (line: string) => void;
}

function defaultOutDir(ref: string): string {
  const slug = ref.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workflow";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/${slug}-${stamp}`);
}

export async function runDebug(
  ref: string,
  options: DebugOptions,
  deps: DebugHarnessDeps
): Promise<DebugReport> {
  const runServer = options.server ?? true;
  // `--stages` is a browser-surface modifier, so opting into it implies the
  // browser surface.
  const runBrowser = (options.browser ?? false) || (options.stages ?? false);
  const captureTrace = options.trace ?? false;
  const log = deps.onLog ?? (() => {});

  const resolved = await resolveTarget(ref, deps.loadFromDb);
  const params = { ...resolved.fileParams, ...(options.params ?? {}) };

  const outDir = options.outDir ? resolve(options.outDir) : defaultOutDir(ref);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "workflow.json"), JSON.stringify(resolved.graph, null, 2), "utf8");

  const report: DebugReport = {
    generatedAt: new Date().toISOString(),
    target: resolved.info,
    workflow: resolved.graph,
    server: null,
    browser: null,
    verdict: { ok: false, headline: "", issues: [] },
    bundleDir: outDir
  };

  if (runServer) {
    log("Running workflow on the server surface…");
    const serverDir = join(outDir, "server");
    await mkdir(serverDir, { recursive: true });

    // Tracing is opt-in (`--trace`): loading the OTel SDK and processing spans
    // is real overhead. When enabled, route span output into the bundle — this
    // wins because the `debug` command skips the global telemetry init.
    let tracePath: string | null = null;
    if (captureTrace) {
      tracePath = join(serverDir, "trace.jsonl");
      await initTelemetry({ traceFile: tracePath, silent: true });
    }

    const outcome = await runOnServer({
      graph: resolved.graph,
      workflowId: resolved.info.workflowId,
      params,
      tracePath,
      timeoutMs: options.timeoutMs
    });

    const messagesPath = join(serverDir, "messages.jsonl");
    await writeFile(
      messagesPath,
      outcome.rawMessages.map((m) => JSON.stringify(m)).join("\n") + "\n",
      "utf8"
    );
    outcome.report.messagesFile = "server/messages.jsonl";
    if (outcome.report.trace) outcome.report.traceFile = "server/trace.jsonl";
    report.server = outcome.report;
    log(
      `Server run: ${outcome.report.status} · ${outcome.report.summary.counts.errored} node error(s)`
    );
  }

  if (runBrowser) {
    log("Running workflow on the browser surface (Playwright)…");
    const browserDir = join(outDir, "browser");
    report.browser = await runInBrowser({
      graph: resolved.graph,
      params,
      outDir: browserDir,
      captureStages: options.stages ?? false,
      timeoutMs: options.timeoutMs,
      onLog: log
    });
    log(
      report.browser.unavailableReason
        ? `Browser run skipped: ${report.browser.unavailableReason}`
        : `Browser run: ${report.browser.status} · ${report.browser.consoleErrors.length} console error(s)`
    );
  }

  report.verdict = buildVerdict(report.server, report.browser);

  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outDir, "report.md"), renderReportMarkdown(report), "utf8");

  return report;
}
