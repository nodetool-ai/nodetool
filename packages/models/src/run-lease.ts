/**
 * RunLease model -- TTL-based distributed lock per workflow run.
 *
 * Port of Python's `nodetool.models.run_lease`.
 */

import { eq, lt } from "drizzle-orm";
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

  /** Acquire a lease on a run. Returns the lease if acquired, null if already held.
   *  Uses an atomic transaction to prevent TOCTOU race conditions. */
  static async acquire(
    runId: string,
    workerId: string,
    ttlSeconds = 60
  ): Promise<RunLease | null> {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    const nowIso = now.toISOString();
    const expiresIso = expires.toISOString();

    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(runLeases)
        .where(eq(runLeases.run_id, runId))
        .limit(1);

      if (existing) {
        if (new Date(existing.expires_at) < now) {
          // Expired lease -- reclaim it
          await tx
            .update(runLeases)
            .set({
              worker_id: workerId,
              acquired_at: nowIso,
              expires_at: expiresIso
            })
            .where(eq(runLeases.run_id, runId));
          return new RunLease({
            ...existing,
            worker_id: workerId,
            acquired_at: nowIso,
            expires_at: expiresIso
          } as Record<string, unknown>);
        }
        // Lease still held by another worker
        return null;
      }

      // No existing lease -- create one
      await tx.insert(runLeases).values({
        run_id: runId,
        worker_id: workerId,
        acquired_at: nowIso,
        expires_at: expiresIso
      });

      return new RunLease({
        run_id: runId,
        worker_id: workerId,
        acquired_at: nowIso,
        expires_at: expiresIso
      } as Record<string, unknown>);
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

  isExpired(): boolean {
    return new Date(this.expires_at) < new Date();
  }

  isHeldBy(workerId: string): boolean {
    return this.worker_id === workerId && !this.isExpired();
  }

  /** Remove all expired leases from the database. Returns count removed. */
  static async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();
    const db = getDb();
    const expired = await db
      .select()
      .from(runLeases)
      .where(lt(runLeases.expires_at, now));

    for (const row of expired) {
      const lease = new RunLease(row as Record<string, unknown>);
      await lease.delete();
    }

    return expired.length;
  }
}
