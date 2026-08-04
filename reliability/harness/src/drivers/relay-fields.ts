/**
 * Relay-only field policy, shared by every driver whose surface speaks the
 * WS wire protocol (`ws-server.ts`, `packaged.ts`).
 *
 * Both of those surfaces run the same relay — `UnifiedWebSocketRunner` — so
 * both receive the same downstream enrichment the kernel oracle's raw stream
 * never carries. `packages/protocol/src/messages.ts` specifies this: `job_id`
 * is "Stamped downstream by the relay (the unified websocket runner and the
 * browser runner), not by the kernel actor, so it is optional on the wire",
 * and `generation_complete` is emitted by the actor as "a BARE event" with
 * `job_id` and `index` "stamped DOWNSTREAM by the relay".
 *
 * Lives here rather than in each driver because a rule that only one relay
 * surface applies is not a policy, it is a discrepancy — `packaged.ts` not
 * having it is exactly what made the Ring 2 release gate unpassable.
 */

/**
 * Message `type`s the relay backfills `job_id` onto uniformly (its "outbound
 * spread", `unified-websocket-runner.ts`) that the kernel's own emissions for
 * these types (`runner.ts`/`actor.ts`) never carry at all. Scoped per-type
 * (not a blanket drop) because `job_update` DOES set both, and `edge_update`
 * DOES set `job_id`, on the raw kernel stream too — dropping either there
 * would hide a real regression instead of a harmless relay addition. Kept as
 * a driver-local rule (not a `normalize.ts` field list) because
 * `normalize.ts`'s generic per-key visitor has other callers — including its
 * own unit tests — that legitimately expect `job_id`/`workflow_id` preserved
 * on a `node_update`. The relay drivers are the only place that actually
 * knows which of these are relay-only enrichment on their wire protocol.
 */
export const RELAY_ONLY_JOB_ID_TYPES: ReadonlySet<string> = new Set([
  "node_update",
  "generation_complete",
  "output_update",
  // `llm_call` (task D1, journey 8 — the first journey to run a real LLM
  // node): the relay backfills `job_id`/`workflow_id` here the same way it
  // does for `node_update`; the kernel's own `llm_call` emission
  // (`BaseProvider`'s tracing helper) never carries either.
  "llm_call"
]);

/** As {@link RELAY_ONLY_JOB_ID_TYPES}, for `workflow_id`. Includes
 * `edge_update` — the kernel stamps `job_id` there but never `workflow_id`. */
export const RELAY_ONLY_WORKFLOW_ID_TYPES: ReadonlySet<string> = new Set([
  "node_update",
  "generation_complete",
  "output_update",
  "edge_update",
  "llm_call"
]);

/**
 * Message `type`s that exist only as connection-scoped transport control and
 * are never part of a run's stream. `sdk_execution_target` is sent once per
 * socket, at upgrade time and BEFORE any workflow is submitted, by the
 * production Fastify plugin when an SDK live-runner registry is wired
 * (`packages/websocket/src/plugins/websocket.ts`). The kernel oracle has no
 * connection to announce, so there is nothing to compare it against.
 */
export const CONNECTION_CONTROL_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "sdk_execution_target"
]);

/** True when `message` is transport control rather than a run frame — callers
 * drop these before recording (see {@link CONNECTION_CONTROL_MESSAGE_TYPES}). */
export function isConnectionControlMessage(message: Record<string, unknown>): boolean {
  return CONNECTION_CONTROL_MESSAGE_TYPES.has(String(message["type"]));
}

/** Strips fields the relay adds that the kernel driver's raw stream never has,
 * so the two are comparable frame-for-frame (see
 * {@link RELAY_ONLY_JOB_ID_TYPES}/{@link RELAY_ONLY_WORKFLOW_ID_TYPES}).
 * `generation_complete.index` is the same kind of addition — an
 * arrival-order stamp (`unified-websocket-runner.ts`'s
 * `generationIndexByNode`) the kernel's own `generation_complete` emission
 * never sets. */
export function stripRelayOnlyFields(
  message: Record<string, unknown>
): Record<string, unknown> {
  const type = String(message["type"]);
  const rest = { ...message };
  if (RELAY_ONLY_JOB_ID_TYPES.has(type)) delete rest["job_id"];
  if (RELAY_ONLY_WORKFLOW_ID_TYPES.has(type)) delete rest["workflow_id"];
  if (type === "generation_complete") delete rest["index"];
  return rest;
}
