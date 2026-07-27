/**
 * Trigger node types and the registration kinds they compile to.
 *
 * Lives in `protocol` because both sides of the wire need it: the backend
 * decides which nodes become `trigger_registrations` rows, and the editor
 * decides which graphs get a trigger affordance. The two must agree, and a
 * hand-mirrored copy in `web/` drifted the moment either side gained a kind.
 */

/** A registration's kind — the ingestion adapter that feeds it. */
export type TriggerKind = "webhook" | "schedule" | "file_watch" | "manual";

/**
 * Node type → registration kind. Only nodes listed here compile to a
 * registration; other `nodetool.triggers.*` nodes (e.g. `Wait`) are ignored.
 */
export const TRIGGER_KIND_BY_NODE_TYPE: Readonly<Record<string, TriggerKind>> =
  {
    "nodetool.triggers.WebhookTrigger": "webhook",
    "nodetool.triggers.IntervalTrigger": "schedule",
    "nodetool.triggers.FileWatchTrigger": "file_watch",
    "nodetool.triggers.ManualTrigger": "manual"
  };

/** Node types that compile to a `trigger_registrations` row when a workflow
 * is activated. */
export const TRIGGER_NODE_TYPES: ReadonlySet<string> = new Set(
  Object.keys(TRIGGER_KIND_BY_NODE_TYPE)
);

/** True when `type` is a node type that registers a trigger on activation. */
export const isTriggerNodeType = (type: string | null | undefined): boolean =>
  !!type && TRIGGER_NODE_TYPES.has(type);

/**
 * Why a registration disabled itself. `null` on a registration the user
 * disabled by hand — that is a choice, not a fault.
 */
export type TriggerDisabledReason = "failures" | "expired" | "max_runs";

/**
 * Consecutive failed runs after which a registration disables itself (PRD
 * O1). Counted on the run's outcome, so a workflow that throws every time
 * stops burning money after five attempts instead of firing all night.
 */
export const TRIGGER_MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Why a trigger stopped, in a sentence. `null` for a registration nobody
 * disabled automatically — the UI then has nothing to explain.
 *
 * The registration's `last_error` carries what actually went wrong; this says
 * why it is no longer armed. Shared so the editor, the phone, and the server
 * log all describe the same stop the same way.
 */
export function describeTriggerDisabledReason(
  reason: string | null | undefined,
  consecutiveFailures = 0
): string | null {
  switch (reason) {
    case "failures":
      return `Disabled after ${consecutiveFailures || TRIGGER_MAX_CONSECUTIVE_FAILURES} consecutive failures.`;
    case "expired":
      return "Disabled: this trigger's expiry has passed.";
    case "max_runs":
      return "Disabled: this trigger reached its run limit.";
    default:
      return null;
  }
}
