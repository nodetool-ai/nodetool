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
  DebugTargetInfo,
  DebugVerdict,
  ServerRunReport
} from "../debug/types.js";

/** How a widget participates in the reactive layer (mirrors the web catalog). */
export type WidgetBindingMode = "read" | "write" | "action" | "layout" | "unknown";

/** A widget event as stored in Puck props (mirror of the web `AppEvent`). */
export interface AppEventSpec {
  trigger: "click" | "change";
  kind: "run" | "cancel" | "setState" | "toggleState";
  /** Variable name for setState/toggleState. */
  key?: string;
  /** Literal value for setState. */
  value?: string;
}

/** One placed widget, flattened out of the Puck document tree. */
export interface AppWidgetSpec {
  id: string;
  type: string;
  bindingMode: WidgetBindingMode;
  /** The input/output/variable name the widget is bound to, if any. */
  binding: string | null;
  /**
   * Reactive state key, resolved the way the web runtime does: the binding,
   * or the widget id for an unbound write widget (local-only state).
   */
  stateKey: string | null;
  label: string | null;
  events: AppEventSpec[];
  parentId: string | null;
  slot: string | null;
}

export interface AppSpec {
  version: number;
  title: string | null;
  widgets: AppWidgetSpec[];
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
 * Widgets are referenced by component id, unique type, or unique label.
 */
export type InteractionStep =
  | { set: { key: string; value: unknown } }
  | { click: string }
  | { change: string; value: unknown };

/** What actually happened when a step executed. */
export interface InteractionRecord {
  step: string;
  /** Dispatched actions, e.g. "run", "setState dark=true", "cancel". */
  actions: string[];
  /** Index into `runs` when the step triggered a workflow run. */
  runIndex: number | null;
  error: string | null;
}

/** A widget's resolved value after the simulation settled. */
export interface AppWidgetState {
  id: string;
  type: string;
  bindingMode: WidgetBindingMode;
  binding: string | null;
  stateKey: string | null;
  /** Preview-safe final value (long strings/blobs truncated). */
  value: unknown;
  hasValue: boolean;
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
  widgets: AppWidgetState[];
  verdict: DebugVerdict;
  bundleDir: string | null;
}

/** Options that drive an app debug run. */
export interface AppDebugOptions {
  /** Reactive values applied before interactions, keyed by input name. */
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
  /** Per-run timeout, ms. */
  timeoutMs?: number;
}
