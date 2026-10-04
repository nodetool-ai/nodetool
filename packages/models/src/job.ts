/**
 * Job model -- tracks workflow execution state.
 *
 * Port of Python's `nodetool.models.job`.
 */

import { eq, and, desc, lt, inArray, notInArray, like } from "drizzle-orm";
import { isShortResourceId } from "@nodetool-ai/protocol";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb, getDatabase } from "./db.js";
import { eraseRunTraceParentForModelDeletion } from "./run-trace.js";
import { jobs } from "./schema/jobs.js";

// ── Types ────────────────────────────────────────────────────────────

export type JobStatus =
  | "scheduled"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export class Job extends DBModel {
  static override table = jobs;

  declare id: string;
  declare user_id: string;
  declare job_type: string;
  declare workflow_id: string;
  declare project_id: string;
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
  declare execution_strategy: string | null;
  declare execution_id: string | null;
  /**
   * The server instance executing this run, when the deployment has more than
   * one (see `getInstanceId` in the websocket package). Null means
   * single-machine: nothing routes by it.
   */
  declare runner_instance: string | null;
  declare metadata_json: Record<string, unknown> | null;
  declare has_run_trace: number;
  declare created_at: string;
  declare updated_at: string;

  override async delete(): Promise<void> {
    await eraseRunTraceParentForModelDeletion({ kind: "job", id: this.id });
    await super.delete();
    await eraseRunTraceParentForModelDeletion({ kind: "job", id: this.id });
  }

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.job_type ??= "";
    this.status ??= "scheduled";
    this.project_id ??= "default";
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
    this.execution_strategy ??= null;
    this.execution_id ??= null;
    this.runner_instance ??= null;
    this.metadata_json ??= null;
    this.has_run_trace ??= 0;
    this.name ??= "";
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    this.version += 1;
  }

  override toRow(): ReturnType<DBModel["toRow"]> {
    const row = super.toRow();
    // Trace registration owns this monotonic marker. A stale job finalizer cannot reset it.
    delete row["has_run_trace"];
    return row;
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

  /**
   * What the run produced, as the run service stored it when the job settled
   * (`metadata_json.outputs`), or null for a job that has not finished — or
   * one that ran before outputs were persisted at all. The jobs table has no
   * outputs column; `metadata_json` is where a run's answer lives, and this
   * is the one reader, so every surface reports the same thing.
   */
  runOutputs(): Record<string, unknown> | null {
    const outputs = this.metadata_json?.["outputs"];
    return outputs !== null &&
      typeof outputs === "object" &&
      !Array.isArray(outputs)
      ? (outputs as Record<string, unknown>)
      : null;
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
      this.worker_id = workerId;
      this.heartbeat_at = now;
      this.version = newVersion;
      this.updated_at = now;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The latest `node_progress` this run reported, or null.
   *
   * Lives under `metadata_json.progress` rather than a column: it is written
   * while the run is in flight, read by `get_job`, and thrown away once the
   * run settles, which is what `metadata_json` is for.
   */
  progressRecord(): Record<string, unknown> | null {
    const progress = this.metadata_json?.["progress"];
    return progress !== null &&
      typeof progress === "object" &&
      !Array.isArray(progress)
      ? (progress as Record<string, unknown>)
      : null;
  }

  /**
   * Record in-flight progress without touching anything else on the row.
   *
   * The same reasoning as {@link markCancelledIfActive}: `save()` would upsert
   * a full row built from a snapshot, so a progress write landing beside a
   * finishing run would resurrect it. This reads the row's own metadata and
   * writes the merge back only while the run is still active, so a late
   * message after the terminal write changes nothing.
   */
  static async recordProgressIfActive(
    jobId: string,
    progress: Record<string, unknown>
  ): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select({ metadata_json: jobs.metadata_json })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const current = rows[0]?.metadata_json;
    const merged: Record<string, unknown> =
      current !== null && typeof current === "object" && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};
    merged["progress"] = progress;
    const updated = await db
      .update(jobs)
      .set({ metadata_json: merged, updated_at: new Date().toISOString() })
      .where(
        and(
          eq(jobs.id, jobId),
          notInArray(jobs.status, ["completed", "failed", "cancelled"])
        )
      )
      .returning({ id: jobs.id });
    return updated.length > 0;
  }

  // ── Static queries ───────────────────────────────────────────────

  /**
   * Fail every run a previous process left in flight.
   *
   * A run lives in the process that started it, so a `scheduled`, `queued` or
   * `running` row created before this process started has nothing left that
   * could finish it. Without this the row advertises a live run forever: the
   * editor reattaches to it on every open and the jobs list shows it running.
   *
   * `instanceId` scopes the sweep the same way `runner_instance` scopes
   * ownership. Null means a single-machine deployment, where every such row
   * belonged to a dead process. With an id, only rows this instance stamped
   * are swept: an unstamped or foreign row may belong to a live peer.
   */
  static async sweepInterrupted(
    createdBeforeIso: string,
    instanceId: string | null
  ): Promise<Job[]> {
    const db = getDb();
    const now = new Date().toISOString();
    const error = "Run was interrupted because the server restarted.";
    const rows = await db
      .update(jobs)
      .set({
        status: "failed",
        error,
        error_message: error,
        failed_at: now,
        finished_at: now,
        updated_at: now
      })
      .where(
        and(
          inArray(jobs.status, ["scheduled", "queued", "running"]),
          lt(jobs.created_at, createdBeforeIso),
          ...(instanceId ? [eq(jobs.runner_instance, instanceId)] : [])
        )
      )
      .returning();
    return rows.map((r: Record<string, unknown>) => new Job(r));
  }

  /**
   * Cancel a run without reading it first.
   *
   * A cancel arriving on an instance that does not own the run races the
   * owner's own terminal write. Loading the row, mutating it and calling
   * `save()` would send a full-row upsert built from a snapshot taken before
   * that race — resurrecting a `completed` job as `cancelled` and overwriting
   * the cost and timestamps the owner had just written. This touches only the
   * two columns a cancel owns, and only while the row is still active.
   *
   * Returns whether a row actually changed: false means the run was already
   * terminal (or is not this user's), which is the caller's cue that there was
   * nothing to cancel.
   */
  static async markCancelledIfActive(
    jobId: string,
    userId: string
  ): Promise<boolean> {
    const db = getDb();
    const now = new Date().toISOString();
    const updated = await db
      .update(jobs)
      .set({ status: "cancelled", finished_at: now, updated_at: now })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.user_id, userId),
          notInArray(jobs.status, ["completed", "failed", "cancelled"])
        )
      )
      .returning({ id: jobs.id });
    return updated.length > 0;
  }

  /**
   * Which of these ids are now cancelled. The poller's one query per tick —
   * indexed on the primary key, and bounded by how many runs an instance is
   * actually executing.
   */
  static async cancelledAmong(jobIds: string[]): Promise<string[]> {
    if (jobIds.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(inArray(jobs.id, jobIds), eq(jobs.status, "cancelled")));
    return rows.map((row: { id: string }) => row.id);
  }

  /** Find a job by id, scoped to the user. */
  static async find(userId: string, jobId: string): Promise<Job | null> {
    const connection = getDatabase();
    const table = connection.schema.jobs;
    const exactWhere = and(eq(table.user_id, userId), eq(table.id, jobId));
    const exactRows = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.jobs).where(exactWhere).limit(1)
      : await connection.db.select().from(connection.schema.jobs).where(exactWhere).limit(1);
    if (exactRows[0]) { return new Job(exactRows[0]); }
    if (!isShortResourceId(jobId)) { return null; }
    const prefixWhere = and(eq(table.user_id, userId), like(table.id, `${jobId}%`));
    const matches = connection.dialect === "sqlite"
      ? await connection.db.select().from(connection.schema.jobs).where(prefixWhere).limit(2)
      : await connection.db.select().from(connection.schema.jobs).where(prefixWhere).limit(2);
    if (matches.length > 1) {
      throw new Error(`short id "${jobId}" matches more than one row; use the full id`);
    }
    return matches[0] ? new Job(matches[0]) : null;
  }

  static async paginate(
    userId: string,
    opts: {
      cursor?: string;
      startKey?: string;
      limit?: number;
      status?: JobStatus;
      workflowId?: string;
      projectId?: string;
    } = {}
  ): Promise<[Job[], string]> {
    const { limit = 50, status, workflowId, projectId } = opts;
    const startKey = opts.startKey ?? opts.cursor;
    const db = getDb();

    const conditions = [eq(jobs.user_id, userId)];
    if (status) conditions.push(eq(jobs.status, status));
    if (workflowId) conditions.push(eq(jobs.workflow_id, workflowId));
    if (projectId !== undefined)
      conditions.push(eq(jobs.project_id, projectId));
    if (startKey) {
      const cursorRow = await Job.get<Job>(startKey);
      if (cursorRow && cursorRow.user_id === userId) {
        conditions.push(lt(jobs.updated_at, cursorRow.updated_at));
      }
    }

    const rows = await db
      .select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.updated_at))
      .limit(limit + 1);

    const items = rows.map((r: Record<string, unknown>) => new Job(r));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  static async listByProject(
    userId: string,
    projectId: string
  ): Promise<Job[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.user_id, userId), eq(jobs.project_id, projectId)));
    return rows.map((row) => new Job(row));
  }
}
