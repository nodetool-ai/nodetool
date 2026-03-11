/**
 * Job model -- tracks workflow execution state.
 *
 * Port of Python's `nodetool.models.job`.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

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

// ── Schema ───────────────────────────────────────────────────────────

const JOB_SCHEMA: TableSchema = {
  table_name: "nodetool_jobs",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    job_type: { type: "string" },
    workflow_id: { type: "string" },
    status: { type: "string" },
    name: { type: "string", optional: true },
    graph: { type: "json", optional: true },
    params: { type: "json", optional: true },
    worker_id: { type: "string", optional: true },
    heartbeat_at: { type: "datetime", optional: true },
    started_at: { type: "datetime", optional: true },
    finished_at: { type: "datetime", optional: true },
    completed_at: { type: "datetime", optional: true },
    failed_at: { type: "datetime", optional: true },
    error: { type: "string", optional: true },
    error_message: { type: "string", optional: true },
    cost: { type: "number", optional: true },
    logs: { type: "json", optional: true },
    retry_count: { type: "number" },
    max_retries: { type: "number" },
    version: { type: "number" },
    suspended_node_id: { type: "string", optional: true },
    suspension_reason: { type: "string", optional: true },
    suspension_state_json: { type: "json", optional: true },
    suspension_metadata_json: { type: "json", optional: true },
    execution_strategy: { type: "string", optional: true },
    execution_id: { type: "string", optional: true },
    metadata_json: { type: "json", optional: true },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const JOB_INDEXES: IndexSpec[] = [
  { name: "idx_jobs_status", columns: ["status"], unique: false },
  { name: "idx_jobs_updated_at", columns: ["updated_at"], unique: false },
  { name: "idx_jobs_worker_id", columns: ["worker_id"], unique: false },
  { name: "idx_jobs_heartbeat_at", columns: ["heartbeat_at"], unique: false },
  {
    name: "idx_jobs_recovery",
    columns: ["status", "heartbeat_at"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class Job extends DBModel {
  static override schema = JOB_SCHEMA;
  static override indexes = JOB_INDEXES;

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

  constructor(data: Row) {
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
    metadata?: Record<string, unknown>,
  ): void {
    this.status = "suspended";
    this.suspended_node_id = nodeId;
    this.suspension_reason = reason;
    if (state) this.suspension_state_json = state;
    if (metadata) this.suspension_metadata_json = metadata;
  }

  markResumed(): void {
    this.status = "running";
    // Keep suspension fields for audit trail (matches Python)
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
      this.status,
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
    expectedVersion: number,
  ): Promise<boolean> {
    if (this.version !== expectedVersion) return false;
    this.worker_id = workerId;
    this.heartbeat_at = new Date().toISOString();
    try {
      await this.save();
      return true;
    } catch {
      return false;
    }
  }

  // ── Static queries ───────────────────────────────────────────────

  /** Find a job by id, scoped to the user. */
  static async find(
    userId: string,
    jobId: string,
  ): Promise<Job | null> {
    const job = (await (Job as unknown as ModelClass<Job>).get(jobId)) as Job | null;
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
    } = {},
  ): Promise<[Job[], string]> {
    const { limit = 50, status, workflowId } = opts;
    let cond = field("user_id").equals(userId);
    if (status) cond = cond.and(field("status").equals(status));
    if (workflowId) cond = cond.and(field("workflow_id").equals(workflowId));

    return (Job as unknown as ModelClass<Job>).query({
      condition: cond,
      orderBy: "updated_at",
      reverse: true,
      limit,
    });
  }
}
