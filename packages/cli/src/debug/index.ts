/**
 * Workflow debug harness — runs a workflow end-to-end on the server and/or in a
 * real browser and collects the workflow JSON, every log/output/error, and an
 * OpenTelemetry trace summary into a single `DebugReport` + on-disk bundle.
 */
export { runDebug, type DebugHarnessDeps } from "./harness.js";
export { runOnServer, type ServerRunInput, type ServerRunOutcome } from "./server-runner.js";
export { runInBrowser, buildBrowserReport, type BrowserRunInput } from "./browser-runner.js";
export { resolveTarget, type ResolvedTarget } from "./target.js";
export { collectExecutionSummary, previewValue } from "./collector.js";
export {
  parseTraceJsonl,
  summarizeSpans,
  readTraceSummary,
  type TraceSpan
} from "./trace.js";
export { buildVerdict } from "./verdict.js";
export { renderReportMarkdown } from "./markdown.js";
export { diffReports, diffIsEmpty, formatDiff, type DebugDiff } from "./diff.js";
export type * from "./types.js";
