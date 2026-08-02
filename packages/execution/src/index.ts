/**
 * @nodetool-ai/execution – Public API
 */
export { ExecutionSession } from "./session.js";
export { normalizeGraph } from "./normalize-graph.js";
export { DEFAULT_MESSAGE_BUFFER_LIMIT } from "./message-stream.js";
export {
  INTERVENTION_MARK,
  formatInterventionLine,
  formatSupervisedSummary,
  summarizeInterventions
} from "./supervisor.js";
export type { SupervisedRunSummary } from "./supervisor.js";
export type {
  BridgeFactory,
  Edge,
  ExecutionLimits,
  ExecutionSessionOptions,
  JobPersistenceHook,
  NodeDescriptor,
  ProcessingMessage,
  RawGraphInput,
  RunResult,
  SupervisorHandle
} from "./types.js";
export type { NodeTypeResolver, ResolvedNodeType } from "@nodetool-ai/kernel";

// Debug surface: one execution-summary vocabulary + triage for every host that
// reports on a run (CLI harness, HTTP debug endpoint, agent tools).
export {
  collectExecutionSummary,
  previewValue
} from "./debug/collector.js";
export {
  buildRunVerdict,
  collectInterventionWarnings,
  collectRunIssues,
  describeErrors
} from "./debug/verdict.js";
export type {
  DebugError,
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput,
  RunVerdict
} from "./debug/types.js";
