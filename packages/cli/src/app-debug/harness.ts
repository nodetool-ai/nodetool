/**
 * The app-builder debug harness orchestrator.
 *
 * Resolves a workflow target, parses its `app_doc` into a widget spec and a set
 * of operations, statically validates the wiring, then simulates the app
 * headlessly the way the web and mobile runtimes do: seed input and variable
 * defaults, apply params, execute the interaction script (each `run` action is
 * a full workflow run on the kernel server runner, subject to the operation's
 * policy and timeout), and fold the message stream into the app's reactive
 * values. Writes a self-contained bundle and returns the `AppDebugReport` so an
 * agent can iterate directly.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveAppTarget, type AppTargetDeps } from "./app-target.js";
import { previewValue } from "../debug/collector.js";
import type {
  DebugGraph,
  DebugVerdict,
  ServerRunReport
} from "../debug/types.js";
import type { ServerRunInput, ServerRunOutcome } from "../debug/server-runner.js";
import {
  DEFAULT_OPERATION_ID,
  eventToAction,
  parseBinding,
  resolveBinding,
  stateKey,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import {
  bindingScopeFor,
  documentOperations,
  extractAppIO,
  operationSpec,
  parseAppSpec,
  validateApp,
  type AppContext
} from "./app-spec.js";
import {
  effectiveTimeoutMs,
  HeadlessAppRuntime,
  type HeadlessOperationInit
} from "./runtime.js";
import { renderAppReportMarkdown } from "./markdown.js";
import type {
  AppDebugOptions,
  AppDebugReport,
  AppIO,
  AppSpec,
  AppWidgetSpec,
  InteractionRecord,
  InteractionStep
} from "./types.js";

export interface AppDebugDeps {
  /** Load a workflow by DB id, including its legacy `app_doc`. */
  loadFromDb: (
    id: string
  ) => Promise<{ graph: DebugGraph; app_doc?: unknown } | null>;
  /**
   * Load an application by DB id. Without it a bare id is only ever read as a
   * workflow, which is what a caller with no database wants.
   */
  loadApplication?: AppTargetDeps["loadApplication"];
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
  if ("run" in step) return `run ${step.run}`;
  if ("cancel" in step) return `cancel ${step.cancel}`;
  return `change ${step.change}`;
}

/**
 * Node types that emit on one of several output handles per run. A widget fed
 * from one of their branches is *expected* to stay empty whenever the other
 * branch is taken, so a single run cannot tell "the untaken branch" from "a
 * branch that can never be taken".
 */
const BRANCHING_NODE_TYPES = new Set(["nodetool.control.If"]);

/**
 * Node ids reachable only through a branching node. Walks forward from every
 * branch point over the graph's edges.
 */
function conditionalNodeIds(graph: DebugGraph): Set<string> {
  const downstream = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const source = typeof edge.source === "string" ? edge.source : null;
    const target = typeof edge.target === "string" ? edge.target : null;
    if (!source || !target) continue;
    const list = downstream.get(source);
    if (list) list.push(target);
    else downstream.set(source, [target]);
  }

  const conditional = new Set<string>();
  const queue: string[] = [];
  for (const node of graph.nodes) {
    const id = typeof node.id === "string" ? node.id : null;
    const type = typeof node.type === "string" ? node.type : null;
    if (id && type && BRANCHING_NODE_TYPES.has(type)) queue.push(id);
  }
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of downstream.get(current) ?? []) {
      if (conditional.has(next)) continue;
      conditional.add(next);
      queue.push(next);
    }
  }
  return conditional;
}

/** Node ids keyed by the `name` their data carries, for name-form bindings. */
function nodeIdsByName(graph: DebugGraph): Map<string, string> {
  const byName = new Map<string, string>();
  for (const node of graph.nodes) {
    const id = typeof node.id === "string" ? node.id : null;
    // Runner shape carries node props under `properties`; editor JSON uses
    // `data`, and this runs against both.
    const props = (node.properties ?? node.data) as
      | Record<string, unknown>
      | undefined;
    const name = typeof props?.name === "string" ? props.name : null;
    if (id && name && !byName.has(name)) byName.set(name, id);
  }
  return byName;
}

function buildAppVerdict(
  report: Pick<
    AppDebugReport,
    "validation" | "interactions" | "runs" | "widgets" | "spec" | "invocations"
  >,
  ranWorkflow: boolean,
  graph: DebugGraph
): DebugVerdict {
  const issues: string[] = [...report.validation.errors];
  const warnings: string[] = [];

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
  for (const invocation of report.invocations) {
    if (invocation.timedOutMs == null) continue;
    issues.push(
      `Operation "${invocation.operationId}" did not finish within its ${invocation.timedOutMs}ms timeout — the app would show it still running.`
    );
  }
  const ranOperations = new Set(report.invocations.map((i) => i.operationId));
  if (ranWorkflow && report.runs.length > 0 && report.runs.every((r) => r.ok)) {
    const conditional = conditionalNodeIds(graph);
    const byName = nodeIdsByName(graph);
    const nodeIds = new Set(
      graph.nodes.map((n) => (typeof n.id === "string" ? n.id : "")).filter(Boolean)
    );
    for (const w of report.widgets) {
      if (w.bindingMode !== "read" || !w.binding || w.hasValue) continue;
      const ref = parseBinding(w.binding);
      if (ref?.kind === "execution") {
        // Execution state is not a value the graph emits — an empty one only
        // means the operation never ran, or reported no activity.
        if (!ranOperations.has(ref.operationId)) {
          issues.push(
            `${w.type} "${w.id}" shows operation "${ref.operationId}" ${ref.field}, but that operation never ran.`
          );
        } else if (ref.field === "activity") {
          warnings.push(
            `${w.type} "${w.id}" shows activity, but the run reported none — only streaming agent nodes emit activity labels.`
          );
        }
        continue;
      }
      // A legacy document binds by node name, and `parseBinding` hands the name
      // back in the `nodeId` slot, so an unrecognised id is retried as a name.
      const parsed = (ref && "nodeId" in ref ? ref.nodeId : null) ?? w.binding;
      const nodeId = nodeIds.has(parsed) ? parsed : byName.get(parsed) ?? null;
      if (nodeId && conditional.has(nodeId)) {
        // One run takes one branch, so an empty widget here is expected. It is
        // still worth surfacing: a branch that no input can reach looks exactly
        // the same, and only running both branches tells them apart.
        warnings.push(
          `${w.type} "${w.id}" is bound to "${w.binding}", downstream of a branch that was not taken this run — run the other branch to confirm it can be reached.`
        );
        continue;
      }
      issues.push(
        `${w.type} "${w.id}" is bound to "${w.binding}" but never received a value — check the output node emits.`
      );
    }
  }
  if (
    ranWorkflow &&
    report.runs.length === 0 &&
    report.invocations.length === 0 &&
    report.spec &&
    report.spec.widgets.length > 0
  ) {
    issues.push("No interaction triggered a workflow run — the app was never executed.");
  }

  const ok = issues.length === 0;
  const headline = ok
    ? report.runs.length > 0
      ? `App ran clean — ${report.runs.length} run(s), every bound widget on a taken branch received a value.`
      : "App wiring is valid (static check only — no run executed)."
    : `App has issues — ${issues[0]}`;
  return { ok, headline, issues, warnings };
}

/**
 * The graph an operation runs: one the target carries (a bundle's workflows,
 * the host workflow), else the database.
 */
async function resolveOperationGraph(
  operation: OperationBinding,
  host: { workflowId: string | null; graph: DebugGraph; graphs: Map<string, DebugGraph> },
  loadFromDb: AppDebugDeps["loadFromDb"]
): Promise<{ graph: DebugGraph | null; unavailable: string | null }> {
  const target = operation.workflowId;
  const carried = host.graphs.get(target);
  if (carried) return { graph: carried, unavailable: null };
  if (!target || target === "self" || target === host.workflowId) {
    return { graph: host.graph, unavailable: null };
  }
  try {
    const workflow = await loadFromDb(target);
    if (!workflow?.graph) {
      return {
        graph: null,
        unavailable: `runs workflow "${target}", which is not in the local database.`
      };
    }
    return { graph: workflow.graph, unavailable: null };
  } catch (error) {
    return {
      graph: null,
      unavailable: `runs workflow "${target}", which could not be loaded: ${String(error)}`
    };
  }
}

export async function runAppDebug(
  ref: string,
  options: AppDebugOptions,
  deps: AppDebugDeps
): Promise<AppDebugReport> {
  const log = deps.onLog ?? (() => {});
  const allowRuns = options.run ?? true;

  const resolved = await resolveAppTarget(ref, {
    loadFromDb: deps.loadFromDb,
    ...(deps.loadApplication ? { loadApplication: deps.loadApplication } : {})
  });
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

  const io = extractAppIO(resolved.graph);
  // The target loader already parsed the document; `parseAppSpec` reports any
  // issue it hit.
  const document = resolved.document;

  // Resolve every declared operation against a real graph before parsing the
  // widgets: a binding into a second operation resolves against that
  // operation's surface, not the host's.
  const graphByOperation = new Map<string, DebugGraph>();
  const context: AppContext = {
    defaultOperationId: DEFAULT_OPERATION_ID,
    operations: [],
    variables: document?.variables ?? [],
    resources: document?.resources.map(({ id, name, kind }) => ({ id, name, kind })) ?? []
  };
  const bindingByOperation = new Map<string, OperationBinding>();
  if (document) {
    for (const binding of documentOperations(document)) {
      const { graph, unavailable } = await resolveOperationGraph(
        binding,
        {
          workflowId: resolved.info.workflowId,
          graph: resolved.graph,
          graphs: resolved.graphs
        },
        deps.loadFromDb
      );
      const operationIO: AppIO | null =
        graph === resolved.graph ? io : graph ? extractAppIO(graph) : null;
      if (graph) graphByOperation.set(binding.id, graph);
      bindingByOperation.set(binding.id, binding);
      context.operations.push(operationSpec(binding, operationIO, unavailable));
    }
    context.defaultOperationId =
      context.operations.find((op) => op.id === DEFAULT_OPERATION_ID)?.id ??
      context.operations[0]?.id ??
      DEFAULT_OPERATION_ID;
  }

  const { spec, issues: parseIssues, warnings: parseWarnings } = parseAppSpec(
    resolved.appDoc,
    io,
    document ? context : undefined,
    { document, issue: resolved.issue }
  );
  const validation = spec
    ? validateApp(spec, io, context)
    : { errors: [], warnings: [] };
  validation.errors = [...parseIssues, ...validation.errors];
  validation.warnings = [...parseWarnings, ...validation.warnings];

  const report: AppDebugReport = {
    generatedAt: new Date().toISOString(),
    target: resolved.info,
    app: spec
      ? {
          version: spec.version,
          // A document keeps its title in the Puck root; an application row
          // keeps it as the row's name.
          title: spec.title ?? resolved.appName,
          widgetCount: spec.widgets.length
        }
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
    variables: {},
    invocations: [],
    activity: [],
    widgets: [],
    verdict: { ok: false, headline: "", issues: [] },
    bundleDir: outDir
  };

  if (spec) {
    const runs: ServerRunReport[] = report.runs;
    const runWorkflow = async (
      operationId: string,
      graph: DebugGraph,
      workflowId: string | null,
      timeoutMs: number | null,
      params: Record<string, unknown>
    ) => {
      const runServer =
        deps.runOnServer ??
        (await import("../debug/server-runner.js")).runOnServer;
      log(`Running operation "${operationId}"…`);
      const outcome = await runServer({
        graph,
        workflowId,
        params,
        ...(timeoutMs != null ? { timeoutMs } : {})
      });
      // The slot is claimed only once the run settles, so a run the harness
      // timed out on never takes an index from the one that follows it.
      const runIndex = runs.length;
      const messagesFile = `server/run-${runIndex + 1}.messages.jsonl`;
      await writeFile(
        join(outDir, messagesFile),
        outcome.rawMessages.map((m) => JSON.stringify(m)).join("\n") + "\n",
        "utf8"
      );
      outcome.report.messagesFile = messagesFile;
      runs.push(outcome.report);
      log(
        `Run ${runIndex + 1}: ${outcome.report.status} · ${outcome.report.summary.counts.errored} node error(s)`
      );
      return {
        messages: outcome.rawMessages as unknown as ReadonlyArray<
          Record<string, unknown>
        >,
        runIndex
      };
    };

    const scope = bindingScopeFor(io, context);
    const operations: HeadlessOperationInit[] = context.operations.map((op) => {
      const binding = bindingByOperation.get(op.id) as OperationBinding;
      const graph = graphByOperation.get(op.id) ?? null;
      const operationIO = op.io ?? { inputs: [], outputs: [], variables: [], nodeIds: [] };
      const defaults: Record<string, unknown> = {};
      for (const input of operationIO.inputs) {
        if (input.defaultValue === undefined) continue;
        defaults[stateKey({ kind: "input", operationId: op.id, nodeId: input.nodeId })] =
          input.defaultValue;
      }
      const timeoutMs = effectiveTimeoutMs(op.timeoutMs, options.timeoutMs);
      return {
        binding,
        outputKeyByNodeId: new Map(
          operationIO.outputs.map((o) => [
            o.nodeId,
            stateKey({ kind: "output", operationId: op.id, nodeId: o.nodeId })
          ])
        ),
        inputNodeIds: operationIO.inputs.map((i) => i.nodeId),
        inputNameByNodeId: new Map(operationIO.inputs.map((i) => [i.nodeId, i.name])),
        defaults,
        ...(graph
          ? {
              runWorkflow: (params: Record<string, unknown>) =>
                runWorkflow(
                  op.id,
                  graph,
                  // A bundle's operations name bundle-local keys, so there is
                  // no workflow id to attribute the run to.
                  resolved.operationsReferenceKeys
                    ? null
                    : graph === resolved.graph
                      ? resolved.info.workflowId
                      : op.workflowId,
                  timeoutMs,
                  params
                )
            }
          : {})
      };
    });

    const runtime = new HeadlessAppRuntime({
      operations,
      defaultOperationId: context.defaultOperationId,
      variables: context.variables,
      ...(options.timeoutMs != null ? { timeoutMs: options.timeoutMs } : {})
    });

    /** Write a value addressed by name (a param, or an `--interact` set step). */
    const writeByName = (
      name: string,
      value: unknown,
      operationId = context.defaultOperationId
    ): boolean => {
      const ref =
        resolveBinding(name, scope, "write", operationId) ??
        resolveBinding(name, scope, "read", operationId);
      if (!ref) return false;
      runtime.write(ref, value);
      return true;
    };

    for (const [key, value] of Object.entries({
      ...resolved.fileParams,
      ...(options.params ?? {})
    })) {
      if (!writeByName(key, value)) {
        report.validation.warnings.push(
          `Param "${key}" matches no input, output, or variable in the workflow.`
        );
      }
    }

    /** Dispatch one action, tracking which run it produced. */
    const dispatch = async (
      record: InteractionRecord,
      action: Parameters<HeadlessAppRuntime["dispatch"]>[0]
    ): Promise<void> => {
      const before = runtime.invocations.length;
      try {
        await runtime.dispatch(action);
      } catch (error) {
        record.error = record.error ?? (error as Error).message;
        return;
      }
      const started = runtime.invocations.slice(before);
      const withRun = started.find((i) => i.runIndex !== null);
      if (withRun) record.runIndex = withRun.runIndex;
      if (action.kind === "run") {
        record.error = record.error ?? runtime.errorFor(action.operationId);
      }
    };

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
        if (writeByName(step.set.key, step.set.value, step.set.operationId)) {
          record.actions.push(`set ${step.set.key}`);
        } else {
          record.error = `"${step.set.key}" matches no input, output, or variable.`;
        }
        continue;
      }

      if ("run" in step) {
        if (!allowRuns) {
          record.actions.push("run (skipped — --no-run)");
          continue;
        }
        record.actions.push(`run ${step.run}`);
        await dispatch(record, { kind: "run", operationId: step.run });
        continue;
      }

      if ("cancel" in step) {
        const cancelled = runtime.cancel(step.cancel);
        record.actions.push(
          cancelled.length > 0
            ? `cancel ${step.cancel} (${cancelled.join(", ")})`
            : `cancel ${step.cancel} (nothing running)`
        );
        continue;
      }

      const trigger = "click" in step ? "click" : "change";
      const found = findWidget(spec, "click" in step ? step.click : step.change);
      if (typeof found === "string") {
        record.error = found;
        continue;
      }
      if ("change" in step && step.value !== undefined) {
        if (found.ref) runtime.write(found.ref, step.value);
        record.actions.push(`set ${found.stateKey ?? found.id}`);
      }
      // A run from a bound write widget carries its binding; the web engine
      // would run just that input's downstream subgraph — headless, both paths
      // are a full authoritative run.
      const from =
        found.bindingMode === "write" ? found.canonicalBinding ?? undefined : undefined;
      const eventCtx = {
        defaultOperationId: context.defaultOperationId,
        resolveVariableId: (key: string | undefined) => {
          const ref = resolveBinding(key, scope, "read");
          return ref?.kind === "variable" ? ref.variableId : null;
        },
        from
      };
      for (const event of found.events) {
        if (event.trigger !== trigger) continue;
        const action = eventToAction(event, eventCtx);
        if (!action) {
          record.error =
            record.error ?? `event "${event.kind}" is incomplete — nothing to dispatch.`;
          continue;
        }
        if (action.kind === "run" && !allowRuns) {
          record.actions.push("run (skipped — --no-run)");
          continue;
        }
        record.actions.push(
          action.kind === "setVariable" || action.kind === "toggleVariable"
            ? `${action.kind} ${action.variableId}`
            : action.kind === "run" || action.kind === "cancel"
              ? `${action.kind} ${action.operationId ?? context.defaultOperationId}`
              : action.kind
        );
        await dispatch(record, action);
      }
      if (record.actions.length === 0) {
        record.error = `widget has no "${trigger}" events to fire.`;
      }
    }

    // The report reads better keyed by the names an author recognizes than by
    // the runtime's namespaced state keys. A second operation prefixes its
    // names so two operations over one workflow stay apart.
    const values: Record<string, unknown> = {};
    for (const operation of context.operations) {
      const prefix =
        operation.id === context.defaultOperationId ? "" : `${operation.id}.`;
      for (const input of operation.io?.inputs ?? []) {
        const value = runtime.read({
          kind: "input",
          operationId: operation.id,
          nodeId: input.nodeId
        });
        if (value !== undefined) values[`${prefix}${input.name}`] = value;
      }
      for (const output of operation.io?.outputs ?? []) {
        const value = runtime.read({
          kind: "output",
          operationId: operation.id,
          nodeId: output.nodeId
        });
        if (value !== undefined) values[`${prefix}${output.name}`] = value;
      }
    }
    const variables: Record<string, unknown> = {};
    for (const [variableId, value] of Object.entries(runtime.state.variables)) {
      if (value === undefined) continue;
      values[variableId] = value;
      variables[variableId] = value;
    }
    report.values = previewValue(values) as Record<string, unknown>;
    report.variables = previewValue(variables) as Record<string, unknown>;

    report.invocations = runtime.invocations.map((invocation) => ({
      id: invocation.id,
      operationId: invocation.operationId,
      status: runtime.state.invocations[invocation.id]?.status ?? "unknown",
      decision: invocation.decision,
      decisionTargets: invocation.decisionTargets,
      runIndex: invocation.runIndex,
      timedOutMs: invocation.timedOutMs,
      error: runtime.state.invocations[invocation.id]?.error ?? null,
      activity: invocation.activity
    }));
    report.activity = [...runtime.activity];

    report.widgets = spec.widgets
      .filter((w) => w.bindingMode !== "layout")
      .map((w) => {
        const value = runtime.read(w.ref);
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

  report.verdict = buildAppVerdict(report, allowRuns, resolved.graph);

  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outDir, "report.md"), renderAppReportMarkdown(report), "utf8");

  return report;
}
