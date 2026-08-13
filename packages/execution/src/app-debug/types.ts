/**
 * Shared types for the app-builder debug harness.
 *
 * The harness runs an app-builder mini app (the Puck document stored on
 * `workflow.app_doc`) headlessly: it flattens the widget tree, validates every
 * binding against the workflow's inputs/outputs/variables, then simulates the
 * app the way the web runtime (`useAppRuntime`) does — seed input defaults,
 * apply params, drive widget interactions, execute the workflow on the kernel
 * runner, and fold the streamed messages back into the app's reactive values.
 * Everything lands in a single `AppDebugReport` an agent can act on directly.
 */
import type {
  AppEvent,
  ApplicationDocument,
  BindingRef,
  ConditionProps,
  InputMapping,
  OperationPolicy,
  OperationTarget,
  OutputMapping,
  ResourceKind,
  RunDecision,
  VariableDeclaration,
  WidgetBindingMode as SharedWidgetBindingMode
} from "@nodetool-ai/app-runtime";

import type {
  DebugGraph,
  DebugTargetInfo,
  DebugVerdict,
  ServerRunReport
} from "../debug/types.js";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { SeedResourceItem } from "./runtime.js";

export type { SeedResourceItem };

/**
 * An app target after its host resolved it — an application row, an
 * `ApplicationBundle` file, or a workflow carrying a legacy `app_doc`. The
 * simulator takes this shape and never learns which of the three it came from;
 * resolution (files, database) belongs to the host.
 */
export interface ResolvedAppTarget {
  info: DebugTargetInfo;
  /**
   * The graph the report's IO summary and branch analysis are computed
   * against: the default operation's workflow, or the workflow itself on the
   * legacy path. Empty when nothing resolved.
   */
  graph: DebugGraph;
  /** Params discovered in a file's `params` field, merged under caller params. */
  fileParams: Record<string, unknown>;
  /** The document exactly as stored, for `app.json` and persist warnings. */
  appDoc: unknown;
  /** The parsed document, or null with {@link ResolvedAppTarget.issue} explaining why. */
  document: ApplicationDocument | null;
  /** Why no document could be parsed. */
  issue: string | null;
  /** Graphs the target carries, keyed by the id its operations reference. */
  graphs: Map<string, DebugGraph>;
  /**
   * JS scripts the target carries, keyed the same way — a bundle ships the
   * document of every script version its operations pin, so a script operation
   * runs without a database.
   */
  scripts?: Map<string, { name: string; document: JsScriptDocument }>;
  /**
   * True when those keys are bundle-local, so no operation names a real
   * workflow id and nothing can be handed to the runner as one.
   */
  operationsReferenceKeys: boolean;
  /** The application's name, when the target is an app rather than a workflow. */
  appName: string | null;
}

/** How a widget participates in the reactive layer (from the shared catalog). */
export type WidgetBindingMode = SharedWidgetBindingMode | "unknown";

/** A widget event as stored in Puck props. Structurally the shared `AppEvent`. */
export type AppEventSpec = AppEvent;

/** One placed widget, flattened out of the Puck document tree. */
export interface AppWidgetSpec {
  id: string;
  type: string;
  bindingMode: WidgetBindingMode;
  /** The binding exactly as stored in the document, if any. */
  binding: string | null;
  /**
   * The binding resolved against the live graph. Null when a stored binding
   * names something the workflow no longer has — which is a validation error,
   * not a silent no-op.
   */
  ref: BindingRef | null;
  /** Namespaced state key of {@link ref} (`opId:nodeId`, a variable id, …). */
  stateKey: string | null;
  /** {@link ref} re-encoded in ID form — what a migrated document should store. */
  canonicalBinding: string | null;
  /**
   * For a resource widget (picker, gallery, scene list), the resource binding
   * it addresses. These widgets read a document collection instead of app
   * state, so this is their binding rather than {@link binding}.
   */
  resourceBindingId: string | null;
  /**
   * Bindings the widget carries besides {@link binding} — a chat thread's live
   * reply, a composer's conversation variable. Same resolution rules; `ref` is
   * null when the workflow no longer has what the binding names.
   */
  extraBindings: Array<{ prop: string; binding: string; ref: BindingRef | null }>;
  label: string | null;
  events: AppEventSpec[];
  parentId: string | null;
  slot: string | null;
  /** Hide the widget unless this condition holds. Absent when unconditional. */
  visibleWhen?: ConditionProps;
  /** Disable the widget while this condition holds. */
  disabledWhen?: ConditionProps;
  /** `{binding|filter}` template rendered in place of the bound raw value. */
  format?: string;
}

/** One declared operation, with the workflow surface it resolved against. */
export interface AppOperationSpec {
  id: string;
  name: string;
  workflowId: string;
  /** What the operation runs — a workflow, or a pinned JS script version. */
  target: OperationTarget;
  policy: OperationPolicy;
  timeoutMs: number | null;
  /** Input node id → where its value comes from. */
  inputs: Record<string, InputMapping>;
  /** Output node id → where its value lands. */
  outputs: Record<string, OutputMapping>;
  /** The operation's bindable surface, or null when its workflow is missing. */
  io: AppIO | null;
  /** Why the operation cannot run (workflow not found), else null. */
  unavailable: string | null;
}

export interface AppResourceSpec {
  id: string;
  name: string;
  kind: ResourceKind;
}

export interface AppSpec {
  version: number;
  title: string | null;
  widgets: AppWidgetSpec[];
  operations: AppOperationSpec[];
  variables: VariableDeclaration[];
  resources: AppResourceSpec[];
}

/** The bindable surface of the workflow graph (kernel shape). */
export interface AppInputIO {
  nodeId: string;
  nodeType: string;
  name: string;
  defaultValue?: unknown;
}

export interface AppOutputIO {
  nodeId: string;
  nodeType: string;
  name: string;
}

export interface AppIO {
  inputs: AppInputIO[];
  outputs: AppOutputIO[];
  /** SetVariable channel names (free app state). */
  variables: string[];
  /** All graph node ids — the target space of `node:<id>#<prop>` bindings. */
  nodeIds: string[];
}

/** Static wiring check result. */
export interface AppValidation {
  /** Problems that make the app broken (bad binding, no run trigger…). */
  errors: string[];
  /** Smells worth surfacing but not fatal (unbound output, local-only input…). */
  warnings: string[];
}

/**
 * One step of a scripted interaction (`--interact`):
 *  - `set`    — write a reactive value directly (no events fire)
 *  - `change` — set a write widget's value, then fire its `change` events
 *  - `click`  — fire a widget's `click` events
 *  - `run`    — run one operation by id, without going through a widget
 *  - `cancel` — cancel an operation's live invocations
 *  - `seedResource` — fill a declared resource binding's collection
 * Widgets are referenced by component id, unique type, or unique label.
 * `set` resolves against the default operation unless `operationId` says
 * otherwise.
 */
export type InteractionStep =
  | { set: { key: string; value: unknown; operationId?: string } }
  | { click: string }
  | { change: string; value: unknown }
  | { run: string }
  | { cancel: string }
  | { seedResource: { id: string; items: SeedResourceItem[] } };

/** What actually happened when a step executed. */
export interface InteractionRecord {
  step: string;
  /** Dispatched actions, e.g. "run", "setState dark=true", "cancel". */
  actions: string[];
  /** Index into `runs` when the step triggered a workflow run. */
  runIndex: number | null;
  error: string | null;
}

/** One simulated invocation: what policy said, what the run did. */
export interface AppInvocationReport {
  id: string;
  operationId: string;
  status: string;
  /** What `decideRun` said about starting this invocation. */
  decision: RunDecision["kind"];
  /** Invocations the decision named — cancelled (replace) or waited on (queue). */
  decisionTargets: string[];
  /** Index into `runs`, or null when the run never started. */
  runIndex: number | null;
  /** The timeout that elapsed, when the harness stopped waiting. */
  timedOutMs: number | null;
  error: string | null;
  /** Every activity label the run reported, in order. */
  activity: string[];
}

/** A widget's resolved value after the simulation settled. */
export interface AppWidgetState {
  id: string;
  type: string;
  bindingMode: WidgetBindingMode;
  binding: string | null;
  stateKey: string | null;
  /**
   * For a resource widget, the collection it shows. Its {@link value} is that
   * collection's members rather than a bound state value.
   */
  resourceBindingId?: string | null;
  /** Preview-safe final value (long strings/blobs truncated). */
  value: unknown;
  /**
   * What the widget shows: its `format` template rendered against the final
   * state. Null when it has no template and displays {@link value} raw.
   */
  display?: string | null;
  /**
   * True when the widget shows something — the rendered `format` template when
   * it has one, else the bound value. A value that arrived but is empty (`""`,
   * `[]`, `null`) shows nothing, so it counts as false.
   */
  hasValue: boolean;
  /** Whether the widget's `visibleWhen` held once the simulation settled. */
  visible: boolean;
  /** Whether its `disabledWhen` held once the simulation settled. */
  disabled: boolean;
}

/** One resource collection after the simulation settled. */
export interface AppResourceCollectionState {
  id: string;
  kind: ResourceKind;
  /** False when no step or param seeded the collection — it has no provider. */
  seeded: boolean;
  items: Array<{ id: string; name: string; revision?: number }>;
  /** The member a `from: "resource"` param would send. */
  selected: string | null;
  /** Commands dispatched against the binding, in order. */
  commands: string[];
}

export interface AppDebugReport {
  generatedAt: string;
  target: DebugTargetInfo;
  app: { version: number; title: string | null; widgetCount: number } | null;
  spec: AppSpec | null;
  io: { inputs: string[]; outputs: string[]; variables: string[] };
  validation: AppValidation;
  interactions: InteractionRecord[];
  /** One report per workflow run the interactions triggered. */
  runs: ServerRunReport[];
  /** Final reactive values (preview-safe), keyed by input/output/variable name. */
  values: Record<string, unknown>;
  /**
   * Final variable values (preview-safe), keyed by variable id — including the
   * ones an operation output wrote.
   */
  variables: Record<string, unknown>;
  /** Every invocation the simulation started, in order. */
  invocations: AppInvocationReport[];
  /** The activity labels the runs reported, in order. */
  activity: Array<{ invocationId: string; operationId: string; label: string }>;
  widgets: AppWidgetState[];
  /** Every declared resource binding and what its collection held at the end. */
  resources: AppResourceCollectionState[];
  /**
   * What a headless run cannot answer, so a reader knows what the verdict does
   * not cover. Conditions and `format` are simulated; layout is not.
   */
  notSimulated: string[];
  verdict: DebugVerdict;
  bundleDir: string | null;
}

/** Options that drive an app debug run. */
export interface AppDebugOptions {
  /**
   * Reactive values applied before interactions, keyed by input name. A
   * `resource:<binding id>` key seeds that collection instead, taking an array
   * of {@link SeedResourceItem}.
   */
  params?: Record<string, unknown>;
  /**
   * Scripted interactions. When omitted the harness fires the app's natural
   * run trigger: the first `click`→`run` widget (a Run button), else the first
   * `change`→`run` write widget.
   */
  interact?: InteractionStep[];
  /** Execute workflow runs (default true). false = static wiring check only. */
  run?: boolean;
  /** Bundle output directory. When omitted a timestamped dir is generated. */
  outDir?: string;
  /**
   * Per-run timeout, ms. An operation's own `timeoutMs` also applies; when both
   * are set the shorter one wins, so `--timeout` is always a ceiling.
   */
  timeoutMs?: number;
}
