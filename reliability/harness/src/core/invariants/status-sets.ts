/**
 * Shared status vocabulary for the lifecycle/terminal-uniqueness invariants.
 * Not itself a §6 family — just the constants both modules need to stay in
 * sync on what counts as "terminal" for a node vs. a job.
 */

/**
 * `node_update` statuses that end an invocation. The kernel actor
 * (`packages/kernel/src/actor.ts`) emits `"completed"`, `"error"`, and
 * `"suspended"` — no node-level `"cancelled"`, since a cancelled run
 * interrupts actors rather than walking each one to a terminal status; a
 * `"cancelled"` node status is accepted too, for surfaces/fakes that do emit
 * one. `"warning"` and `"running"` are deliberately excluded: `"warning"` is
 * a mid-run aside, not a terminal status.
 */
export const NODE_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "error",
  "failed",
  "cancelled",
  "suspended"
]);

/** `job_update` statuses that end a run. `"running"`/`"queued"` are not terminal. */
export const JOB_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "suspended"
]);

/**
 * Terminal precedence, most to least important (`runner.ts:625`): cancel >
 * suspend > failed > completed. Index doubles as precedence rank (lower
 * wins).
 */
export const TERMINAL_PRECEDENCE: readonly string[] = [
  "cancelled",
  "suspended",
  "failed",
  "completed"
];

/** Normalizes a status to the `TERMINAL_PRECEDENCE` vocabulary (`"error"` reads as `"failed"`). */
export function canonicalTerminalStatus(status: string): string {
  return status === "error" ? "failed" : status;
}

function messageRecord(
  message: Record<string, unknown> | undefined
): Record<string, unknown> {
  return message ?? {};
}

export function asString(
  message: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = messageRecord(message)[key];
  return typeof value === "string" ? value : undefined;
}
