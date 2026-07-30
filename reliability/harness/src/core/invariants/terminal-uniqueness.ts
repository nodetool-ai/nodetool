/**
 * Terminal-uniqueness invariants (docs/RELIABILITY_ARCHITECTURE.md §6
 * "Lifecycle"):
 *
 * - Exactly one terminal `job_update` per run, and nothing follows it on
 *   that job's stream.
 * - Terminal precedence is exactly cancel > suspend > failed > completed
 *   (`runner.ts:625`) — asserted, not assumed.
 *
 * Split from `lifecycle.ts` (which covers the node-level running/terminal
 * pairing) so each §6 bullet stays independently attributable.
 */
import type { RunRecord } from "../record.js";
import type { Violation } from "./types.js";
import {
  JOB_TERMINAL_STATUSES,
  TERMINAL_PRECEDENCE,
  canonicalTerminalStatus,
  asString
} from "./status-sets.js";

function isCancelCommand(message: Record<string, unknown>): boolean {
  return message["command"] === "cancel_job";
}

export function checkTerminalUniqueness(record: RunRecord): Violation[] {
  const violations: Violation[] = [];

  const terminalIndices: number[] = [];
  record.frames.forEach((frame, index) => {
    const message = frame.message as Record<string, unknown>;
    if (asString(message, "type") !== "job_update") return;
    const status = asString(message, "status");
    if (status !== undefined && JOB_TERMINAL_STATUSES.has(status)) {
      terminalIndices.push(index);
    }
  });

  if (terminalIndices.length === 0) {
    violations.push({
      invariant: "terminal-uniqueness.missing",
      message: "no terminal job_update found in the record"
    });
    return violations;
  }

  if (terminalIndices.length > 1) {
    violations.push({
      invariant: "terminal-uniqueness.multiple",
      message: `${terminalIndices.length} terminal job_update frames found (expected exactly 1)`,
      details: { frameIndices: terminalIndices }
    });
  }

  const firstTerminal = terminalIndices[0];

  const framesAfter = record.frames
    .slice(firstTerminal + 1)
    .filter(
      (frame) => asString(frame.message as Record<string, unknown>, "type") === "job_update"
    );
  if (framesAfter.length > 0) {
    violations.push({
      invariant: "terminal-uniqueness.frames-after-terminal",
      message: `${framesAfter.length} job_update frame(s) appear after the terminal job_update at frame ${firstTerminal}`,
      frameIndex: firstTerminal,
      details: { count: framesAfter.length }
    });
  }

  // Terminal precedence: cancel > suspend > failed > completed.
  const terminalMessage = record.frames[firstTerminal].message as Record<string, unknown>;
  const terminalStatus = asString(terminalMessage, "status") ?? "";

  const hasCancelRequest = record.frames.some(
    (frame) =>
      frame.direction === "client_to_server" &&
      isCancelCommand(frame.message as Record<string, unknown>)
  );
  const hasSuspendedNode = record.frames.some((frame) => {
    const message = frame.message as Record<string, unknown>;
    return asString(message, "type") === "node_update" && asString(message, "status") === "suspended";
  });
  const hasNodeError = record.frames.some((frame) => {
    const message = frame.message as Record<string, unknown>;
    if (asString(message, "type") !== "node_update") return false;
    const status = asString(message, "status");
    return status === "error" || status === "failed";
  });

  // Task D3: some failures never reach a per-node lifecycle event at all —
  // e.g. an unresolvable executor (a Python bridge that failed to connect,
  // `python-node-workflow`'s `bridge-never-ready`/`bridge-epipe`/
  // `bridge-version-mismatch` faults) throws while *resolving* the node,
  // before the actor ever emits its own `node_update running`. That's a
  // legitimate "failed" terminal with real evidence — the terminal
  // `job_update` itself carries a non-empty `error` string explaining why —
  // just not evidence `hasNodeError` (a `node_update` scan) can see. Gated on
  // `terminalStatus === "failed"` already being the actual value, so this can
  // only ever confirm an already-"failed" terminal as expected — it can never
  // flip what a "completed"/"cancelled"/"suspended" run expects.
  const hasJobLevelError =
    terminalStatus === "failed" &&
    typeof terminalMessage["error"] === "string" &&
    (terminalMessage["error"] as string).trim().length > 0;

  let expected: string;
  if (hasCancelRequest) expected = "cancelled";
  else if (hasSuspendedNode) expected = "suspended";
  else if (hasNodeError || hasJobLevelError) expected = "failed";
  else expected = "completed";

  const actual = canonicalTerminalStatus(terminalStatus);
  if (actual !== expected) {
    violations.push({
      invariant: "terminal-uniqueness.precedence",
      message:
        `terminal job_update status is "${terminalStatus}" but precedence ` +
        `(${TERMINAL_PRECEDENCE.join(" > ")}) expects "${expected}" given ` +
        `the record's evidence (cancelRequest=${hasCancelRequest}, ` +
        `suspendedNode=${hasSuspendedNode}, nodeError=${hasNodeError})`,
      frameIndex: firstTerminal,
      details: { actual: terminalStatus, expected, hasCancelRequest, hasSuspendedNode, hasNodeError }
    });
  }

  return violations;
}
