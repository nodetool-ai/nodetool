/**
 * `nodetool debug` — the workflow debug harness command.
 *
 * Runs a workflow end-to-end on the headless server and (optionally) in a real
 * browser, then writes a debug bundle (workflow JSON, every message/log/output/
 * error, an OpenTelemetry trace summary, plus browser console errors and a
 * screenshot) and prints an agent-friendly summary. Heavy dependencies are
 * imported lazily inside the action so command registration stays light and
 * unit-testable.
 */
import type { Command } from "commander";

interface DebugCliOptions {
  server?: boolean;
  browser?: boolean;
  trace?: boolean;
  stages?: boolean;
  params?: string;
  out?: string;
  timeout?: number;
  json?: boolean;
  watch?: boolean;
}

export function registerDebugCommands(program: Command): void {
  program
    .command("debug <workflow_id_or_file>")
    .description(
      "Run a workflow end-to-end (server and/or browser) and collect a full debug bundle"
    )
    .option("--no-server", "Skip the headless server surface")
    .option(
      "--browser",
      "Also run the workflow in a real browser (Playwright) — expensive"
    )
    .option(
      "--trace",
      "Capture an OpenTelemetry trace of the server run (timing/tokens/cost) — expensive"
    )
    .option(
      "--stages",
      "Capture a canvas screenshot at every browser run stage (implies --browser) — expensive"
    )
    .option("--params <json>", "JSON params string keyed by input-node name")
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/<id>-<timestamp>)"
    )
    .option(
      "--timeout <ms>",
      "Per-surface run timeout in milliseconds",
      (v: string) => parseInt(v, 10)
    )
    .option("--json", "Print the full DebugReport as JSON to stdout")
    .option(
      "--watch",
      "Re-run on file change and print a diff of the verdict (file targets only)"
    )
    .action(async (ref: string, opts: DebugCliOptions) => {
      try {
        const { initDb, Workflow } = await import("@nodetool-ai/models");
        const { initMasterKey } = await import("@nodetool-ai/security");
        const { getDefaultDbPath } = await import("@nodetool-ai/config");
        const { runDebug, diffReports, formatDiff } = await import(
          "../debug/index.js"
        );

        initDb(getDefaultDbPath());
        try {
          await initMasterKey();
        } catch {
          // Secret decryption is best-effort for debug runs; a missing master
          // key only affects nodes that need secrets.
        }

        const params = opts.params
          ? (JSON.parse(opts.params) as Record<string, unknown>)
          : {};

        const loadFromDb = (id: string) =>
          Workflow.get(id) as Promise<{
            graph: { nodes: never[]; edges: never[] };
          } | null>;

        // In watch mode keep a stable bundle dir so each re-run overwrites
        // rather than littering timestamped directories.
        const runOptions = {
          server: opts.server,
          browser: opts.browser ?? false,
          trace: opts.trace ?? false,
          stages: opts.stages ?? false,
          params,
          ...(opts.out ? { outDir: opts.out } : {}),
          ...(opts.watch && !opts.out
            ? { outDir: `nodetool-debug/${watchSlug(ref)}-watch` }
            : {}),
          ...(opts.timeout ? { timeoutMs: opts.timeout } : {})
        };

        const runOnce = () =>
          runDebug(ref, runOptions, {
            loadFromDb,
            onLog: (line) => console.error(line.trimEnd())
          });

        let report = await runOnce();
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printSummary(report);
        }

        if (!opts.watch) {
          process.exit(report.verdict.ok ? 0 : 1);
        }

        // ── Watch mode ────────────────────────────────────────────────────
        const { existsSync, watch } = await import("node:fs");
        const { resolve } = await import("node:path");
        const watchPath = resolve(ref);
        if (!existsSync(watchPath)) {
          console.error(
            `\n--watch needs a file target to watch; "${ref}" is not a file on disk.`
          );
          process.exit(1);
        }
        console.error(`\nWatching ${watchPath} — edit to re-run, Ctrl-C to stop.`);

        let running = false;
        let pending = false;
        let timer: NodeJS.Timeout | null = null;
        const rerun = async () => {
          if (running) {
            pending = true;
            return;
          }
          running = true;
          try {
            const next = await runOnce();
            const diff = diffReports(report, next);
            report = next;
            console.error(`\n── re-run @ ${new Date().toLocaleTimeString()} ──`);
            console.error(formatDiff(diff));
          } catch (e) {
            console.error(`Re-run failed: ${String(e)}`);
          } finally {
            running = false;
            if (pending) {
              pending = false;
              void rerun();
            }
          }
        };

        watch(watchPath, () => {
          // Debounce editor write bursts (save → multiple change events).
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void rerun(), 200);
        });

        // Hold the event loop open until interrupted.
        await new Promise<void>((resolveWatch) => {
          process.on("SIGINT", () => {
            console.error("\nStopped watching.");
            resolveWatch();
          });
        });
        process.exit(0);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}

function watchSlug(ref: string): string {
  return (
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workflow"
  );
}

function printSummary(report: {
  verdict: { ok: boolean; headline: string; issues: string[] };
  bundleDir: string | null;
  server: { status: string; summary: { counts: { errored: number } } } | null;
  browser: { status: string; unavailableReason?: string; consoleErrors: string[] } | null;
}): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  if (report.server) {
    console.log(
      `  server:  ${report.server.status} (${report.server.summary.counts.errored} node error(s))`
    );
  }
  if (report.browser) {
    console.log(
      report.browser.unavailableReason
        ? `  browser: skipped — ${report.browser.unavailableReason}`
        : `  browser: ${report.browser.status} (${report.browser.consoleErrors.length} console error(s))`
    );
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.bundleDir) {
    const parts = ["report.md / report.json", "workflow.json"];
    if (report.server) parts.push("server/");
    if (report.browser && !report.browser.unavailableReason) parts.push("browser/");
    console.log(`\nDebug bundle: ${report.bundleDir}`);
    console.log(`  ${parts.join(" · ")}`);
  }
}
