/**
 * RunLease model -- TTL-based distributed lock per workflow run.
 *
 * Port of Python's `nodetool.models.run_lease`.
 *
 * Leases prevent multiple workers from processing the same run concurrently.
 * They automatically expire after a TTL, allowing recovery if a worker crashes.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

// ── Schema ───────────────────────────────────────────────────────────

const RUN_LEASE_SCHEMA: TableSchema = {
  table_name: "run_leases",
  primary_key: "run_id",
  columns: {
    run_id: { type: "string" },
    worker_id: { type: "string" },
    acquired_at: { type: "datetime" },
    expires_at: { type: "datetime" },
  },
};

const RUN_LEASE_INDEXES: IndexSpec[] = [
  {
    name: "idx_run_leases_expires",
    columns: ["expires_at"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class RunLease extends DBModel {
  static override schema = RUN_LEASE_SCHEMA;
  static override indexes = RUN_LEASE_INDEXES;

  declare run_id: string;
  declare worker_id: string;
  declare acquired_at: string;
  declare expires_at: string;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.acquired_at ??= now;
  }

  // ── Static methods ────────────────────────────────────────────────

  /**
   * Acquire a lease on a run.
   * Returns the lease if acquired, null if already held by another worker.
   */
  static async acquire(
    runId: string,
    workerId: string,
    ttlSeconds = 60,
  ): Promise<RunLease | null> {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);

    const existing = await (
      RunLease as unknown as ModelClass<RunLease>
    ).get(runId);

    if (existing) {
      if (new Date(existing.expires_at) < now) {
        // Expired -- take over
        existing.worker_id = workerId;
        existing.acquired_at = now.toISOString();
        existing.expires_at = expires.toISOString();
        await existing.save();
        return existing;
      }
      // Still held by another worker
      return null;
    }

    // No existing lease -- create new one
    return (RunLease as unknown as ModelClass<RunLease>).create({
      run_id: runId,
      worker_id: workerId,
      acquired_at: now.toISOString(),
      expires_at: expires.toISOString(),
    });
  }

  /** Renew this lease to extend its expiration time. */
  async renew(ttlSeconds = 60): Promise<void> {
    const expires = new Date(Date.now() + ttlSeconds * 1000);
    this.expires_at = expires.toISOString();
    await this.save();
  }

  /** Release this lease, allowing other workers to acquire it. */
  async release(): Promise<void> {
    await this.delete();
  }

  /** Check if this lease has expired. */
  isExpired(): boolean {
    return new Date(this.expires_at) < new Date();
  }

  /** Check if this lease is held by a specific worker (and not expired). */
  isHeldBy(workerId: string): boolean {
    return this.worker_id === workerId && !this.isExpired();
  }

  /** Remove all expired leases from the database. Returns count removed. */
  static async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const [expired] = await (
      RunLease as unknown as ModelClass<RunLease>
    ).query({
      condition: field("expires_at").lessThan(now),
      limit: 1000,
    });

    for (const lease of expired) {
      await lease.delete();
    }

    return expired.length;
  }
}
