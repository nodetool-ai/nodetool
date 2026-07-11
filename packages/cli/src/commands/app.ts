/**
 * `nodetool app debug` — the app-builder debug harness command.
 *
 * Runs an app-builder mini app (the `app_doc` on a workflow) headlessly:
 * validates every widget binding against the workflow's inputs/outputs/
 * variables, simulates the app's interactions (a Run button click by default,
 * or a scripted `--interact` sequence), executes the workflow on the kernel
 * runner, and reports each widget's final value. Writes a debug bundle and
 * prints an agent-friendly verdict. Heavy dependencies load lazily inside the
 * action so command registration stays light and unit-testable.
 */
import type { Command } from "commander";

interface AppDebugCliOptions {
  params?: string;
  interact?: string;
  run?: boolean;
  out?: string;
  timeout?: number;
  json?: boolean;
}

export function registerAppCommands(program: Command): void {
  const app = program
    .command("app")
    .description("Work with app-builder mini apps");

  app
    .command("debug <workflow_id_or_file>")
    .description(
      "Run an app-builder app headlessly (validate widget wiring, simulate interactions, execute the workflow) and collect a debug bundle"
    )
    .option("--params <json>", "Reactive values applied before interactions, keyed by input name")
    .option(
      "--interact <json>",
      'Scripted interaction steps, e.g. \'[{"set":{"key":"prompt","value":"hi"}},{"click":"Button-1"}]\''
    )
    .option("--no-run", "Static wiring check only — never execute the workflow")
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/app-<id>-<timestamp>)"
    )
    .option("--timeout <ms>", "Per-run timeout in milliseconds", (v: string) =>
      parseInt(v, 10)
    )
    .option("--json", "Print the full AppDebugReport as JSON to stdout")
    .action(async (ref: string, opts: AppDebugCliOptions) => {
      try {
        const { initDb, Workflow } = await import("@nodetool-ai/models");
        const { initMasterKey } = await import("@nodetool-ai/security");
        const { getDefaultDbPath } = await import("@nodetool-ai/config");
        const { runAppDebug } = await import("../app-debug/index.js");
        type InteractionSteps = import("../app-debug/types.js").InteractionStep[];

        initDb(getDefaultDbPath());
        try {
          await initMasterKey();
        } catch {
          // Secret decryption is best-effort for debug runs; a missing master
          // key only affects nodes that need secrets.
        }

        const params = opts.params
          ? (JSON.parse(opts.params) as Record<string, unknown>)
          : undefined;
        const interact = opts.interact
          ? (JSON.parse(opts.interact) as InteractionSteps)
          : undefined;

        const report = await runAppDebug(
          ref,
          {
            params,
            interact,
            run: opts.run,
            ...(opts.out ? { outDir: opts.out } : {}),
            ...(opts.timeout ? { timeoutMs: opts.timeout } : {})
          },
          {
            loadFromDb: (id: string) =>
              Workflow.get(id) as Promise<{
                graph: { nodes: never[]; edges: never[] };
                app_doc?: unknown;
              } | null>,
            onLog: (line) => console.error(line.trimEnd())
          }
        );

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printAppSummary(report);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}

function printAppSummary(report: {
  verdict: { ok: boolean; headline: string; issues: string[] };
  validation: { warnings: string[] };
  app: { title: string | null; widgetCount: number } | null;
  runs: Array<{ status: string; summary: { counts: { errored: number } } }>;
  widgets: Array<{
    id: string;
    type: string;
    bindingMode: string;
    binding: string | null;
    hasValue: boolean;
  }>;
  bundleDir: string | null;
}): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  if (report.app) {
    console.log(
      `  app: ${report.app.title ?? "(untitled)"} · ${report.app.widgetCount} widget(s)`
    );
  }
  report.runs.forEach((run, i) => {
    console.log(
      `  run ${i + 1}: ${run.status} (${run.summary.counts.errored} node error(s))`
    );
  });
  const bound = report.widgets.filter((w) => w.bindingMode === "read" && w.binding);
  if (bound.length > 0) {
    const filled = bound.filter((w) => w.hasValue).length;
    console.log(`  display widgets with values: ${filled}/${bound.length}`);
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.validation.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.validation.warnings) console.log(`  - ${warning}`);
  }
  if (report.bundleDir) {
    console.log(`\nDebug bundle: ${report.bundleDir}`);
    console.log("  report.md / report.json · app.json · workflow.json · server/");
  }
}
