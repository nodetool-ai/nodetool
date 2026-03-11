/**
 * RunNodeState model -- per-node execution state for workflow runs.
 *
 * Port of Python's `nodetool.models.run_node_state`.
 *
 * This is the authoritative source of truth for node execution state.
 * Recovery and scheduling read directly from this model.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";

// ── Types ────────────────────────────────────────────────────────────

export type NodeStatus =
  | "idle"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "suspended";

// ── Schema ───────────────────────────────────────────────────────────

const RUN_NODE_STATE_SCHEMA: TableSchema = {
  table_name: "run_node_state",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    run_id: { type: "string" },
    node_id: { type: "string" },
    status: { type: "string" },
    attempt: { type: "number" },
    scheduled_at: { type: "datetime", optional: true },
    started_at: { type: "datetime", optional: true },
    completed_at: { type: "datetime", optional: true },
    failed_at: { type: "datetime", optional: true },
    suspended_at: { type: "datetime", optional: true },
    updated_at: { type: "datetime" },
    last_error: { type: "string", optional: true },
    retryable: { type: "boolean" },
    suspension_reason: { type: "string", optional: true },
    resume_state_json: { type: "json", optional: true },
    outputs_json: { type: "json", optional: true },
  },
};

const RUN_NODE_STATE_INDEXES: IndexSpec[] = [
  {
    name: "idx_run_node_state_run_status",
    columns: ["run_id", "status"],
    unique: false,
  },
  {
    name: "idx_run_node_state_run_node",
    columns: ["run_id", "node_id"],
    unique: true,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class RunNodeState extends DBModel {
  static override schema = RUN_NODE_STATE_SCHEMA;
  static override indexes = RUN_NODE_STATE_INDEXES;

  declare id: string;
  declare run_id: string;
  declare node_id: string;
  declare status: NodeStatus;
  declare attempt: number;
  declare scheduled_at: string | null;
  declare started_at: string | null;
  declare completed_at: string | null;
  declare failed_at: string | null;
  declare suspended_at: string | null;
  declare updated_at: string;
  declare last_error: string | null;
  declare retryable: boolean;
  declare suspension_reason: string | null;
  declare resume_state_json: Record<string, unknown> | null;
  declare outputs_json: Record<string, unknown> | null;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= "";
    this.status ??= "idle";
    this.attempt ??= 1;
    this.scheduled_at ??= null;
    this.started_at ??= null;
    this.completed_at ??= null;
    this.failed_at ??= null;
    this.suspended_at ??= null;
    this.updated_at ??= now;
    this.last_error ??= null;
    this.suspension_reason ??= null;
    this.resume_state_json ??= null;
    this.outputs_json ??= null;

    // SQLite stores booleans as 0/1
    if (typeof this.retryable === "number") {
      this.retryable = this.retryable !== 0;
    }
    this.retryable ??= false;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
    if (!this.id) {
      this.id = `${this.run_id}::${this.node_id}`;
    }
  }

  // ── Static lookups ────────────────────────────────────────────────

  /** Get state for a specific node in a run. */
  static async getNodeState(
    runId: string,
    nodeId: string,
  ): Promise<RunNodeState | null> {
    const cond = field("run_id")
      .equals(runId)
      .and(field("node_id").equals(nodeId));

    const [results] = await (
      RunNodeState as unknown as ModelClass<RunNodeState>
    ).query({
      condition: cond,
      limit: 1,
    });

    return results.length > 0 ? results[0] : null;
  }

  /** Get existing node state or create an idle one. */
  static async getOrCreate(
    runId: string,
    nodeId: string,
  ): Promise<RunNodeState> {
    const existing = await RunNodeState.getNodeState(runId, nodeId);
    if (existing) return existing;

    return (RunNodeState as unknown as ModelClass<RunNodeState>).create({
      run_id: runId,
      node_id: nodeId,
      status: "idle",
      attempt: 1,
    });
  }

  /** Get all incomplete (scheduled or running) nodes for a run. */
  static async getIncompleteNodes(
    runId: string,
  ): Promise<RunNodeState[]> {
    const cond = field("run_id")
      .equals(runId)
      .and(field("status").inList(["scheduled", "running"]));

    const [results] = await (
      RunNodeState as unknown as ModelClass<RunNodeState>
    ).query({
      condition: cond,
      limit: 10000,
    });

    return results;
  }

  /** Get all suspended nodes for a run. */
  static async getSuspendedNodes(
    runId: string,
  ): Promise<RunNodeState[]> {
    const cond = field("run_id")
      .equals(runId)
      .and(field("status").equals("suspended"));

    const [results] = await (
      RunNodeState as unknown as ModelClass<RunNodeState>
    ).query({
      condition: cond,
      limit: 10000,
    });

    return results;
  }

  // ── State transitions ─────────────────────────────────────────────

  async markScheduled(attempt?: number): Promise<void> {
    this.status = "scheduled";
    if (attempt !== undefined) {
      this.attempt = attempt;
    } else if (this.started_at !== null) {
      this.attempt += 1;
    }
    this.scheduled_at = new Date().toISOString();
    await this.save();
  }

  async markRunning(): Promise<void> {
    this.status = "running";
    this.started_at = new Date().toISOString();
    await this.save();
  }

  async markCompleted(
    outputs?: Record<string, unknown>,
  ): Promise<void> {
    this.status = "completed";
    this.completed_at = new Date().toISOString();
    if (outputs !== undefined) {
      this.outputs_json = outputs;
    }
    await this.save();
  }

  async markFailed(error: string, retryable = false): Promise<void> {
    this.status = "failed";
    this.failed_at = new Date().toISOString();
    this.last_error = error;
    this.retryable = retryable;
    await this.save();
  }

  async markSuspended(
    reason: string,
    state: Record<string, unknown>,
  ): Promise<void> {
    this.status = "suspended";
    this.suspended_at = new Date().toISOString();
    this.suspension_reason = reason;
    this.resume_state_json = state;
    await this.save();
  }

  async markResuming(state: Record<string, unknown>): Promise<void> {
    this.status = "running";
    this.resume_state_json = state;
    this.started_at = new Date().toISOString();
    await this.save();
  }

  async markPaused(): Promise<void> {
    this.status = "paused";
    await this.save();
  }

  // ── Status checks ─────────────────────────────────────────────────

  isIncomplete(): boolean {
    return this.status === "scheduled" || this.status === "running";
  }

  isSuspended(): boolean {
    return this.status === "suspended";
  }

  isRetryableFailure(): boolean {
    return this.status === "failed" && this.retryable;
  }

  isPaused(): boolean {
    return this.status === "paused";
  }
}
