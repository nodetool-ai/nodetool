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
    .action(async (ref: string, opts: DebugCliOptions) => {
      try {
        const { initDb, Workflow } = await import("@nodetool-ai/models");
        const { initMasterKey } = await import("@nodetool-ai/security");
        const { getDefaultDbPath } = await import("@nodetool-ai/config");
        const { runDebug } = await import("../debug/index.js");

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

        const report = await runDebug(
          ref,
          {
            server: opts.server,
            browser: opts.browser ?? false,
            trace: opts.trace ?? false,
            stages: opts.stages ?? false,
            params,
            ...(opts.out ? { outDir: opts.out } : {}),
            ...(opts.timeout ? { timeoutMs: opts.timeout } : {})
          },
          {
            loadFromDb: (id) =>
              Workflow.get(id) as Promise<{ graph: { nodes: never[]; edges: never[] } } | null>,
            onLog: (line) => console.error(line.trimEnd())
          }
        );

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printSummary(report);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
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
