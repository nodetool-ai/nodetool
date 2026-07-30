/**
 * Leak-accounting invariants (docs/RELIABILITY_ARCHITECTURE.md §6 "Cleanup
 * and leaks"): after the run, zero live actors, zero pending control
 * responses, zero timers beyond the trigger timeout, zero pending Python
 * bridge requests, and WS slot accounting (`activeJobs`/`startingJobs`) back
 * to empty; and no growth in these counters across repeated journey
 * iterations (leak journeys run N=20 and compare).
 *
 * Operates on `RunRecord.resourceCounters` (additive over C1's shape, see
 * `record.ts`) — a driver that doesn't instrument these counters produces no
 * snapshots, and this module reports no violations rather than treating
 * absence itself as a leak: it can only assert what a driver actually
 * measured.
 */
import type { ResourceCounterSnapshot, RunRecord } from "../record.js";
import type { Violation } from "./types.js";

const COUNTER_FIELDS = [
  "liveActors",
  "pendingControlResponses",
  "pendingTimers",
  "pythonBridgePendingRequests",
  "activeJobs",
  "startingJobs"
] as const satisfies readonly (keyof ResourceCounterSnapshot)[];

type CounterField = (typeof COUNTER_FIELDS)[number];

export function checkLeaks(record: RunRecord): Violation[] {
  const snapshots = record.resourceCounters;
  if (!snapshots || snapshots.length === 0) return [];

  const violations: Violation[] = [];
  const afterSnapshots = snapshots.filter((s) => s.at === "after");

  afterSnapshots.forEach((snapshot, snapshotIndex) => {
    for (const field of COUNTER_FIELDS) {
      const value = snapshot[field];
      if (value !== 0) {
        violations.push({
          invariant: `leaks.${field}-nonzero`,
          message: `resource counter "${field}" is ${value} (expected 0) in post-run snapshot #${snapshotIndex}`,
          details: { field, value, snapshotIndex }
        });
      }
    }
  });

  // "No growth in open handles across repeated journey iterations": each
  // field's post-run value must never exceed the previous iteration's.
  for (const field of COUNTER_FIELDS) {
    for (let i = 1; i < afterSnapshots.length; i++) {
      const previous = afterSnapshots[i - 1][field];
      const current = afterSnapshots[i][field];
      if (current > previous) {
        violations.push({
          invariant: `leaks.${field}-growth`,
          message:
            `resource counter "${field}" grew from ${previous} to ${current} ` +
            `between post-run snapshots #${i - 1} and #${i}`,
          details: { field, previous, current, snapshotIndex: i }
        });
      }
    }
  }

  return violations;
}

export type { CounterField };
