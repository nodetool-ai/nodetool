/**
 * RunLease model -- TTL-based distributed lock per workflow run.
 *
 * Port of Python's `nodetool.models.run_lease`.
 */

import { lt } from "drizzle-orm";
import { DBModel } from "./base-model.js";
import { getDb } from "./db.js";
import { runLeases } from "./schema/run-leases.js";

export class RunLease extends DBModel {
  static override table = runLeases;
  static override primaryKey = "run_id";

  declare run_id: string;
  declare worker_id: string;
  declare acquired_at: string;
  declare expires_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.acquired_at ??= new Date().toISOString();
  }

  /** Acquire a lease on a run. Returns the lease if acquired, null if already held. */
  static async acquire(
    runId: string,
    workerId: string,
    ttlSeconds = 60,
  ): Promise<RunLease | null> {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);

    const existing = await RunLease.get<RunLease>(runId);

    if (existing) {
      if (new Date(existing.expires_at) < now) {
        existing.worker_id = workerId;
        existing.acquired_at = now.toISOString();
        existing.expires_at = expires.toISOString();
        await existing.save();
        return existing;
      }
      return null;
    }

    return RunLease.create<RunLease>({
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
    const db = getDb();
    const expired = db.select().from(runLeases)
      .where(lt(runLeases.expires_at, now))
      .all();

    for (const row of expired) {
      const lease = new RunLease(row as Record<string, unknown>);
      await lease.delete();
    }

    return expired.length;
  }
}
