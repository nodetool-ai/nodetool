/**
 * Job model -- tracks workflow execution state.
 *
 * Port of Python's `nodetool.models.job`.
 */

import { eq, and, desc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { jobs } from "./schema/jobs.js";

// ── Types ────────────────────────────────────────────────────────────

export type JobStatus =
  | "scheduled"
  | "running"
  | "suspended"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "recovering";

export class Job extends DBModel {
  static override table = jobs;

  declare id: string;
  declare user_id: string;
  declare job_type: string;
  declare workflow_id: string;
  declare status: JobStatus;
  declare name: string;
  declare graph: Record<string, unknown> | null;
  declare params: Record<string, unknown> | null;
  declare worker_id: string | null;
  declare heartbeat_at: string | null;
  declare started_at: string | null;
  declare finished_at: string | null;
  declare completed_at: string | null;
  declare failed_at: string | null;
  declare error: string | null;
  declare error_message: string | null;
  declare cost: number | null;
  declare logs: Record<string, unknown>[] | null;
  declare retry_count: number;
  declare max_retries: number;
  declare version: number;
  declare suspended_node_id: string | null;
  declare suspension_reason: string | null;
  declare suspension_state_json: Record<string, unknown> | null;
  declare suspension_metadata_json: Record<string, unknown> | null;
  declare execution_strategy: string | null;
  declare execution_id: string | null;
  declare metadata_json: Record<string, unknown> | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.job_type ??= "";
    this.status ??= "scheduled";
    this.retry_count ??= 0;
    this.max_retries ??= 3;
    this.version ??= 0;
    this.created_at ??= now;
    this.updated_at ??= now;
    this.graph ??= null;
    this.params ??= null;
    this.worker_id ??= null;
    this.heartbeat_at ??= null;
    this.started_at ??= null;
    this.finished_at ??= null;
    this.completed_at ??= null;
    this.failed_at ??= null;
    this.error ??= null;
    this.error_message ??= null;
    this.cost ??= null;
    this.logs ??= null;
    this.suspended_node_id ??= null;
    this.suspension_reason ??= null;
    this.suspension_state_json ??= null;
    this.suspension_metadata_json ??= null;
    this.execution_strategy ??= null;
    this.execution_id ??= null;
    this.metadata_json ??= null;
    this.name ??= "";
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    this.version += 1;
  }

  // ── State transitions ────────────────────────────────────────────

  markRunning(workerId?: string): void {
    this.status = "running";
    this.started_at = new Date().toISOString();
    if (workerId) this.worker_id = workerId;
  }

  markCompleted(): void {
    this.status = "completed";
    this.completed_at = new Date().toISOString();
    this.finished_at = new Date().toISOString();
  }

  markFailed(error: string): void {
    this.status = "failed";
    this.error = error;
    this.error_message = error;
    this.failed_at = new Date().toISOString();
    this.finished_at = new Date().toISOString();
  }

  markCancelled(): void {
    this.status = "cancelled";
    this.finished_at = new Date().toISOString();
  }

  markSuspended(
    nodeId: string,
    reason: string,
    state?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): void {
    this.status = "suspended";
    this.suspended_node_id = nodeId;
    this.suspension_reason = reason;
    if (state) this.suspension_state_json = state;
    if (metadata) this.suspension_metadata_json = metadata;
  }

  markResumed(): void {
    this.status = "running";
  }

  markPaused(): void {
    this.status = "paused";
  }

  markRecovering(): void {
    this.status = "recovering";
  }

  // ── Ownership / heartbeat ─────────────────────────────────────────

  async claim(workerId: string): Promise<void> {
    this.worker_id = workerId;
    this.heartbeat_at = new Date().toISOString();
    await this.save();
  }

  async release(): Promise<void> {
    this.worker_id = null;
    this.heartbeat_at = null;
    await this.save();
  }

  updateHeartbeat(): void {
    this.heartbeat_at = new Date().toISOString();
  }

  incrementRetry(): void {
    this.retry_count += 1;
  }

  isStale(thresholdMs: number): boolean {
    if (!this.heartbeat_at) return true;
    const elapsed = Date.now() - new Date(this.heartbeat_at).getTime();
    return elapsed > thresholdMs;
  }

  isOwnedBy(workerId: string): boolean {
    return this.worker_id === workerId;
  }

  isResumable(): boolean {
    return ["running", "suspended", "paused", "recovering", "failed"].includes(
      this.status
    );
  }

  isPaused(): boolean {
    return this.status === "paused";
  }

  isSuspended(): boolean {
    return this.status === "suspended";
  }

  isComplete(): boolean {
    return ["completed", "failed", "cancelled"].includes(this.status);
  }

  async acquireWithCas(
    workerId: string,
    expectedVersion: number
  ): Promise<boolean> {
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const newVersion = expectedVersion + 1;
      // Atomic CAS: only update if the database row still has the expected version.
      const updated = await db
        .update(jobs)
        .set({
          worker_id: workerId,
          heartbeat_at: now,
          version: newVersion,
          updated_at: now
        })
        .where(and(eq(jobs.id, this.id), eq(jobs.version, expectedVersion)))
        .returning({ id: jobs.id });
      if (updated.length === 0) return false;
      // Sync in-memory state
      this.worker_id = workerId;
      this.heartbeat_at = now;
      this.version = newVersion;
      this.updated_at = now;
      return true;
    } catch {
      return false;
    }
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a job by id, scoped to the user. */
  static async find(userId: string, jobId: string): Promise<Job | null> {
    const job = await Job.get<Job>(jobId);
    if (!job || job.user_id !== userId) return null;
    return job;
  }

  static async paginate(
    userId: string,
    opts: {
      cursor?: string;
      limit?: number;
      status?: JobStatus;
      workflowId?: string;
    } = {}
  ): Promise<[Job[], string]> {
    const { limit = 50, status, workflowId } = opts;
    const db = getDb();

    const conditions = [eq(jobs.user_id, userId)];
    if (status) conditions.push(eq(jobs.status, status));
    if (workflowId) conditions.push(eq(jobs.workflow_id, workflowId));

    const rows = await db
      .select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.updated_at))
      .limit(limit + 1);

    const items = rows.map((r: Record<string, unknown>) => new Job(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }
}
