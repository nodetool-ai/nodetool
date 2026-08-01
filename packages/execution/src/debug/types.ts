/**
 * Shared debug-summary types.
 *
 * One vocabulary for "what happened in this run", used by every surface that
 * reports on a workflow execution: the CLI debug harness, the HTTP debug
 * endpoint the MCP `debug_workflow` tool calls, and the app-debug harness.
 * They used to live in the CLI alone, so the agent-facing tool reported a
 * different, thinner shape than the CLI did for the same run.
 */

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

/** Pass/fail plus the ordered, actionable issues behind it. */
export interface RunVerdict {
  ok: boolean;
  headline: string;
  issues: string[];
}
