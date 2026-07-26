export type TriggerKind = "webhook" | "schedule" | "file_watch" | "manual";

/**
 * Node type → registration kind, mirroring `TRIGGER_KIND_BY_NODE_TYPE` in
 * `packages/websocket/src/triggers/registration-sync.ts` — keep the two
 * maps in sync; `web/` cannot import that backend package directly.
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

/** True when any node in the list is a trigger node type. */
export const graphHasTriggerNodes = (
  nodeTypes: ReadonlyArray<string | null | undefined>
): boolean => nodeTypes.some(isTriggerNodeType);
