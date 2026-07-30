/**
 * Shared shape for §6 invariant modules (docs/RELIABILITY_ARCHITECTURE.md §6,
 * §12). Each module in this directory is a pure `(record: RunRecord) =>
 * Violation[]` — no IO, no driver dependency, so the same check runs
 * identically in CI, in `nodetool reliability`, and over a `RunRecord`
 * recovered from a user's field debug bundle.
 */
import type { RunRecord } from "../record.js";

export interface Violation {
  /** Stable id for the specific rule that failed, e.g.
   * "lifecycle.unmatched-running" or "protocol-validity.schema-mismatch" —
   * `<module>.<rule>` so a report can group by module. */
  invariant: string;
  /** Human-readable explanation, safe to print directly in a report. */
  message: string;
  /** Index into `record.frames`, when the violation is anchored to one frame. */
  frameIndex?: number;
  /** Node id the violation concerns, when applicable. */
  nodeId?: string;
  /** Free-form extra context (offending values, counts, schema issues, …). */
  details?: Record<string, unknown>;
}

/** The shape every invariant module exports. */
export type InvariantCheck = (record: RunRecord) => Violation[];
