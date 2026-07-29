/**
 * `nodetool app debug` — the app-builder debug harness command.
 *
 * Runs a mini app headlessly: validates every widget binding against its
 * workflows' inputs/outputs/variables, simulates the app's interactions (a Run
 * button click by default, or a scripted `--interact` sequence), executes the
 * workflows on the kernel runner, and reports each widget's final value. Writes
 * a debug bundle and prints an agent-friendly verdict.
 *
 * The target can be an application id, an ApplicationBundle JSON file, or —
 * legacy — a workflow id or workflow file whose `app_doc` is lifted into an
 * application document. Heavy dependencies load lazily inside the action so
 * command registration stays light and unit-testable.
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
    .command("debug <application_id_or_file>")
    .description(
      "Run a mini app headlessly (validate widget wiring, simulate interactions, execute the workflows) and collect a debug bundle. Takes an application id, an ApplicationBundle JSON file, or a workflow id/file carrying a legacy app_doc"
    )
    .option("--params <json>", "Reactive values applied before interactions, keyed by input name")
    .option(
      "--interact <json>",
      'Scripted interaction steps: set, change, click, run (by operation id), cancel — e.g. \'[{"set":{"key":"prompt","value":"hi"}},{"run":"main"}]\''
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
        const { initDb, Application, Workflow } = await import("@nodetool-ai/models");
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
            loadApplication: async (id: string) => {
              const application = await Application.findById(id);
              return application
                ? {
                    id: application.id,
                    name: application.name,
                    description: application.description,
                    document: application.document
                  }
                : null;
            },
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
  invocations: Array<{
    id: string;
    operationId: string;
    status: string;
    decision: string;
    timedOutMs: number | null;
  }>;
  variables: Record<string, unknown>;
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
  for (const inv of report.invocations) {
    const state =
      inv.timedOutMs != null ? `timed out after ${inv.timedOutMs}ms` : inv.status;
    console.log(`  ${inv.operationId} (${inv.decision}): ${state}`);
  }
  const variables = Object.keys(report.variables);
  if (variables.length > 0) {
    console.log(`  variables: ${variables.join(", ")}`);
  }
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
