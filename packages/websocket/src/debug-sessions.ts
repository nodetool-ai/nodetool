/**
 * The interactive escalation session registry. It moved to
 * `@nodetool-ai/execution/service` — an in-memory map keyed by session id has
 * nothing server-specific about it, and the agent tools park runs in the same
 * registry when they run a workflow in-process. This module is the server's
 * import site for it.
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
} from "@nodetool-ai/execution/service";
export type {
  CreateDebugSessionOptions,
  DebugSessionEvent,
  ParkedEscalation
} from "@nodetool-ai/execution/service";
