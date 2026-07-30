/**
 * Lifecycle invariants (docs/RELIABILITY_ARCHITECTURE.md §6 "Lifecycle").
 *
 * - Every `node_update running` is eventually paired with exactly one
 *   terminal `node_update` (`completed`/`error`/`cancelled`/`suspended`) for
 *   that invocation — a node can run more than once in a record (loops,
 *   re-entrant control events), so pairing is tracked as a per-node stack,
 *   not a single flag.
 * - No node is left `running` after the `job_update` terminal.
 *
 * `terminal-uniqueness.ts` covers the job-level "exactly one terminal
 * `job_update`" and precedence rules — kept separate so each §6 bullet has
 * its own attributable module, per the task's "may fold into lifecycle if
 * cleaner, but keep the checks individually attributable" note.
 */
import type { RunRecord } from "../record.js";
import type { Violation } from "./types.js";
import { NODE_TERMINAL_STATUSES, JOB_TERMINAL_STATUSES, asString } from "./status-sets.js";

export function checkLifecycle(record: RunRecord): Violation[] {
  const violations: Violation[] = [];
  /** node id -> stack of frame indices of unmatched "running" node_updates. */
  const runningStack = new Map<string, number[]>();
  let jobTerminalIndex: number | undefined;

  record.frames.forEach((frame, index) => {
    const message = frame.message as Record<string, unknown>;
    const type = asString(message, "type");

    if (type === "job_update") {
      const status = asString(message, "status");
      if (
        jobTerminalIndex === undefined &&
        status !== undefined &&
        JOB_TERMINAL_STATUSES.has(status)
      ) {
        jobTerminalIndex = index;
      }
      return;
    }

    if (type !== "node_update") return;
    const nodeId = asString(message, "node_id");
    const status = asString(message, "status");
    if (!nodeId || !status) return;

    if (status === "running") {
      const stack = runningStack.get(nodeId) ?? [];
      stack.push(index);
      runningStack.set(nodeId, stack);
      return;
    }

    if (NODE_TERMINAL_STATUSES.has(status)) {
      const stack = runningStack.get(nodeId);
      if (!stack || stack.length === 0) {
        violations.push({
          invariant: "lifecycle.terminal-without-running",
          message:
            `node_update terminal ("${status}") for node "${nodeId}" has no ` +
            "matching running node_update for its invocation",
          frameIndex: index,
          nodeId
        });
        return;
      }
      stack.pop();
    }
  });

  // Any invocation still unmatched by the end of the record.
  for (const [nodeId, stack] of runningStack) {
    if (stack.length === 0) continue;
    violations.push({
      invariant: "lifecycle.unmatched-running",
      message:
        `node "${nodeId}" has ${stack.length} running node_update(s) with ` +
        "no terminal pairing by the end of the record",
      nodeId,
      frameIndex: stack[stack.length - 1],
      details: { unmatchedCount: stack.length, frameIndices: stack }
    });
  }

  // "No node left running after job terminal": replay node_update
  // running/terminal pairing only up to the terminal job_update frame, and
  // flag any node whose running count is still open at that point.
  if (jobTerminalIndex !== undefined) {
    const openAtTerminal = new Map<string, number>();
    for (let i = 0; i <= jobTerminalIndex; i++) {
      const message = record.frames[i].message as Record<string, unknown>;
      if (asString(message, "type") !== "node_update") continue;
      const nodeId = asString(message, "node_id");
      const status = asString(message, "status");
      if (!nodeId || !status) continue;
      if (status === "running") {
        openAtTerminal.set(nodeId, (openAtTerminal.get(nodeId) ?? 0) + 1);
      } else if (NODE_TERMINAL_STATUSES.has(status)) {
        const current = openAtTerminal.get(nodeId) ?? 0;
        if (current > 0) openAtTerminal.set(nodeId, current - 1);
      }
    }
    for (const [nodeId, openCount] of openAtTerminal) {
      if (openCount <= 0) continue;
      violations.push({
        invariant: "lifecycle.running-after-job-terminal",
        message: `node "${nodeId}" is still "running" at the job_update terminal (frame ${jobTerminalIndex})`,
        nodeId,
        frameIndex: jobTerminalIndex,
        details: { openCount }
      });
    }
  }

  return violations;
}
