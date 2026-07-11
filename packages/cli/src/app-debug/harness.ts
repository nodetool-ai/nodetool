/**
 * The app-builder debug harness orchestrator.
 *
 * Resolves a workflow target, parses its `app_doc` into a widget spec,
 * statically validates the wiring, then simulates the app headlessly: seed
 * input defaults, apply params, execute the interaction script (each `run`
 * action is a full workflow run on the kernel server runner), and fold the
 * message stream into the app's reactive values. Writes a self-contained
 * bundle and returns the `AppDebugReport` so an agent can iterate directly.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveTarget } from "../debug/target.js";
import { previewValue } from "../debug/collector.js";
import type {
  DebugGraph,
  DebugVerdict,
  ServerRunReport
} from "../debug/types.js";
import type { ServerRunInput, ServerRunOutcome } from "../debug/server-runner.js";
import { extractAppIO, parseAppSpec, validateApp } from "./app-spec.js";
import { HeadlessAppRuntime, eventToAction } from "./runtime.js";
import { renderAppReportMarkdown } from "./markdown.js";
import type {
  AppDebugOptions,
  AppDebugReport,
  AppSpec,
  AppWidgetSpec,
  InteractionRecord,
  InteractionStep
} from "./types.js";

export interface AppDebugDeps {
  /** Load a workflow by DB id, including its `app_doc`. */
  loadFromDb: (
    id: string
  ) => Promise<{ graph: DebugGraph; app_doc?: unknown } | null>;
  /** Progress/log sink. */
  onLog?: (line: string) => void;
  /** Injected for tests; defaults to the kernel server runner. */
  runOnServer?: (input: ServerRunInput) => Promise<ServerRunOutcome>;
}

function defaultOutDir(ref: string): string {
  const slug =
    ref.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "workflow";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/app-${slug}-${stamp}`);
}

/** Resolve a step's widget reference: exact id, unique type, or unique label. */
function findWidget(spec: AppSpec, ref: string): AppWidgetSpec | string {
  const byId = spec.widgets.find((w) => w.id === ref);
  if (byId) return byId;
  const byType = spec.widgets.filter((w) => w.type === ref);
  if (byType.length === 1) return byType[0];
  if (byType.length > 1) {
    return `widget reference "${ref}" is ambiguous — ${byType.length} widgets of that type; use the component id.`;
  }
  const byLabel = spec.widgets.filter((w) => w.label === ref);
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) {
    return `widget reference "${ref}" is ambiguous — ${byLabel.length} widgets share that label; use the component id.`;
  }
  return `no widget matches "${ref}" (tried id, type, and label).`;
}

/**
 * The app's natural run trigger, mirroring what a user would do first: click
 * the first `click`→`run` widget (a Run button), else touch the first
 * `change`→`run` write widget.
 */
export function defaultInteractions(spec: AppSpec): InteractionStep[] {
  const clicker = spec.widgets.find((w) =>
    w.events.some((e) => e.trigger === "click" && e.kind === "run")
  );
  if (clicker) return [{ click: clicker.id }];
  const changer = spec.widgets.find(
    (w) =>
      w.bindingMode === "write" &&
      w.events.some((e) => e.trigger === "change" && e.kind === "run")
  );
  if (changer) return [{ change: changer.id, value: undefined }];
  return [];
}

function describeStep(step: InteractionStep): string {
  if ("set" in step) return `set ${step.set.key}`;
  if ("click" in step) return `click ${step.click}`;
  return `change ${step.change}`;
}

function buildAppVerdict(
  report: Pick<AppDebugReport, "validation" | "interactions" | "runs" | "widgets" | "spec">,
  ranWorkflow: boolean
): DebugVerdict {
  const issues: string[] = [...report.validation.errors];

  for (const interaction of report.interactions) {
    if (interaction.error) {
      issues.push(`Interaction "${interaction.step}": ${interaction.error}`);
    }
  }
  for (const run of report.runs) {
    if (!run.ok) {
      issues.push(`Run ended ${run.status}${run.error ? `: ${run.error}` : ""}`);
    }
    for (const e of run.summary.errors.slice(0, 5)) {
      const where = e.nodeType ?? e.nodeId ?? "workflow";
      issues.push(`Node ${where}: ${e.message.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }
  if (ranWorkflow && report.runs.length > 0 && report.runs.every((r) => r.ok)) {
    for (const w of report.widgets) {
      if (w.bindingMode === "read" && w.binding && !w.hasValue) {
        issues.push(
          `${w.type} "${w.id}" is bound to "${w.binding}" but never received a value — check the output node emits.`
        );
      }
    }
  }
  if (ranWorkflow && report.runs.length === 0 && report.spec && report.spec.widgets.length > 0) {
    issues.push("No interaction triggered a workflow run — the app was never executed.");
  }

  const ok = issues.length === 0;
  const headline = ok
    ? report.runs.length > 0
      ? `App ran clean — ${report.runs.length} run(s), every bound widget received a value.`
      : "App wiring is valid (static check only — no run executed)."
    : `App has issues — ${issues[0]}`;
  return { ok, headline, issues };
}

export async function runAppDebug(
  ref: string,
  options: AppDebugOptions,
  deps: AppDebugDeps
): Promise<AppDebugReport> {
  const log = deps.onLog ?? (() => {});
  const allowRuns = options.run ?? true;

  const resolved = await resolveTarget(ref, deps.loadFromDb);
  const outDir = options.outDir ? resolve(options.outDir) : defaultOutDir(ref);
  await mkdir(join(outDir, "server"), { recursive: true });
  await writeFile(
    join(outDir, "workflow.json"),
    JSON.stringify(resolved.graph, null, 2),
    "utf8"
  );
  if (resolved.appDoc != null) {
    await writeFile(
      join(outDir, "app.json"),
      JSON.stringify(resolved.appDoc, null, 2),
      "utf8"
    );
  }

  const { spec, issues: parseIssues } = parseAppSpec(resolved.appDoc);
  const io = extractAppIO(resolved.graph);
  const validation = spec
    ? validateApp(spec, io)
    : { errors: [], warnings: [] };
  validation.errors = [...parseIssues, ...validation.errors];

  const report: AppDebugReport = {
    generatedAt: new Date().toISOString(),
    target: resolved.info,
    app: spec
      ? { version: spec.version, title: spec.title, widgetCount: spec.widgets.length }
      : null,
    spec,
    io: {
      inputs: io.inputs.map((i) => i.name),
      outputs: io.outputs.map((o) => o.name),
      variables: io.variables
    },
    validation,
    interactions: [],
    runs: [],
    values: {},
    widgets: [],
    verdict: { ok: false, headline: "", issues: [] },
    bundleDir: outDir
  };

  if (spec) {
    const runs: ServerRunReport[] = report.runs;
    const runWorkflow = async (
      params: Record<string, unknown>
    ): Promise<ReadonlyArray<Record<string, unknown>>> => {
      const runServer =
        deps.runOnServer ??
        (await import("../debug/server-runner.js")).runOnServer;
      log(`Running workflow (run ${runs.length + 1})…`);
      const outcome = await runServer({
        graph: resolved.graph,
        workflowId: resolved.info.workflowId,
        params,
        timeoutMs: options.timeoutMs
      });
      const messagesFile = `server/run-${runs.length + 1}.messages.jsonl`;
      await writeFile(
        join(outDir, messagesFile),
        outcome.rawMessages.map((m) => JSON.stringify(m)).join("\n") + "\n",
        "utf8"
      );
      outcome.report.messagesFile = messagesFile;
      runs.push(outcome.report);
      log(
        `Run ${runs.length}: ${outcome.report.status} · ${outcome.report.summary.counts.errored} node error(s)`
      );
      return outcome.rawMessages as unknown as ReadonlyArray<Record<string, unknown>>;
    };

    const runtime = new HeadlessAppRuntime({ io, runWorkflow });
    for (const [key, value] of Object.entries(
      { ...resolved.fileParams, ...(options.params ?? {}) }
    )) {
      runtime.setValue(key, value);
    }

    const steps = options.interact ?? defaultInteractions(spec);
    for (const step of steps) {
      const record: InteractionRecord = {
        step: describeStep(step),
        actions: [],
        runIndex: null,
        error: null
      };
      report.interactions.push(record);

      if ("set" in step) {
        runtime.setValue(step.set.key, step.set.value);
        record.actions.push(`set ${step.set.key}`);
        continue;
      }

      const trigger = "click" in step ? "click" : "change";
      const found = findWidget(spec, "click" in step ? step.click : step.change);
      if (typeof found === "string") {
        record.error = found;
        continue;
      }
      if ("change" in step && step.value !== undefined) {
        if (found.stateKey) runtime.setValue(found.stateKey, step.value);
        record.actions.push(`set ${found.stateKey ?? found.id}`);
      }
      // A run from a bound write widget carries its input name; the web engine
      // would run just that input's downstream subgraph — headless, both paths
      // are a full authoritative run.
      const from = found.bindingMode === "write" ? found.binding ?? undefined : undefined;
      for (const event of found.events) {
        if (event.trigger !== trigger) continue;
        const action = eventToAction(event, from);
        if (action.kind === "run") {
          if (!allowRuns) {
            record.actions.push("run (skipped — --no-run)");
            continue;
          }
          record.runIndex = report.runs.length;
          record.actions.push("run");
          await runtime.dispatch(action);
        } else {
          record.actions.push(
            action.kind === "setState" || action.kind === "toggleState"
              ? `${action.kind} ${action.key}`
              : action.kind
          );
          await runtime.dispatch(action);
        }
      }
      if (record.actions.length === 0) {
        record.error = `widget has no "${trigger}" events to fire.`;
      }
      if (runtime.error) record.error = record.error ?? runtime.error;
    }

    report.values = previewValue(runtime.values) as Record<string, unknown>;
    report.widgets = spec.widgets
      .filter((w) => w.bindingMode !== "layout")
      .map((w) => {
        const value = w.stateKey ? runtime.values[w.stateKey] : undefined;
        return {
          id: w.id,
          type: w.type,
          bindingMode: w.bindingMode,
          binding: w.binding,
          stateKey: w.stateKey,
          value: previewValue(value),
          hasValue: value !== undefined
        };
      });
  }

  report.verdict = buildAppVerdict(report, allowRuns);

  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outDir, "report.md"), renderAppReportMarkdown(report), "utf8");

  return report;
}
