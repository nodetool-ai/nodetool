/**
 * Public types for the `@nodetool-ai/execution` facade. See the package
 * README for the wiring inventory this API is derived from.
 */
import type {
  Edge,
  NodeDescriptor,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type { NodeValidator, RunResult } from "@nodetool-ai/kernel";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridgeBase, ProcessingContext } from "@nodetool-ai/runtime";

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
}

export interface ExecutionSessionOptions {
  /** Raw saved graph JSON. Hydration (`hydrateGraphNodeFlags`) happens once, here. */
  graph: RawGraphInput;
  /** Node registry used for both hydration and TS executor resolution. */
  registry: NodeRegistry;
  /** See {@link BridgeFactory}. Omit to use the default TS-graph-aware connector. */
  bridgeFactory?: BridgeFactory;
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
   * Forwarded to `WorkflowRunnerOptions.strict` (docs/RELIABILITY_ARCHITECTURE.md
   * §12): turns advisory lifecycle checks (`_checkPendingInboxWork`, pending
   * control responses) into thrown violations instead of log warnings. The
   * reliability harness's kernel driver always sets this — it is the oracle
   * surface and the one place strict mode is meant to be on by default.
   */
  strict?: boolean;
}

export type { NodeDescriptor, Edge, ProcessingMessage, RunResult };
