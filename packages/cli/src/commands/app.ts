/**
 * `nodetool app debug` and `nodetool app build` — the two app-builder harness
 * commands.
 *
 * Runs a mini app headlessly: validates every widget binding against its
 * workflows' inputs/outputs/variables, simulates the app's interactions (a Run
 * button click by default, or a scripted `--interact` sequence), executes the
 * workflows on the kernel runner, and reports each widget's final value. Writes
 * a debug bundle and prints an agent-friendly verdict.
 *
 * The debug target can be an application id, an ApplicationBundle JSON file,
 * or — legacy — a workflow id or workflow file whose `app_doc` is lifted into
 * an application document. `build` goes the other way: a prompt or a
 * `spec.json` becomes a verified `ApplicationBundle`, via `buildApp` in
 * `@nodetool-ai/agents`. Its Run stage executes on the kernel, so it carries the
 * same `--supervise` flags every run-shaped command does; the handle goes to
 * `ExecutionSessionOptions.supervisor` inside the runner, never to `buildApp`.
 * Heavy dependencies load lazily inside each action so command registration
 * stays light and unit-testable.
 */
import { resolve } from "node:path";
import type { Command } from "commander";
import { formatSupervisedSummary } from "@nodetool-ai/execution/debug";
import type {
  BuildJudgeOptions,
  BuildReport,
  resolveJudgeModelSpec
} from "@nodetool-ai/agents";
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  addSupervisorOptions,
  parseSupervisorFlags,
  type SupervisorCliOptions
} from "../supervisor.js";
import { numericOptionParser, parseNumericOption } from "../numeric-options.js";
import { printCommandError } from "../command-errors.js";

interface AppDebugCliOptions {
  params?: string;
  interact?: string;
  run?: boolean;
  out?: string;
  timeout?: number;
  json?: boolean;
}

interface AppBuildCliOptions extends SupervisorCliOptions {
  provider?: string;
  model?: string;
  judgeModel?: string;
  workflow?: string[];
  maxRepairs?: string;
  costCap?: string;
  timeout?: string;
  out?: string;
  json?: boolean;
  watch?: boolean;
  /** commander negated flag: `--no-judge` sets this to false. */
  judge?: boolean;
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
    .option(
      "--params <json>",
      'Reactive values applied before interactions, keyed by input name; a "resource:<binding id>" key seeds that collection with an array of items'
    )
    .option(
      "--interact <json>",
      'Scripted interaction steps: set, change, click, run (by operation id), cancel, seedResource — e.g. \'[{"set":{"key":"prompt","value":"hi"}},{"run":"main"}]\''
    )
    .option("--no-run", "Static wiring check only — never execute the workflow")
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/app-<id>-<timestamp>)"
    )
    .option(
      "--timeout <ms>",
      "Per-run timeout in milliseconds",
      numericOptionParser("--timeout", { integer: true, min: 0 })
    )
    .option("--json", "Print the full AppDebugReport as JSON to stdout")
    .action(async (ref: string, opts: AppDebugCliOptions) => {
      try {
        const { initDb, Application, Workflow } =
          await import("@nodetool-ai/models");
        const { initMasterKey } = await import("@nodetool-ai/security");
        const { getDefaultDbPath } = await import("@nodetool-ai/config");
        const { runAppDebug } = await import("../app-debug/index.js");
        type InteractionSteps =
          import("@nodetool-ai/execution/app-debug").InteractionStep[];

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

        const debugOptions: Parameters<typeof runAppDebug>[1] = {
          params,
          interact,
          run: opts.run
        };
        if (opts.out) {
          debugOptions.outDir = opts.out;
        }
        if (opts.timeout) {
          debugOptions.timeoutMs = opts.timeout;
        }
        const report = await runAppDebug(ref, debugOptions, {
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
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printAppSummary(report);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  const build = app
    .command("build <prompt_or_spec_file>")
    .description(
      "Build a mini app from a prompt (or a spec.json) and verify it: plan the workflows, author the app, check its wiring, run every interaction, and write an ApplicationBundle plus a build report. Exits 0 only when the verdict is ok"
    )
    .option("-p, --provider <name>", "Builder provider id (e.g. anthropic)")
    .option("-m, --model <id>", "Builder model id")
    .option(
      "--judge-model <provider/model>",
      "Model that judges each interaction (env: NODETOOL_APP_JUDGE_MODEL; default: a configured model other than the builder's)"
    )
    .option(
      "--workflow <id>",
      "Pin an existing workflow (repeatable, in operation order) — Plan binds it instead of planning",
      (value: string, previous: string[] = []) => [...previous, value]
    )
    .option("--max-repairs <n>", "Repair rounds allowed after the first pass")
    .option("--cost-cap <usd>", "Ceiling on what the build may spend")
    .option("--timeout <ms>", "Wall clock for the whole build")
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/app-build-<slug>-<timestamp>)"
    )
    .option("--json", "Print the full BuildReport as JSON to stdout")
    .option("--no-judge", "Skip the judge stage")
    .option(
      "--watch",
      "Re-build on spec-file change and print a diff of the verdict (spec-file targets only)"
    );

  // The Run stage executes on the kernel, so the same five supervisor flags
  // every run-shaped command carries apply here too.
  addSupervisorOptions(build).action(
    async (ref: string, opts: AppBuildCliOptions) => {
      try {
        process.exit(await runAppBuild(ref, opts));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    }
  );
}

/**
 * The `app build` action. Returns the process exit code.
 *
 * Everything a build needs — providers, the registry, the processing context —
 * is set up once and reused, so `--watch` re-runs only the build itself.
 */
async function runAppBuild(
  ref: string,
  opts: AppBuildCliOptions
): Promise<number> {
  if (!opts.provider || !opts.model) {
    console.error("--provider and --model are required");
    return 1;
  }
  const model = opts.model;
  const isSpecFile = /\.json$/i.test(ref);
  if (opts.watch && !isSpecFile) {
    console.error(
      `--watch re-builds on save, so it needs a spec file; "${ref}" is a prompt.`
    );
    return 1;
  }
  const supervisorConfig = parseSupervisorFlags(opts);
  // Parsed before anything expensive is built: a mistyped bound must fail the
  // command, not silently become `NaN` and disable the cap it configures.
  type BoundsFields = {
    maxRepairs?: number;
    costCapUsd?: number;
    timeoutMs?: number;
  };
  const bounds: BoundsFields = {};
  if (opts.maxRepairs !== undefined) {
    bounds.maxRepairs = parseNumericOption(opts.maxRepairs, "--max-repairs", {
      integer: true,
      min: 0
    });
  }
  if (opts.costCap !== undefined) {
    bounds.costCapUsd = parseNumericOption(opts.costCap, "--cost-cap", {
      min: 0
    });
  }
  if (opts.timeout !== undefined) {
    bounds.timeoutMs = parseNumericOption(opts.timeout, "--timeout", {
      integer: true,
      min: 0
    });
  }

  const [
    { buildApp, renderBuildReportMarkdown, resolveJudgeModelSpec },
    { createProviderStrict, buildConfiguredProviders },
    { buildFullRegistry },
    { runOnServer },
    { defaultBuildOutDir, writeBuildBundle, writeRunMessages },
    { initDb, Workflow },
    { resolveLocalSecret },
    { initMasterKey },
    { getDefaultAssetsPath, getDefaultDbPath },
    { ProcessingContext, FileStorageAdapter }
  ] = await Promise.all([
    import("@nodetool-ai/agents"),
    import("../providers.js"),
    import("../node-registry.js"),
    import("../debug/server-runner.js"),
    import("../app-build/bundle.js"),
    import("@nodetool-ai/models"),
    import("../local-secrets.js"),
    import("@nodetool-ai/security"),
    import("@nodetool-ai/config"),
    import("@nodetool-ai/runtime")
  ]);

  initDb(getDefaultDbPath());
  try {
    await initMasterKey();
  } catch {
    // Secret decryption is best-effort; only nodes that need secrets care.
  }

  const buildId = `app-build-${Date.now()}`;
  // In watch mode keep a stable bundle dir so each re-build overwrites rather
  // than littering timestamped directories.
  const outDir = opts.out
    ? resolve(opts.out)
    : opts.watch
      ? resolve(`nodetool-debug/${watchSlug(ref)}-watch`)
      : defaultBuildOutDir(ref);

  const provider = await createProviderStrict(opts.provider);
  const providers = await buildConfiguredProviders();
  const judge: BuildJudgeOptions =
    opts.judge === false
      ? { enabled: false }
      : resolveJudge({
          builder: provider,
          builderModel: model,
          explicit: opts.judgeModel,
          providers,
          resolveSpec: resolveJudgeModelSpec
        });
  if (judge.provider && !opts.json) {
    console.error(`judge: ${judge.provider.provider}/${judge.model}`);
  }
  if (supervisorConfig && !opts.json) {
    console.error(`supervisor: ${supervisorConfig.modelSpec}`);
  }

  const context = new ProcessingContext({
    jobId: buildId,
    workflowId: null,
    userId: "1",
    secretResolver: resolveLocalSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath())
  });

  const runOnce = async (): Promise<BuildReport> => {
    const buildOptions: Parameters<typeof buildApp>[0] = {
      provider,
      model,
      context,
      registry: buildFullRegistry(),
      providers,
      judge,
      // Supervision reaches the Run stage the way it reaches every other surface:
      // as `ExecutionSessionOptions.supervisor`, configured inside the runner the
      // build executes each interaction on. `buildApp` never sees a handle — it
      // reads back what was decided from the run reports.
      runOnServer: supervisorConfig
        ? (input: Parameters<typeof runOnServer>[0]) =>
            runOnServer({ ...input, supervisor: supervisorConfig })
        : runOnServer,
      loadWorkflow: async (id: string) => {
        const workflow = (await Workflow.get(id)) as {
          graph?: {
            nodes: Array<Record<string, unknown>>;
            edges: Array<Record<string, unknown>>;
          };
          name?: string;
        } | null;
        if (!workflow?.graph) return null;
        type LoadedFields = {
          graph: NonNullable<typeof workflow.graph>;
          name?: string;
        };
        const loaded: LoadedFields = { graph: workflow.graph };
        if (workflow.name) {
          loaded.name = workflow.name;
        }
        return loaded;
      },
      ...bounds,
      buildId,
      ledger: { userId: "1" },
      onLog: (line) => {
        if (!opts.json) console.error(line.trimEnd());
      },
      onRunMessages: (interaction, runIndex, messages) =>
        writeRunMessages(outDir, interaction, runIndex, messages)
    };
    if (isSpecFile) {
      buildOptions.specPath = ref;
    } else {
      buildOptions.prompt = ref;
    }
    if (opts.workflow) {
      buildOptions.pinnedWorkflowIds = opts.workflow;
    }
    const built = await buildApp(buildOptions);
    await writeBuildBundle(outDir, built, renderBuildReportMarkdown(built));
    return built;
  };

  const report = await runOnce();

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printBuildSummary(report, outDir);
  }

  if (!opts.watch) return report.verdict.ok ? 0 : 1;

  const [{ runWatchLoop }, { snapshotBuildReport }] = await Promise.all([
    import("../debug/watch.js"),
    import("../app-build/watch.js")
  ]);
  await runWatchLoop({
    file: resolve(ref),
    first: report,
    run: runOnce,
    snapshot: snapshotBuildReport,
    statusLabel: "stage",
    log: (line) => console.error(line)
  });
  return 0;
}

/** Directory-safe slug for a watched target, mirroring `debug --watch`. */
function watchSlug(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app";
  return `app-build-${slug}`;
}

/**
 * Which model judges the build. Availability is the set of configured
 * providers, so the default never picks a model this machine cannot reach; an
 * explicit `--judge-model` naming an unconfigured provider is an error rather
 * than a silent fallback to the builder grading itself.
 */
function resolveJudge(init: {
  builder: BaseProvider;
  builderModel: string;
  explicit?: string;
  providers: Record<string, BaseProvider>;
  resolveSpec: typeof resolveJudgeModelSpec;
}) {
  const resolution = init.resolveSpec({
    explicit: init.explicit,
    builderProviderId: init.builder.provider,
    builderModel: init.builderModel,
    isAvailable: (id) => id === init.builder.provider || id in init.providers
  });
  const provider =
    resolution.providerId === init.builder.provider
      ? init.builder
      : init.providers[resolution.providerId];
  if (!provider) {
    if (init.explicit) {
      throw new Error(
        `--judge-model names provider "${resolution.providerId}", which is not configured. Configure it or pass a model on ${init.builder.provider}.`
      );
    }
    return { provider: init.builder, model: init.builderModel };
  }
  return { provider, model: resolution.model };
}

function printBuildSummary(report: BuildReport, outDir: string): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.reason}`);
  console.log(
    `  ${report.spec.title || "(untitled)"} · ${report.spec.operations.length} operation(s) · ${report.spec.widgets.length} widget(s)`
  );
  for (const stage of report.stages) {
    console.log(
      `  ${stage.stage} (round ${stage.round}): ${stage.status}${stage.detail ? ` — ${stage.detail}` : ""}`
    );
  }
  const last = report.repairs[report.repairs.length - 1];
  if (last && !report.verdict.ok) {
    console.log("\nOutstanding issues:");
    for (const issue of last.issues) {
      console.log(`  - [${issue.stage}/${issue.code}] ${issue.message}`);
    }
  }
  if (report.supervision) {
    console.log(`\n${formatSupervisedSummary(report.supervision.summary)}`);
    for (const entry of report.supervision.byInteraction) {
      for (const item of entry.interventions) {
        console.log(
          `  ${entry.interaction}: ${item.verdict.action} on ${item.escalation.nodeId} (${item.decidedBy})`
        );
      }
    }
  }
  console.log(`\n  cost: $${report.cost.usd.toFixed(4)}`);
  console.log(`\nBuild bundle: ${outDir}`);
  console.log(
    "  report.md / report.json · spec.json" +
      (report.bundle ? " · app.bundle.json" : "") +
      " · interactions/"
  );
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
      inv.timedOutMs != null
        ? `timed out after ${inv.timedOutMs}ms`
        : inv.status;
    console.log(`  ${inv.operationId} (${inv.decision}): ${state}`);
  }
  const variables = Object.keys(report.variables);
  if (variables.length > 0) {
    console.log(`  variables: ${variables.join(", ")}`);
  }
  const bound = report.widgets.filter(
    (w) => w.bindingMode === "read" && w.binding
  );
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
    for (const warning of report.validation.warnings)
      console.log(`  - ${warning}`);
  }
  if (report.bundleDir) {
    console.log(`\nDebug bundle: ${report.bundleDir}`);
    console.log(
      "  report.md / report.json · app.json · workflow.json · server/"
    );
  }
}
