/**
 * `@nodetool-ai/execution/service` — workflow execution as a service.
 *
 * Everything the HTTP surface does *except* parse a Request and write a
 * Response: running a saved workflow (plain, debug, or interactive), the
 * in-memory escalation-session registry those interactive runs park in, the
 * kernel runner every app simulation shares, and the app-debug engine.
 *
 * The websocket package keeps the Fastify routes and calls this. So do the
 * agent tools — an agent runs a workflow in-process, never over HTTP.
 */

export {
  debugSessions,
  DebugSession,
  InteractiveEscalationHandle,
  TooManyDebugSessionsError,
  INTERACTIVE_DECISION_TIMEOUT_MS,
  SESSION_MAX_LIFETIME_MS,
  CANCEL_SETTLE_TIMEOUT_MS,
  MAX_LIVE_SESSIONS_PER_USER
} from "./debug-sessions.js";
export type {
  CreateDebugSessionOptions,
  DebugSessionEvent,
  ParkedEscalation
} from "./debug-sessions.js";

export {
  resolveWorkflowWorkspace,
  resolveWorkflowWorkspaceDir,
  workspaceFromRow,
  setWorkspaceCloudStorage,
  setWorkspaceChangeNotifier,
  usesCloudWorkspaces,
  buildWorkspaceExecutionContext
} from "./workflow-workspace.js";
export type { WorkspaceFileChange } from "./workflow-workspace.js";

export { createAppServerRunner } from "./app-run-server.js";
export type { AppServerRunnerOptions } from "./app-run-server.js";

export {
  runWorkflow,
  peekDebugSession,
  submitEscalationVerdict,
  cancelDebugSession,
  buildWorkflowRunPayload,
  debugSessionEventPayload,
  boundedRunOption,
  modelSelectionErrors,
  MAX_INTERACTIVE_DECISIONS,
  MAX_INTERACTIVE_RETRIES_PER_NODE,
  MAX_INTERACTIVE_DECISION_TIMEOUT_MS
} from "./workflow-run.js";
export type {
  RunModelCatalogs,
  RunWorkflowOptions,
  RunWorkflowOutcome,
  WorkflowRunEnvironment
} from "./workflow-run.js";

export {
  runApplicationDebug,
  AppServiceError
} from "./app-debug-service.js";
export type { AppDebugDeps, AppDebugRequest } from "./app-debug-service.js";
