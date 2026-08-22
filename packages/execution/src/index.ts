/**
 * @nodetool-ai/execution – Public API
 */
export { ExecutionSession } from "./session.js";
export { normalizeGraph, toRawGraphInput } from "./normalize-graph.js";
export {
  assertPreflight,
  collectPreflightIssues,
  ExecutionPreflightError,
  formatPreflightDetail,
  isExecutionPreflightError,
  modelSelectionErrors,
  providerConfigurationChecker,
  unconfiguredProviderErrors,
  RUNTIME_CATALOGS
} from "./preflight.js";
export type {
  CredentialResolver,
  ExecutionPreflightIssue,
  PreflightIssueKind,
  PreflightOptions,
  ProviderConfigurationChecker,
  RunModelCatalogs
} from "./preflight.js";
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
  DebugGraph,
  DebugTargetInfo,
  DebugVerdict,
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput,
  RunVerdict,
  ServerRunReport,
  TraceSummary
} from "./debug/types.js";

// App-debug surface: one headless simulation of a mini app for every host that
// reports on one (CLI `app debug`, the agent build loop, the server).
export { simulateApp, defaultInteractions } from "./app-debug/index.js";
export type {
  AppServerRunInput,
  AppServerRunOutcome,
  AppSimulationDeps
} from "./app-debug/simulate.js";
export type * from "./app-debug/types.js";
