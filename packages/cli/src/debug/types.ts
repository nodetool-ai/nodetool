/**
 * Shared types for the workflow debug harness.
 *
 * The harness runs a workflow end-to-end on two surfaces — the headless server
 * (kernel `WorkflowRunner`) and a real browser (the `e2e_runner` page driven by
 * Playwright) — and folds everything worth inspecting into a single
 * `DebugReport`: the workflow graph JSON, every processing message (logs, node
 * IO, outputs, edges, LLM calls), an OpenTelemetry span summary, browser console
 * errors and a screenshot. The report is written to a bundle directory and also
 * returned so an agent can iterate without re-parsing files.
 */

/** A workflow graph in kernel/runner shape (properties, not data). */
export interface DebugGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** How the workflow target was provided and what it resolved to. */
export interface DebugTargetInfo {
  /** Original CLI argument (id, path/to/file.json, or path/to/file.ts). */
  ref: string;
  /** How `ref` was interpreted. */
  source: "id" | "json" | "dsl";
  /** Workflow id when known (DB id, or `id`/`workflow_id` field in a file). */
  workflowId: string | null;
  nodeCount: number;
  edgeCount: number;
}

/** A single value emitted by a node (output_update / generation_complete). */
export interface NodeOutput {
  nodeId?: string;
  outputName: string;
  outputType: string;
  /** Preview-safe value: long strings + base64 blobs are truncated. */
  value: unknown;
}

/** Per-node distilled execution state. */
export interface NodeDebug {
  nodeId: string;
  nodeType: string | null;
  nodeName: string | null;
  /** Last status seen for the node (pending | running | completed | error …). */
  status: string;
  error: string | null;
  outputs: NodeOutput[];
  progress?: { progress: number; total: number };
  cost?: { provider: string; amount: number; unit: string; currency: string | null } | null;
}

export interface LogEntry {
  nodeId: string | null;
  nodeName?: string | null;
  severity: string;
  content: string;
}

export interface EdgeDebug {
  edgeId: string;
  status: string;
  counter: number | null;
}

export interface LlmCallDebug {
  nodeId: string;
  provider: string;
  model: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  cost: number | null;
  durationMs: number;
  error: string | null;
}

/** A collated error for quick triage. */
export interface DebugError {
  nodeId: string | null;
  nodeType?: string | null;
  message: string;
}

/** Everything distilled from a run's processing-message stream. */
export interface ExecutionSummary {
  /** Final job status (completed | failed | cancelled | suspended | …). */
  status: string;
  error: string | null;
  nodes: NodeDebug[];
  logs: LogEntry[];
  edges: EdgeDebug[];
  llmCalls: LlmCallDebug[];
  /** Workflow-level outputs (Output / Preview nodes). */
  outputs: NodeOutput[];
  counts: {
    nodes: number;
    completed: number;
    errored: number;
    logs: number;
    outputs: number;
    llmCalls: number;
  };
  errors: DebugError[];
}

/** Rolled-up OpenTelemetry spans for the run. */
export interface TraceSummary {
  spanCount: number;
  /** Wall-clock span over all spans (max end − min start), ms. */
  totalDurationMs: number | null;
  tokens: { input: number; output: number; total: number };
  costUsd: number;
  /** Count + total self-time by span name (llm.chat, node.process, …). */
  byName: Record<string, { count: number; totalDurationMs: number }>;
  /** Slowest spans, descending. */
  slowest: Array<{ name: string; durationMs: number; status: string }>;
}

export interface ServerRunReport {
  surface: "server";
  /** True when the job reached the `completed` status. */
  ok: boolean;
  status: string;
  error: string | null;
  durationMs: number;
  summary: ExecutionSummary;
  trace: TraceSummary | null;
  /** Bundle-relative path to the raw messages JSONL. */
  messagesFile?: string;
  /** Bundle-relative path to the raw trace JSONL. */
  traceFile?: string;
}

/** A canvas screenshot captured at one stage of the browser run. */
export interface BrowserStageShot {
  /** 0-based capture order. */
  index: number;
  /** Run status at capture time (running until the final frame). */
  status: string;
  /** Bundle-relative path to the screenshot. */
  file: string;
}

export interface BrowserRunReport {
  surface: "browser";
  ok: boolean;
  status: string;
  error: string | null;
  durationMs: number | null;
  summary: ExecutionSummary;
  consoleErrors: string[];
  /** Bundle-relative path to the final settled screenshot. */
  screenshotFile?: string;
  /** Canvas screenshots captured at successive stages of the run. */
  stages?: BrowserStageShot[];
  /** Bundle-relative path to the raw browser RunRecord JSON. */
  recordFile?: string;
  /** Set when the browser surface could not run (missing deps / browser). */
  unavailableReason?: string;
}

export interface DebugVerdict {
  ok: boolean;
  headline: string;
  /** Human-readable problems found, ordered most-actionable first. */
  issues: string[];
}

export interface DebugReport {
  generatedAt: string;
  target: DebugTargetInfo;
  /** The workflow graph JSON (runner shape). */
  workflow: DebugGraph;
  server: ServerRunReport | null;
  browser: BrowserRunReport | null;
  verdict: DebugVerdict;
  /** Absolute path to the on-disk bundle, when one was written. */
  bundleDir: string | null;
}

/** Options that drive a debug run. */
export interface DebugOptions {
  /** Run the headless server surface. Default true. */
  server?: boolean;
  /** Run the real-browser surface (Playwright). Default false. */
  browser?: boolean;
  /** Input params keyed by input-node name. */
  params?: Record<string, unknown>;
  /** Bundle output directory. When omitted a timestamped dir is generated. */
  outDir?: string;
  /** Per-surface run timeout, ms. */
  timeoutMs?: number;
}
