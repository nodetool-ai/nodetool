/**
 * The app simulator: runs a resolved mini app headlessly.
 *
 * Parses the app document into a widget spec and a set of operations,
 * statically validates the wiring, then simulates the app the way the web and
 * mobile runtimes do: seed input and variable defaults, apply params, attach
 * the resource collections the script seeds, execute the interaction script
 * (each `run` action is a full workflow run on the injected server runner,
 * subject to the operation's policy and timeout), fold the message stream into
 * the app's reactive values, and re-evaluate every widget's conditions — a step
 * no user could perform, because the widget is hidden or disabled, fails.
 *
 * Nothing here touches a database or a filesystem. The host resolves the target
 * (`ResolvedAppTarget`), supplies the workflow runner, and writes whatever
 * bundle it wants; the returned `AppDebugReport` is the whole result.
 */
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type {
  DebugGraph,
  DebugVerdict,
  ServerRunReport
} from "../debug/types.js";
import { previewValue } from "../debug/collector.js";
import {
  DEFAULT_OPERATION_ID,
  eventToAction,
  parseBinding,
  operationTarget,
  parseInputStateKey,
  resolveBinding,
  stateKey,
  type InputSlot,
  type OperationBinding,
  type OperationTarget
} from "@nodetool-ai/app-runtime";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  jsScriptRunMessages,
  scriptAppIO,
  scriptOperationInvocation,
  type JsScriptOperationLoader,
  type JsScriptOperationRunner
} from "./script-operation.js";
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
  writeRefusal,
  type HeadlessOperationInit
} from "./runtime.js";
import type {
  AppDebugOptions,
  AppDebugReport,
  AppIO,
  AppSpec,
  AppWidgetSpec,
  InteractionRecord,
  InteractionStep,
  ResolvedAppTarget,
  SeedResourceItem
} from "./types.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** What the simulator hands a host's workflow runner. */
export interface AppServerRunInput {
  graph: DebugGraph;
  workflowId: string | null;
  params: Record<string, unknown>;
  timeoutMs?: number;
}

/** What it needs back: the run's report and the raw stream to fold. */
export interface AppServerRunOutcome {
  report: ServerRunReport;
  rawMessages: ProcessingMessage[];
}

export interface AppSimulationDeps {
  /** Load a workflow by DB id — an operation may name one the target lacks. */
  loadFromDb: (
    id: string
  ) => Promise<{ graph: DebugGraph; app_doc?: unknown } | null>;
  /** Execute one operation's workflow. */
  runOnServer: (input: AppServerRunInput) => Promise<AppServerRunOutcome>;
  /**
   * Resolve a pinned script version a script operation targets and the target
   * itself does not carry. Absent on a host with no script store, where such an
   * operation reports as unresolvable instead of running something else.
   */
  loadScript?: JsScriptOperationLoader;
  /**
   * Execute one script operation. Absent on a host that cannot run a sandbox
   * body, with the same consequence.
   */
  runScript?: JsScriptOperationRunner;
  /** Progress/log sink. */
  onLog?: (line: string) => void;
  /**
   * Persist one run's raw message stream, returning the path to record on the
   * run report. Hosts that write no bundle omit it.
   */
  onRunMessages?: (
    runIndex: number,
    messages: ProcessingMessage[]
  ) => Promise<string | null>;
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
  return `no widget matches "${ref}" (tried id, type, and label). Widgets: ${widgetRoster(spec)}`;
}

/**
 * What the caller could have written instead. Naming only the miss sent one
 * agent round after round guessing the step shape, because "no widget matches
 * undefined" says nothing about what a target may be.
 */
function widgetRoster(spec: AppSpec): string {
  if (spec.widgets.length === 0) return "none — the app has no widgets.";
  const listed = spec.widgets
    .slice(0, 12)
    .map((w) =>
      w.label
        ? `${w.id} (${w.type}, label "${w.label}")`
        : `${w.id} (${w.type})`
    )
    .join(", ");
  return spec.widgets.length > 12 ? `${listed}, …` : listed;
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
  if ("seedResource" in step) return `seedResource ${step.seedResource.id}`;
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

/**
 * Overlay the live values of node-property bindings onto the graph, the way the
 * web runtime does before every run (`collectNodePropertyOverlays` →
 * `withNodeProperties` in `web/src/components/appbuilder/nodeBinding.ts`).
 *
 * A widget bound `op:main/prop:node7#strength` writes an input slot keyed by
 * node and property, which no input node reads — the value only reaches the run
 * as a property of the node it names. The web helpers take ReactFlow nodes, so
 * the mapping is repeated here against the kernel shape (`node.properties`);
 * `parseInputStateKey` — the shared inverse of the state key — is what both
 * sides actually agree on.
 */
export function withNodePropertyOverlays(
  graph: DebugGraph,
  inputs: Record<string, InputSlot>
): DebugGraph {
  const byNode = new Map<string, Record<string, unknown>>();
  for (const [key, slot] of Object.entries(inputs)) {
    if (slot.value === undefined) continue;
    const parsed = parseInputStateKey(key);
    if (!parsed?.property) continue;
    const existing = byNode.get(parsed.nodeId);
    if (existing) existing[parsed.property] = slot.value;
    else byNode.set(parsed.nodeId, { [parsed.property]: slot.value });
  }
  if (byNode.size === 0) return graph;
  return {
    nodes: graph.nodes.map((node) => {
      const overlay =
        typeof node.id === "string" ? byNode.get(node.id) : undefined;
      if (!overlay) return node;
      const properties =
        typeof node.properties === "object" && node.properties !== null
          ? (node.properties as Record<string, unknown>)
          : {};
      return { ...node, properties: { ...properties, ...overlay } };
    }),
    edges: graph.edges
  };
}

/**
 * Whether a value that did arrive leaves the widget showing nothing. `""`,
 * `[]` and `null` all render blank, so counting them as "received a value"
 * reports an app that computed nothing as one that worked.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * A workflow can complete while a node hands its own failure downstream as a
 * plain value — a Code node that catches and emits the message, which is how
 * the calculator app that motivated this check reported `'eval' is not
 * defined` while every node reported success. The run carries no error in that
 * case and neither does the invocation, so the value's own shape is the only
 * signal there is. Kept to a stringified `Error` at the very start of the
 * value, where prose that merely discusses an error does not match.
 */
const ERROR_VALUE = /^(?:[A-Z][A-Za-z]*)?Error:\s+\S/;

function errorLikeValue(value: unknown): string | null {
  if (typeof value !== "string" || !ERROR_VALUE.test(value)) return null;
  return value.replace(/\s+/g, " ").slice(0, 200);
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

/**
 * What a headless run leaves to the browser. Conditions and `format` are
 * simulated, so only what needs a DOM (or a provider the simulator has not
 * grown yet) belongs here.
 */
const NOT_SIMULATED: ReadonlyArray<string> = [
  "Layout, styling, focus, and scroll — nothing here renders a DOM.",
  "Stored resource collections — a run reads the seeded in-memory provider, never the database, and `openResource` has no editor to open.",
  "Reactive subgraph runs — the browser reruns one input's downstream subgraph, the harness runs the whole workflow."
];

function buildAppVerdict(
  report: Pick<
    AppDebugReport,
    | "validation"
    | "interactions"
    | "runs"
    | "widgets"
    | "spec"
    | "invocations"
    | "resources"
  >,
  ranWorkflow: boolean,
  graph: DebugGraph,
  conditionIssues: ReadonlyArray<string>
): DebugVerdict {
  const issues: string[] = [...report.validation.errors, ...conditionIssues];
  const warnings: string[] = [];

  for (const interaction of report.interactions) {
    if (interaction.error) {
      issues.push(`Interaction "${interaction.step}": ${interaction.error}`);
    }
  }
  for (const run of report.runs) {
    if (!run.ok) {
      issues.push(
        `Run ended ${run.status}${run.error ? `: ${run.error}` : ""}`
      );
    }
    for (const e of run.summary.errors.slice(0, 5)) {
      const where = e.nodeType ?? e.nodeId ?? "workflow";
      issues.push(
        `Node ${where}: ${e.message.replace(/\s+/g, " ").slice(0, 200)}`
      );
    }
  }
  for (const invocation of report.invocations) {
    if (invocation.timedOutMs == null) continue;
    issues.push(
      `Operation "${invocation.operationId}" did not finish within its ${invocation.timedOutMs}ms timeout — the app would show it still running.`
    );
  }
  // A picker over an unseeded collection renders empty, and no interaction can
  // pick from it — worth saying, but only the script knows what belongs there.
  for (const resource of report.resources) {
    if (resource.seeded) continue;
    const shown = report.widgets
      .filter((w) => w.resourceBindingId === resource.id)
      .map((w) => `${w.type} "${w.id}"`);
    if (shown.length === 0) continue;
    warnings.push(
      `${shown.join(", ")} shows resource binding "${resource.id}", which nothing seeded — the collection is empty. Seed it with a seedResource step or a "resource:${resource.id}" param.`
    );
  }

  const ranOperations = new Set(report.invocations.map((i) => i.operationId));
  if (ranWorkflow && report.runs.length > 0 && report.runs.every((r) => r.ok)) {
    const conditional = conditionalNodeIds(graph);
    const byName = nodeIdsByName(graph);
    const nodeIds = new Set(
      graph.nodes
        .map((n) => (typeof n.id === "string" ? n.id : ""))
        .filter(Boolean)
    );
    // Variables a widget writes rather than the graph — a chat composer's
    // conversation. Nothing the run emits fills them, so an empty one after a
    // headless run says nothing about the wiring.
    const uiWrittenVariables = new Set(
      (report.spec?.widgets ?? []).flatMap((w) =>
        w.extraBindings
          .filter((extra) => extra.ref?.kind === "variable")
          .map((extra) =>
            extra.ref?.kind === "variable" ? extra.ref.variableId : ""
          )
      )
    );
    for (const w of report.widgets) {
      if (w.bindingMode !== "read" || !w.binding) continue;
      const message = errorLikeValue(w.display ?? w.value);
      if (message) {
        issues.push(
          `${w.type} "${w.id}" shows an error message from "${w.binding}": ${message}`
        );
      }
    }
    for (const w of report.widgets) {
      if (w.bindingMode !== "read" || !w.binding || w.hasValue) continue;
      const ref = parseBinding(w.binding);
      if (ref?.kind === "variable" && uiWrittenVariables.has(ref.variableId)) {
        continue;
      }
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
      const nodeId = nodeIds.has(parsed)
        ? parsed
        : (byName.get(parsed) ?? null);
      if (nodeId && conditional.has(nodeId)) {
        // One run takes one branch, so an empty widget here is expected. It is
        // still worth surfacing: a branch that no input can reach looks exactly
        // the same, and only running both branches tells them apart.
        warnings.push(
          `${w.type} "${w.id}" is bound to "${w.binding}", downstream of a branch that was not taken this run — run the other branch to confirm it can be reached.`
        );
        continue;
      }
      // The value arrived and is empty ("", [], null). A warning rather than an
      // issue: an output is legitimately empty often enough — no matches, no
      // remainder, nothing to say — that failing the verdict on it would call
      // working apps broken. An app that computed nothing looks the same from
      // here, so the report says what happened and leaves the call to the
      // author. A widget whose `format` template renders nothing keeps the
      // issue below: the value reached it and the template still dropped it,
      // which is wiring, not data.
      if (w.display === null && w.value !== undefined && !w.resourceBindingId) {
        warnings.push(
          `${w.type} "${w.id}" is bound to "${w.binding}" but received an empty value — confirm the output is meant to be empty.`
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
    issues.push(
      "No interaction triggered a workflow run — the app was never executed."
    );
  }

  const ok = issues.length === 0;
  const headline = ok
    ? report.runs.length > 0
      ? `App ran clean — ${report.runs.length} run(s), every bound widget on a taken branch received a value.`
      : "App wiring is valid (static check only — no run executed)."
    : `App has issues — ${issues[0]}`;
  return { ok, headline, issues, warnings };
}

/** A finished script run in the report's server-run shape. */
function scriptRunReport(
  result: { ok: boolean; error?: string; logs: string[] },
  durationMs: number,
  scriptName: string,
  messagesFile: string | null | undefined
): ServerRunReport {
  const status = result.ok ? "completed" : "failed";
  type ReportFields = Mutable<ServerRunReport>;
  const report: ReportFields = {
    surface: "server",
    ok: result.ok,
    status,
    error: result.error ?? null,
    durationMs,
    summary: {
      status,
      error: result.error ?? null,
      nodes: [],
      logs: result.logs.map((content) => ({
        nodeId: scriptName,
        severity: "info" as const,
        content
      })),
      edges: [],
      llmCalls: [],
      outputs: [],
      interventions: [],
      counts: {
        nodes: 0,
        completed: result.ok ? 1 : 0,
        errored: result.ok ? 0 : 1,
        logs: result.logs.length,
        outputs: 0,
        llmCalls: 0,
        interventions: 0
      },
      errors: result.error
        ? [{ nodeId: scriptName, message: result.error }]
        : []
    },
    trace: null
  };
  if (messagesFile) {
    report.messagesFile = messagesFile;
  }
  return report;
}

/**
 * What a script operation runs: the document the target carries under the key
 * its target names, else the one the host loads by id and version.
 */
async function resolveOperationScript(
  target: Extract<OperationTarget, { kind: "script" }>,
  carried: ResolvedAppTarget["scripts"],
  loadScript: AppSimulationDeps["loadScript"]
): Promise<{
  script: { name: string; document: JsScriptDocument } | null;
  unavailable: string | null;
}> {
  const bundled = carried?.get(target.scriptId);
  if (bundled) return { script: bundled, unavailable: null };
  if (!loadScript) {
    return {
      script: null,
      unavailable: `runs JS script "${target.scriptId}" v${target.scriptVersion}, which this host cannot resolve.`
    };
  }
  try {
    const script = await loadScript(target.scriptId, target.scriptVersion);
    if (!script) {
      return {
        script: null,
        unavailable: `runs JS script "${target.scriptId}" v${target.scriptVersion}, which does not exist.`
      };
    }
    return { script, unavailable: null };
  } catch (error) {
    return {
      script: null,
      unavailable: `runs JS script "${target.scriptId}" v${target.scriptVersion}, which could not be loaded: ${String(error)}`
    };
  }
}

/**
 * The graph an operation runs: one the target carries (a bundle's workflows,
 * the host workflow), else the database.
 */
async function resolveOperationGraph(
  operation: OperationBinding,
  host: {
    workflowId: string | null;
    graph: DebugGraph;
    graphs: Map<string, DebugGraph>;
  },
  loadFromDb: AppSimulationDeps["loadFromDb"]
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

export async function simulateApp(
  resolved: ResolvedAppTarget,
  options: AppDebugOptions,
  deps: AppSimulationDeps
): Promise<AppDebugReport> {
  const log = deps.onLog ?? (() => {});
  const allowRuns = options.run ?? true;

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
    resources:
      document?.resources.map(({ id, name, kind }) => ({ id, name, kind })) ??
      []
  };
  const bindingByOperation = new Map<string, OperationBinding>();
  const scriptByOperation = new Map<
    string,
    { name: string; document: JsScriptDocument }
  >();
  if (document) {
    for (const binding of documentOperations(document)) {
      const target = operationTarget(binding);
      bindingByOperation.set(binding.id, binding);

      if (target.kind === "script") {
        const { script, unavailable } = await resolveOperationScript(
          target,
          resolved.scripts,
          deps.loadScript
        );
        if (script) scriptByOperation.set(binding.id, script);
        context.operations.push(
          operationSpec(
            binding,
            script ? scriptAppIO(script.document) : null,
            script && !deps.runScript
              ? `runs JS script "${script.name}", which this host cannot execute.`
              : unavailable
          )
        );
        continue;
      }

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
      context.operations.push(operationSpec(binding, operationIO, unavailable));
    }
    // The first declared operation, exactly as the web runtime picks it
    // (`operations[0]` in `useAppRuntime`) — so a bare-name binding resolves to
    // the same operation headlessly and in the browser.
    context.defaultOperationId =
      context.operations[0]?.id ?? DEFAULT_OPERATION_ID;
  }

  const {
    spec,
    issues: parseIssues,
    warnings: parseWarnings
  } = parseAppSpec(resolved.appDoc, io, document ? context : undefined, {
    document,
    issue: resolved.issue
  });
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
    resources: [],
    notSimulated: [...NOT_SIMULATED],
    verdict: { ok: false, headline: "", issues: [] },
    bundleDir: null
  };

  /** Verdict issues the condition simulation found, folded in at the end. */
  const conditionIssues: string[] = [];

  if (spec) {
    const runs: ServerRunReport[] = report.runs;
    const runWorkflow = async (
      operationId: string,
      graph: DebugGraph,
      workflowId: string | null,
      timeoutMs: number | null,
      params: Record<string, unknown>
    ) => {
      log(`Running operation "${operationId}"…`);
      const runInput: Parameters<typeof deps.runOnServer>[0] = {
        graph: withNodePropertyOverlays(graph, runtime.state.inputs),
        workflowId,
        params
      };
      if (timeoutMs != null) {
        runInput.timeoutMs = timeoutMs;
      }
      const outcome = await deps.runOnServer(runInput);
      // The slot is claimed only once the run settles, so a run the harness
      // timed out on never takes an index from the one that follows it.
      const runIndex = runs.length;
      const messagesFile = await deps.onRunMessages?.(
        runIndex,
        outcome.rawMessages
      );
      if (messagesFile) outcome.report.messagesFile = messagesFile;
      runs.push(outcome.report);
      log(
        `Run ${runIndex + 1}: ${outcome.report.status} · ${outcome.report.summary.counts.errored} node error(s)`
      );
      // SAFETY: the fold reads a message by field name off the wire shape,
      // and a ProcessingMessage is that shape — it is what the runner
      // serializes and what the web runtime folds.
      return {
        messages: outcome.rawMessages as ReadonlyArray<
          Record<string, unknown>
        >,
        runIndex
      };
    };

    /**
     * Run one script operation and hand back the stream the fold expects. The
     * run endpoint answers with plain JSON, so `jsScriptRunMessages` is what
     * turns that into per-emit and final output messages.
     */
    const runScriptOperation = async (
      operationId: string,
      target: Extract<OperationTarget, { kind: "script" }>,
      script: { name: string; document: JsScriptDocument },
      timeoutMs: number | null,
      inputs: Record<string, unknown>
    ) => {
      log(`Running script operation "${operationId}"…`);
      const started = Date.now();
      // A streaming body reads its inputs off the inbox, so the operation's
      // one value per input is staged as a one-item stream instead.
      const invocation = scriptOperationInvocation(script.document, inputs);
      const scriptInput: Parameters<NonNullable<typeof deps.runScript>>[0] = {
        scriptId: target.scriptId,
        scriptVersion: target.scriptVersion,
        name: script.name,
        document: script.document,
        inputs: invocation.inputs
      };
      if (invocation.inputStreams) {
        scriptInput.inputStreams = invocation.inputStreams;
      }
      if (timeoutMs != null) {
        scriptInput.timeoutMs = timeoutMs;
      }
      const result = await deps.runScript!(scriptInput);
      const messages = jsScriptRunMessages(result);
      const runIndex = runs.length;
      // SAFETY: `jsScriptRunMessages` builds the same per-emit and final
      // message shapes the runner streams, and this hook only serializes them
      // to JSONL.
      const messagesFile = await deps.onRunMessages?.(
        runIndex,
        messages as ProcessingMessage[]
      );
      runs.push(
        scriptRunReport(result, Date.now() - started, script.name, messagesFile)
      );
      log(`Run ${runIndex + 1}: ${result.ok ? "completed" : "failed"}`);
      return { messages, runIndex };
    };

    const scope = bindingScopeFor(io, context);
    const operations: HeadlessOperationInit[] = context.operations.map((op) => {
      const binding = bindingByOperation.get(op.id) as OperationBinding;
      const script = scriptByOperation.get(op.id) ?? null;
      const graph = graphByOperation.get(op.id) ?? null;
      const operationIO = op.io ?? {
        inputs: [],
        outputs: [],
        variables: [],
        nodeIds: []
      };
      const defaults: Record<string, unknown> = {};
      for (const input of operationIO.inputs) {
        if (input.defaultValue === undefined) continue;
        defaults[
          stateKey({ kind: "input", operationId: op.id, nodeId: input.nodeId })
        ] = input.defaultValue;
      }
      const timeoutMs = effectiveTimeoutMs(op.timeoutMs, options.timeoutMs);
      type InitFields = Mutable<HeadlessOperationInit>;
      const init: InitFields = {
        binding,
        outputKeyByNodeId: new Map(
          operationIO.outputs.map((o) => [
            o.nodeId,
            stateKey({ kind: "output", operationId: op.id, nodeId: o.nodeId })
          ])
        ),
        inputNodeIds: operationIO.inputs.map((i) => i.nodeId),
        inputNameByNodeId: new Map(
          operationIO.inputs.map((i) => [i.nodeId, i.name])
        ),
        defaults
      };
      if (script && deps.runScript) {
        init.runWorkflow = (params: Record<string, unknown>) =>
          runScriptOperation(
            op.id,
            op.target as Extract<OperationTarget, { kind: "script" }>,
            script,
            timeoutMs,
            params
          );
      }
      // A workflow graph wins over the script binding, exactly as the later
      // spread did before.
      if (graph) {
        init.runWorkflow = (params: Record<string, unknown>) =>
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
          );
      }
      return init;
    });

    const runtimeInit: ConstructorParameters<typeof HeadlessAppRuntime>[0] = {
      operations,
      defaultOperationId: context.defaultOperationId,
      variables: context.variables,
      resources: document?.resources ?? [],
      scope,
      widgets: spec.widgets.map((w) => {
        type WidgetFields = {
          id: string;
          visibleWhen?: typeof w.visibleWhen;
          disabledWhen?: typeof w.disabledWhen;
          format?: typeof w.format;
        };
        const widget: WidgetFields = { id: w.id };
        if (w.visibleWhen) {
          widget.visibleWhen = w.visibleWhen;
        }
        if (w.disabledWhen) {
          widget.disabledWhen = w.disabledWhen;
        }
        if (w.format) {
          widget.format = w.format;
        }
        return widget;
      })
    };
    if (options.timeoutMs != null) {
      runtimeInit.timeoutMs = options.timeoutMs;
    }
    const runtime = new HeadlessAppRuntime(runtimeInit);

    /**
     * Write a value addressed by name (a param, or an `--interact` set step),
     * returning why it did not land, or null once it did. Reading a name in
     * write mode first and read mode second means an output name resolves — to
     * a slot nothing can write, which is a failed step, not a silent no-op.
     */
    const writeByName = (
      name: string,
      value: unknown,
      operationId = context.defaultOperationId
    ): string | null => {
      const ref =
        resolveBinding(name, scope, "write", operationId) ??
        resolveBinding(name, scope, "read", operationId);
      if (!ref) return `"${name}" matches no input, output, or variable.`;
      const refusal = writeRefusal(ref);
      if (refusal) return `"${name}" ${refusal}.`;
      runtime.write(ref, value);
      return null;
    };

    /** Seed one collection, reporting why a bad seed did nothing. */
    const seedResource = (
      resourceBindingId: string,
      items: unknown
    ): string | null => {
      if (!Array.isArray(items)) {
        return `Resource seed for "${resourceBindingId}" is not an array of items.`;
      }
      const seeds: SeedResourceItem[] = [];
      for (const item of items) {
        const seed = item as SeedResourceItem | null;
        if (!seed || typeof seed.id !== "string" || seed.id.length === 0) {
          return `Resource seed for "${resourceBindingId}" has an item without an "id".`;
        }
        seeds.push(seed);
      }
      try {
        runtime.seedResource(resourceBindingId, seeds);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };

    for (const [key, value] of Object.entries({
      ...resolved.fileParams,
      ...(options.params ?? {})
    })) {
      // `--params '{"resource:docs": [...]}'` seeds a collection; every other
      // key writes a reactive value.
      if (key.startsWith("resource:")) {
        const failure = seedResource(key.slice("resource:".length), value);
        if (failure) report.validation.warnings.push(failure);
        continue;
      }
      const failure = writeByName(key, value);
      if (failure) report.validation.warnings.push(`Param ${failure}`);
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
        const failure = writeByName(
          step.set.key,
          step.set.value,
          step.set.operationId
        );
        if (failure) record.error = failure;
        else record.actions.push(`set ${step.set.key}`);
        continue;
      }

      if ("seedResource" in step) {
        const { id, items } = step.seedResource;
        const failure = seedResource(id, items);
        if (failure) record.error = failure;
        else
          record.actions.push(`seedResource ${id} (${items.length} item(s))`);
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
      const found = findWidget(
        spec,
        "click" in step ? step.click : step.change
      );
      if (typeof found === "string") {
        record.error = found;
        continue;
      }
      // A `set` step writes state directly and models the runtime; a click or a
      // change models a user, and a user cannot touch what the app hides or
      // disables.
      const gate = runtime.widgetState(found.id);
      const verb = trigger === "click" ? "clicked" : "changed";
      const named = found.label ?? found.id;
      if (gate && !gate.visible) {
        record.error = `${verb} "${named}" while hidden by \`${gate.visibleWhen ?? "visibleWhen"}\`.`;
        continue;
      }
      if (gate?.disabled) {
        record.error = `${verb} "${named}" while disabled by \`${gate.disabledWhen ?? "disabledWhen"}\`.`;
        continue;
      }
      if ("change" in step && step.value !== undefined) {
        // A change whose value never landed must not go on to fire the widget's
        // events: the run behind them would read the old value.
        if (!found.ref) {
          record.error = found.binding
            ? `changed "${named}" but its binding "${found.binding}" resolves to nothing — nothing was set.`
            : `changed "${named}", which has no binding to write to.`;
          continue;
        }
        const refusal = writeRefusal(found.ref);
        if (refusal) {
          record.error = `changed "${named}", whose binding "${found.binding ?? ""}" ${refusal}.`;
          continue;
        }
        runtime.write(found.ref, step.value);
        record.actions.push(`set ${found.stateKey ?? found.id}`);
      }
      // A run from a bound write widget carries its binding; the web engine
      // would run just that input's downstream subgraph — headless, both paths
      // are a full authoritative run.
      const from =
        found.bindingMode === "write"
          ? (found.canonicalBinding ?? undefined)
          : undefined;
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
            record.error ??
            `event "${event.kind}" is incomplete — nothing to dispatch.`;
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

    report.resources = runtime.resourceBindingList.map((binding) => {
      const provider = runtime.resourceProvider(binding.id);
      const items = provider?.list() ?? [];
      return {
        id: binding.id,
        kind: binding.kind,
        seeded: provider !== null,
        items: items.map((item) => {
          type ListedFields = {
            id: string;
            name: string;
            revision?: number;
          };
          const listed: ListedFields = { id: item.ref.id, name: item.name };
          if (item.ref.revision !== undefined) {
            listed.revision = item.ref.revision;
          }
          return listed;
        }),
        selected: provider?.selected()?.id ?? null,
        commands: runtime.resourceCommands
          .filter((c) => c.resourceBindingId === binding.id)
          .map((c) => c.command)
      };
    });

    report.widgets = spec.widgets
      .filter((w) => w.bindingMode !== "layout")
      .map((w) => {
        // A resource widget shows a collection, not a state value — report what
        // its picker or gallery would list.
        if (w.resourceBindingId) {
          const items =
            runtime.resourceProvider(w.resourceBindingId)?.list() ?? [];
          const state = runtime.widgetState(w.id);
          return {
            id: w.id,
            type: w.type,
            bindingMode: w.bindingMode,
            binding: w.binding,
            stateKey: w.stateKey,
            resourceBindingId: w.resourceBindingId,
            value: previewValue(
              items.map((item) => ({ id: item.ref.id, name: item.name }))
            ),
            display: null,
            hasValue: items.length > 0,
            visible: state?.visible ?? true,
            disabled: state?.disabled ?? false
          };
        }
        const value = runtime.read(w.ref);
        // A `format` template is what the widget actually shows, so it — not
        // the raw value — decides whether anything reached the screen.
        const display = runtime.display(w.id);
        const state = runtime.widgetState(w.id);
        return {
          id: w.id,
          type: w.type,
          bindingMode: w.bindingMode,
          binding: w.binding,
          stateKey: w.stateKey,
          value: previewValue(value),
          display,
          hasValue:
            display !== null ? display.length > 0 : !isEmptyValue(value),
          visible: state?.visible ?? true,
          disabled: state?.disabled ?? false
        };
      });

    for (const w of spec.widgets) {
      if (!w.events.some((e) => e.kind === "run")) continue;
      const state = runtime.widgetState(w.id);
      if (!state || state.everReachable) continue;
      const blocking = !state.visible
        ? `visibleWhen (\`${state.visibleWhen ?? ""}\`) never held`
        : `disabledWhen (\`${state.disabledWhen ?? ""}\`) always held`;
      conditionIssues.push(
        `${w.type} "${w.label ?? w.id}" runs the app, but its ${blocking} — no interaction could start a run.`
      );
    }
  }

  report.verdict = buildAppVerdict(
    report,
    allowRuns,
    resolved.graph,
    conditionIssues
  );

  return report;
}
