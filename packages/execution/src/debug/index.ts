/**
 * Debug surface: one execution-summary vocabulary and one triage pass for
 * every host that reports on a workflow run — the CLI debug harness, the HTTP
 * debug endpoint, and the agent-facing `debug_workflow` tool.
 *
 * Deliberately free of runtime dependencies (only `import type` crosses the
 * package boundary), so a host can pull the reducer in without booting a
 * session.
 */
export { collectExecutionSummary, previewValue } from "./collector.js";
export {
  buildRunVerdict,
  collectRunIssues,
  describeErrors
} from "./verdict.js";
export type {
  DebugError,
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput,
  RunVerdict
} from "./types.js";
