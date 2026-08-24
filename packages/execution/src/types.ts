/**
 * Public types for the `@nodetool-ai/execution` facade. See the package
 * README for the wiring inventory this API is derived from.
 */
import type {
  Edge,
  NodeDescriptor,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type {
  NodeExecutor,
  NodeTypeResolver,
  NodeValidator,
  RunResult,
  SupervisorHandle
} from "@nodetool-ai/kernel";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type {
  ProviderConfigurationChecker,
  RunModelCatalogs
} from "./preflight.js";
import type {
  PythonBridgeBase,
  ProcessingContext,
  PythonJobLifecycle
} from "@nodetool-ai/runtime";

/** A raw saved graph — the shape stored in the DB / sent over the wire. */
export interface RawGraphInput {
  nodes: ReadonlyArray<Record<string, unknown>>;
  edges: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Connects (or declines to connect) a Python worker bridge for a graph.
 * Defaults to `connectPythonBridgeForGraph` from `@nodetool-ai/runtime`,
 * which only spawns/dials a worker when the graph actually contains a node
 * the TS registry can't resolve. Callers that already hold a live bridge
 * (e.g. a long-lived server process) can inject one instead.
 */
export type BridgeFactory = (
  nodes: ReadonlyArray<{ type?: unknown }>,
  hasTsExecutor: (nodeType: string) => boolean
) => Promise<PythonBridgeBase | null>;

/**
 * Hooks a host wires in to persist job state across the session's lifecycle.
 * All hooks are best-effort: a throwing hook is logged and swallowed by the
 * facade, matching every construction site's existing "persistence must
 * never fail the run" behavior.
 */
export interface JobPersistenceHook {
  /** Called once the run is accepted (graph resolved, job row creatable). */
  onAccepted?: (jobId: string) => void | Promise<void>;
  /** Called once with the run's terminal result. */
  onTerminal?: (result: RunResult) => void | Promise<void>;
}

export interface ExecutionLimits {
  /**
   * Cancels the run with reason `"timeout"` if it hasn't reached a terminal
   * state within this many milliseconds. Implemented as `session.cancel
   * ("timeout")` — there is no separate timeout code path.
   */
  runTimeoutMs?: number;
  /**
   * Reserved for a future per-node timeout. The kernel has no per-node
   * timeout hook today (only the run-level `AbortSignal` cancel() aborts),
   * so passing this throws at `create()` rather than silently no-op-ing.
   */
  nodeTimeoutMs?: number;
  /** Forwarded to `WorkflowRunnerOptions.bufferLimit` (per-inbox cap). */
  bufferLimit?: number | null;
  /**
   * Cap on messages queued for an un-drained `session.messages` consumer
   * (default {@link DEFAULT_MESSAGE_BUFFER_LIMIT}); `0` disables the cap. Only
   * meaningful together with `captureMessages`. Past the cap the stream stops
   * queueing and the iterator throws — a consumer that fell behind fails
   * loudly instead of retaining the whole run's message history.
   */
  messageBufferLimit?: number;
}

export interface ExecutionSessionOptions {
  /** Raw saved graph JSON. Hydration (`hydrateGraphNodeFlags`) happens once, here. */
  graph: RawGraphInput;
  /**
   * Node registry used for both hydration and TS executor resolution.
   * Optional only for a host that injects its own `resolveExecutor` (below)
   * AND has no `NodeRegistry` instance of its own to hand the facade — e.g.
   * `unified-websocket-runner.ts`'s `resolveExecutor` is wired in wholesale at
   * server bootstrap, closing over a registry this class never sees. Without
   * a registry, hydration falls back to `withExplicitNodeFlags` (flags
   * default to `false` rather than being resolved from a registered class) —
   * correct here because the WS runner always hydrates its own richer copy of
   * the graph via `Graph.loadFromDict` *before* handing it to this facade, so
   * every flag this fallback would have resolved (and `propertyTypes`) is
   * already present on the incoming graph and passes through unchanged.
   */
  registry?: NodeRegistry;
  /**
   * Bypass the facade's own registry-based executor resolution
   * (`createExecutorResolver`) entirely and use this instead. Required when
   * `registry` is omitted. Exists for hosts whose executor resolution isn't
   * "registry, else Python bridge, else throw" — `unified-websocket-runner.ts`
   * injects its own `resolveExecutor` at bootstrap (a closure over a registry
   * and an already-connected bridge this class never sees), so migrating it
   * onto `ExecutionSession` means using its resolver as-is rather than
   * building a second, possibly-divergent one from a `bridgeFactory`.
   */
  resolveExecutor?: (node: NodeDescriptor) => NodeExecutor;
  /**
   * Optional richer hydration path, mirroring `Graph.loadFromDict`'s async
   * metadata resolver (`createGraphNodeTypeResolver` in `@nodetool-ai/node-sdk`).
   * When provided, hydration resolves each node's `propertyTypes`/`outputs`
   * from registry metadata (including a namespace not yet loaded, via the
   * resolver's own lazy-load hook) in addition to the streaming/control flags
   * `hydrateGraphNodeFlags` always resolves. This is what makes multi-edge
   * fan-in into a non-list property correctly skip aggregation (the kernel's
   * `_classify_list_inputs` parity check only gates on a populated
   * `propertyTypes` map). Omit to keep the lighter, synchronous
   * `hydrateGraphNodeFlags`-only path (no `propertyTypes`/`outputs`).
   */
  resolveNodeType?: NodeTypeResolver;
  /** See {@link BridgeFactory}. Omit to use the default TS-graph-aware connector. */
  bridgeFactory?: BridgeFactory;
  /**
   * Python bridge to bracket this run with `job.start` / `job.end` (bridge
   * protocol v4). Defaults to whatever `bridgeFactory` returned, which is the
   * right answer for a host whose bridge lives and dies with the run — the
   * session closes it anyway.
   *
   * A host that owns a long-lived shared bridge and injects its own
   * `resolveExecutor` (the WS runner) gets `null` from its `bridgeFactory` on
   * purpose, so it must pass that bridge here. Without it nothing ever closes
   * the run boundary, `release_nodes()` on the worker keeps having no caller,
   * and the model cache grows across runs — which is the exact case the shared
   * bridge exists for.
   */
  jobLifecycleBridge?: PythonJobLifecycle | null;
  /** Fixed job id; a random one is generated when omitted. */
  jobId?: string;
  workflowId?: string | null;
  /** Start params, keyed by input-node name. Ignored fields are seeded via `pushInput`. */
  params?: Record<string, unknown>;
  /** Wake-up payload for a trigger-driven run (see `RunJobRequest.trigger_event`). */
  triggerEvent?: {
    node_id: string;
    payload: unknown;
    input_id: string;
  } | null;
  /**
   * Pre-built execution context. When omitted, the facade builds a minimal
   * one (no storage/secrets/persistence wiring) suitable for hermetic runs
   * and tests. Hosts with asset storage, secrets, or workspace directories
   * should build and pass their own — the facade never invents storage
   * behavior a caller didn't ask for.
   */
  context?: ProcessingContext;
  persistence?: JobPersistenceHook | null;
  limits?: ExecutionLimits;
  /**
   * Renames terminal Output-node keys to their public `properties.name`
   * before the run starts, matching `unified-websocket-runner.ts`'s
   * `require_terminal_result` behavior (output-name rewriting).
   */
  requireTerminalResult?: boolean;
  /** Forwarded to `WorkflowRunnerOptions.validateNode`. */
  validateNode?: NodeValidator;
  /**
   * Forwarded to `WorkflowRunnerOptions.supervisor` — the one integration
   * point every surface shares for workflow supervision
   * (docs/workflow-supervisor-design.md §7). Omitted, the run behaves exactly
   * as it does today: no escalation is ever constructed.
   *
   * Wrap the handle in the kernel's `BoundedHandle` before passing it: the
   * facade adds no bounds of its own, so an unwrapped handle runs with no
   * decision ceiling, no retry ceiling, and no per-decision timeout.
   */
  supervisor?: SupervisorHandle;
  /**
   * Forwarded to `WorkflowRunnerOptions.strict` (docs/RELIABILITY_ARCHITECTURE.md
   * §12): turns advisory lifecycle checks (`_checkPendingInboxWork`, pending
   * control responses) into thrown violations instead of log warnings. The
   * reliability harness's kernel driver always sets this — it is the oracle
   * surface and the one place strict mode is meant to be on by default.
   */
  strict?: boolean;
  /**
   * Provider/model catalogs the run preflight checks the graph's selections
   * against. Defaults to the process-wide provider registry — the same
   * catalogs `runWorkflow` uses.
   */
  catalogs?: RunModelCatalogs;
  /**
   * How the preflight decides a selected provider is configured. Defaults to
   * `unconfiguredProviderErrors` over the process-wide provider registry.
   *
   * A host whose providers are not in that registry (a cassette, a fake, an
   * in-process custom provider) must supply this **and** `catalogs`: the two
   * checks read the same registry, so replacing one and not the other refuses
   * a graph the host can in fact run.
   */
  providerConfiguration?: ProviderConfigurationChecker;
  /**
   * Capture every emitted message into `session.messages` (default `false`).
   * Off by default because capture is retention: the queue holds each message
   * until a consumer pulls it, and a host that only awaits `session.result`
   * (every production caller today) would grow one unread queue per run — the
   * kernel is explicit about not retaining real-time chunks for exactly that
   * reason. Turn it on only when actually iterating the stream (the
   * reliability harness's kernel driver does); see `limits.messageBufferLimit`
   * for the cap that catches a consumer falling behind.
   */
  captureMessages?: boolean;
  /**
   * Record what this run spends on provider calls into the `predictions`
   * ledger `nodetool costs` reads (default `true`). The write is best-effort —
   * a host with no database is not failed for it — so turning this off is only
   * for a caller that persists the same spend itself and would double-count.
   */
  recordCosts?: boolean;
}

export type {
  NodeDescriptor,
  Edge,
  ProcessingMessage,
  RunResult,
  SupervisorHandle
};
