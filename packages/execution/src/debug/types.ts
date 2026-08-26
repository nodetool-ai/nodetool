/**
 * Shared debug-summary types.
 *
 * One vocabulary for "what happened in this run", used by every surface that
 * reports on a workflow execution: the CLI debug harness, the HTTP debug
 * endpoint the MCP `debug_workflow` tool calls, and the app-debug harness.
 * They used to live in the CLI alone, so the agent-facing tool reported a
 * different, thinner shape than the CLI did for the same run.
 */

import type { Intervention } from "@nodetool-ai/protocol";
import type { SupervisedRunSummary } from "../supervisor.js";

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
  /** Final job status (completed | failed | cancelled | …). */
  status: string;
  error: string | null;
  nodes: NodeDebug[];
  logs: LogEntry[];
  edges: EdgeDebug[];
  llmCalls: LlmCallDebug[];
  /** Workflow-level outputs (Output / Preview nodes). */
  outputs: NodeOutput[];
  /**
   * Supervisor decisions, in decision order — empty on an unsupervised run.
   * Folded from `supervisor_decision` messages, so it is the same record the
   * kernel puts on `RunResult.interventions`.
   */
  interventions: Intervention[];
  counts: {
    nodes: number;
    completed: number;
    errored: number;
    logs: number;
    outputs: number;
    llmCalls: number;
    interventions: number;
  };
  errors: DebugError[];
}

/** Pass/fail plus the ordered, actionable issues behind it. */
export interface RunVerdict {
  ok: boolean;
  headline: string;
  issues: string[];
}

// ─── Target and run-report vocabulary ────────────────────────────────────────
// The CLI debug harness and the app simulator both describe a target and a
// finished server run, so the shapes live here rather than in either host.

/** A workflow graph in kernel/runner shape (properties, not data). */
export interface DebugGraph {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/** How the workflow target was provided and what it resolved to. */
export interface DebugTargetInfo {
  /** Original CLI argument (id, path/to/file.json, or path/to/file.ts). */
  ref: string;
  /**
   * How `ref` was interpreted. `application` and `bundle` only occur for app
   * targets: an application row read from the database, and an
   * `ApplicationBundle` JSON file.
   */
  source: "id" | "json" | "dsl" | "application" | "bundle";
  /** Workflow id when known (DB id, or `id`/`workflow_id` field in a file). */
  workflowId: string | null;
  nodeCount: number;
  edgeCount: number;
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
  /**
   * Present only on a supervised run: who supervised it and the rollup of what
   * they decided. The decisions themselves are `summary.interventions`.
   */
  supervised?: {
    provider: string;
    model: string;
    summary: SupervisedRunSummary;
  };
}

/** A verdict that can also carry non-fatal observations. */
export interface DebugVerdict {
  ok: boolean;
  headline: string;
  /** Human-readable problems found, ordered most-actionable first. */
  issues: string[];
  /**
   * Things worth looking at that are not failures — a run cannot decide them
   * either way. Unlike `issues`, these do not clear `ok`.
   */
  warnings?: string[];
}
