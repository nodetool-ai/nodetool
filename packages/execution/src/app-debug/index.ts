/**
 * App-debug surface: the headless mini-app simulator.
 *
 * One simulation of an app document — widget spec, static wiring check,
 * interaction script, run folding, verdict — for every host that reports on an
 * app: the `nodetool app debug` harness, the agent-facing build loop, and the
 * server. Target resolution and bundle writing stay with the host; nothing here
 * reads a database or a file.
 */
export { simulateApp, defaultInteractions } from "./simulate.js";
export type {
  AppServerRunInput,
  AppServerRunOutcome,
  AppSimulationDeps
} from "./simulate.js";
export {
  parseAppSpec,
  parseAppDocument,
  documentOperations,
  operationSpec,
  extractAppIO,
  validateApp,
  bindingScopeFor
} from "./app-spec.js";
export type { AppContext } from "./app-spec.js";
export { bundleTarget } from "./bundle-target.js";
export {
  applicationTarget,
  hostGraphFor,
  inlineDocumentTarget
} from "./application-target.js";
export type {
  AppApplicationRecord,
  AppWorkflowLoader,
  AppWorkflowRecord
} from "./application-target.js";
export { normalizeDebugGraph, debugGraphOf } from "./graph-shape.js";
export { summarizeAppReport } from "./summarize.js";
export type {
  AppDebugSummary,
  AppInvocationSummary,
  AppWidgetSummary
} from "./summarize.js";
export {
  HeadlessAppRuntime,
  InMemoryResourceProvider,
  effectiveTimeoutMs,
  seedResourceHint
} from "./runtime.js";
export type {
  HeadlessOperationInit,
  HeadlessResourceCommand,
  HeadlessRunResult,
  ResourceItem
} from "./runtime.js";
export {
  jsScriptRunMessages,
  parseCarriedScriptDocument,
  scriptAppIO,
  scriptOperationInvocation
} from "./script-operation.js";
export type {
  JsScriptOperationLoader,
  JsScriptOperationRunner,
  JsScriptRunResult
} from "./script-operation.js";
export { renderAppReportMarkdown } from "./markdown.js";
export type * from "./types.js";
