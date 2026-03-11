/**
 * RunEvent model -- append-only audit log for workflow execution.
 *
 * Port of Python's `nodetool.models.run_event`.
 *
 * AUDIT-ONLY: This event log is for observability and debugging purposes only.
 * It is NOT the source of truth for workflow execution. All scheduling and
 * recovery decisions must be based on mutable state tables (Job, RunNodeState).
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

export type EventType =
  | "RunCreated"
  | "RunCompleted"
  | "RunFailed"
  | "RunCancelled"
  | "RunSuspended"
  | "RunResumed"
  | "NodeScheduled"
  | "NodeStarted"
  | "NodeCheckpointed"
  | "NodeCompleted"
  | "NodeFailed"
  | "NodeSuspended"
  | "NodeResumed"
  | "TriggerRegistered"
  | "TriggerInputReceived"
  | "TriggerCursorAdvanced"
  | "OutboxEnqueued"
  | "OutboxSent";

// ── Schema ───────────────────────────────────────────────────────────

const RUN_EVENT_SCHEMA: TableSchema = {
  table_name: "run_events",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    run_id: { type: "string" },
    seq: { type: "number" },
    event_type: { type: "string" },
    event_time: { type: "datetime" },
    node_id: { type: "string", optional: true },
    payload: { type: "json", optional: true },
  },
};

const RUN_EVENT_INDEXES: IndexSpec[] = [
  {
    name: "idx_run_events_run_seq",
    columns: ["run_id", "seq"],
    unique: true,
  },
  {
    name: "idx_run_events_run_node",
    columns: ["run_id", "node_id"],
    unique: false,
  },
  {
    name: "idx_run_events_run_type",
    columns: ["run_id", "event_type"],
    unique: false,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class RunEvent extends DBModel {
  static override schema = RUN_EVENT_SCHEMA;
  static override indexes = RUN_EVENT_INDEXES;

  declare id: string;
  declare run_id: string;
  declare seq: number;
  declare event_type: EventType;
  declare event_time: string;
  declare node_id: string | null;
  declare payload: Record<string, unknown> | null;

  constructor(data: Row) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.event_time ??= new Date().toISOString();
    this.node_id ??= null;
    this.payload ??= null;
  }

  // ── Static methods ────────────────────────────────────────────────

  /** Get the next sequence number for a run. */
  static async getNextSeq(runId: string): Promise<number> {
    const [results] = await (
      RunEvent as unknown as ModelClass<RunEvent>
    ).query({
      condition: field("run_id").equals(runId),
      orderBy: "seq",
      reverse: true,
      limit: 1,
      columns: ["seq"],
    });

    if (results.length === 0) return 0;
    return results[0].seq + 1;
  }

  /** Append a new event with automatic sequence number. */
  static async appendEvent(
    runId: string,
    eventType: EventType,
    payload: Record<string, unknown>,
    nodeId?: string,
  ): Promise<RunEvent> {
    const seq = await RunEvent.getNextSeq(runId);
    return (RunEvent as unknown as ModelClass<RunEvent>).create({
      id: createTimeOrderedUuid(),
      run_id: runId,
      seq,
      event_type: eventType,
      event_time: new Date().toISOString(),
      node_id: nodeId ?? null,
      payload,
    });
  }

  /** Query events for a run with optional filters. */
  static async getEvents(
    runId: string,
    opts: {
      seqGt?: number;
      seqLte?: number;
      eventType?: EventType;
      nodeId?: string;
      limit?: number;
    } = {},
  ): Promise<RunEvent[]> {
    const { seqGt, seqLte, eventType, nodeId, limit = 1000 } = opts;

    let cond = field("run_id").equals(runId);

    if (seqGt !== undefined) {
      cond = cond.and(field("seq").greaterThan(seqGt));
    }
    if (seqLte !== undefined) {
      cond = cond.and(field("seq").lessThanOrEqual(seqLte));
    }
    if (eventType !== undefined) {
      cond = cond.and(field("event_type").equals(eventType));
    }
    if (nodeId !== undefined) {
      cond = cond.and(field("node_id").equals(nodeId));
    }

    const [results] = await (
      RunEvent as unknown as ModelClass<RunEvent>
    ).query({
      condition: cond,
      orderBy: "seq",
      limit,
    });

    return results;
  }

  /** Deserialize a RunEvent from a plain object (e.g. from JSON). */
  static fromDict(data: Record<string, unknown>): RunEvent {
    return new RunEvent({
      id: (data.id as string) ?? createTimeOrderedUuid(),
      run_id: (data.run_id as string) ?? "",
      seq: (data.seq as number) ?? 0,
      event_type: (data.event_type as string) ?? "RunCreated",
      event_time: (data.event_time as string) ?? new Date().toISOString(),
      node_id: (data.node_id as string) ?? null,
      payload: (data.payload as Record<string, unknown>) ?? null,
    });
  }

  /** Get the most recent event for a run, optionally filtered. */
  static async getLastEvent(
    runId: string,
    opts: { eventType?: EventType; nodeId?: string } = {},
  ): Promise<RunEvent | null> {
    let cond = field("run_id").equals(runId);

    if (opts.eventType) {
      cond = cond.and(field("event_type").equals(opts.eventType));
    }
    if (opts.nodeId) {
      cond = cond.and(field("node_id").equals(opts.nodeId));
    }

    const [results] = await (
      RunEvent as unknown as ModelClass<RunEvent>
    ).query({
      condition: cond,
      orderBy: "seq",
      reverse: true,
      limit: 1,
    });

    return results.length > 0 ? results[0] : null;
  }
}
