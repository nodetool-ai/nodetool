/**
 * Shared types for the E2E workflow test runner.
 * The runner loads a manifest of workflows, executes each against the real
 * backend over the WebSocket protocol (JSON text mode), and records everything
 * worth inspecting into a RunRecord per workflow.
 */

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "error"
  | "timeout"
  | "skipped";

/** A single workflow entry in the suite manifest. */
export interface WorkflowRef {
  /** Stable id (the source filename without extension). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Path of the graph JSON under the served suite dir (e.g. /e2e-suite/foo.json). */
  file: string;
  /** Run params keyed by input-node name. */
  params: Record<string, unknown>;
  /** Env var names that must be present for this workflow to run for real. */
  requiresSecrets?: string[];
  /** Optional assertions checked after the run completes. */
  expect?: {
    status?: RunStatus;
    /** Substring that must appear in the stringified outputs. */
    outputContains?: string;
    /** Minimum number of output_update messages expected. */
    minOutputs?: number;
  };
  tags?: string[];
  /** Where the graph came from (cli-fixtures | shipped-examples | custom). */
  source?: string;
}

export interface Manifest {
  generatedAt: string;
  /** Env var names detected at suite-build time (used to gate secret-requiring workflows). */
  secretsAvailable: string[];
  workflows: WorkflowRef[];
}

/** A decoded WebSocket message from the backend. */
export interface WsEvent {
  type?: string;
  [key: string]: unknown;
}

export interface CapturedOutput {
  node_id?: string;
  node_name?: string;
  output_name?: string;
  output_type?: string;
  value: unknown;
}

export interface CapturedLog {
  ts: number;
  level?: string;
  content: string;
  node_id?: string;
}

export interface CapturedArtifact {
  name: string;
  contentType: string;
  /** Inline data URL when the value carried bytes/base64; otherwise omitted. */
  dataUrl?: string;
  /** Backend asset/storage URI when the value referenced one. */
  uri?: string;
}

export interface NodeIO {
  node_type?: string;
  status?: string;
  result?: unknown;
  error?: string | null;
}

export interface RunRecord {
  id: string;
  name: string;
  file: string;
  source?: string;
  tags?: string[];
  status: RunStatus;
  skipReason?: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  params: Record<string, unknown>;
  jobId: string | null;
  error: string | null;
  outputs: CapturedOutput[];
  logs: CapturedLog[];
  artifacts: CapturedArtifact[];
  /** Per-node final status + result, keyed by node id. */
  nodeIO: Record<string, NodeIO>;
  /** Full ordered event log (raw decoded messages). */
  events: WsEvent[];
  counts: {
    nodes: number;
    outputs: number;
    errors: number;
    edgeUpdates: number;
  };
  expectationFailures: string[];
}

/** Options for an ad-hoc single-graph run (the debug harness path). */
export interface AdHocRunOptions {
  /** Stable id used in the record (defaults to a generated `adhoc-<ts>`). */
  id?: string;
  /** Human-readable name shown on the record. */
  name?: string;
  /** Override the per-run timeout (ms). */
  timeoutMs?: number;
}

/** The controller the harness exposes on `window.__E2E__` for the Playwright driver. */
export interface E2EController {
  ready: Promise<void>;
  manifest: () => WorkflowRef[];
  results: () => RunRecord[];
  state: () => "loading" | "idle" | "running" | "done";
  /** Run the next pending workflow; resolves with its record once settled. */
  runNext: () => Promise<RunRecord | null>;
  /** Run every remaining workflow sequentially. */
  runAll: () => Promise<RunRecord[]>;
  currentIndex: () => number;
  /**
   * Run a caller-supplied graph (not from the manifest) and resolve with its
   * record once settled. Renders the graph on the canvas and captures the same
   * logs / node IO / outputs / events as the suite path — the entry point the
   * `nodetool debug` harness drives for the browser surface.
   */
  runGraph: (
    graph: { nodes: unknown[]; edges: unknown[] },
    params?: Record<string, unknown>,
    options?: AdHocRunOptions
  ) => Promise<RunRecord>;
  /**
   * Live snapshot of the in-flight ad-hoc run, for a driver that wants to
   * capture the canvas at successive stages. `stage` increments on every
   * status-bearing event (a node starting/finishing, the job settling) so the
   * driver can screenshot only when the picture actually changed.
   */
  snapshot: () => RunSnapshot;
}

/** A point-in-time view of the current ad-hoc run. */
export interface RunSnapshot {
  /** True once the run has settled (completed/failed/error/timeout). */
  settled: boolean;
  /** Monotonic counter bumped on each status-bearing event. */
  stage: number;
  /** Current run status (running until settled). */
  status: string;
  /** Per-node status keyed by node id, for the current frame. */
  nodeStatus: Record<string, string>;
}

declare global {
  interface Window {
    __E2E__?: E2EController;
  }
}
