/**
 * RunEvent model -- append-only audit log for workflow execution.
 *
 * Port of Python's `nodetool.models.run_event`.
 */

import { eq, and, gt, lte, desc, asc } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb, getDbType } from "./db.js";
import { runEvents } from "./schema/run-events.js";

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

export class RunEvent extends DBModel {
  static override table = runEvents;

  declare id: string;
  declare run_id: string;
  declare seq: number;
  declare event_type: EventType;
  declare event_time: string;
  declare node_id: string | null;
  declare payload: Record<string, unknown> | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.event_time ??= new Date().toISOString();
    this.node_id ??= null;
    this.payload ??= null;
  }

  /** Get the next sequence number for a run. */
  static async getNextSeq(runId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ seq: runEvents.seq })
      .from(runEvents)
      .where(eq(runEvents.run_id, runId))
      .orderBy(desc(runEvents.seq))
      .limit(1)

    if (rows.length === 0) return 0;
    return rows[0].seq + 1;
  }

  /**
   * Append a new event with an automatic sequence number.
   *
   * The next-seq read and the insert run inside a single transaction so two
   * concurrent appends for the same run can't compute the same seq and collide
   * on the UNIQUE (run_id, seq) index. Mirrors RunLease.acquire's dual-dialect
   * transaction pattern (better-sqlite3 transactions must be synchronous).
   */
  static async appendEvent(
    runId: string,
    eventType: EventType,
    payload: Record<string, unknown>,
    nodeId?: string
  ): Promise<RunEvent> {
    const db = getDb();
    const buildRow = (seq: number): Record<string, unknown> => ({
      id: createTimeOrderedUuid(),
      run_id: runId,
      seq,
      event_type: eventType,
      event_time: new Date().toISOString(),
      node_id: nodeId ?? null,
      payload
    });

    let row: Record<string, unknown>;
    if (getDbType() === "sqlite") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row = db.transaction((tx: any) => {
        const existing = tx
          .select({ seq: runEvents.seq })
          .from(runEvents)
          .where(eq(runEvents.run_id, runId))
          .orderBy(desc(runEvents.seq))
          .limit(1)
          .get();
        const r = buildRow(existing ? existing.seq + 1 : 0);
        tx.insert(runEvents).values(r).run();
        return r;
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row = await db.transaction(async (tx: any) => {
        const rows = await tx
          .select({ seq: runEvents.seq })
          .from(runEvents)
          .where(eq(runEvents.run_id, runId))
          .orderBy(desc(runEvents.seq))
          .limit(1);
        const r = buildRow(rows.length > 0 ? rows[0].seq + 1 : 0);
        await tx.insert(runEvents).values(r);
        return r;
      });
    }

    const instance = new RunEvent(row);
    ModelObserver.notify(instance, ModelChangeEvent.CREATED);
    return instance;
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
    } = {}
  ): Promise<RunEvent[]> {
    const { seqGt, seqLte, eventType, nodeId, limit = 1000 } = opts;
    const db = getDb();

    const conditions = [eq(runEvents.run_id, runId)];
    if (seqGt !== undefined) conditions.push(gt(runEvents.seq, seqGt));
    if (seqLte !== undefined) conditions.push(lte(runEvents.seq, seqLte));
    if (eventType !== undefined)
      conditions.push(eq(runEvents.event_type, eventType));
    if (nodeId !== undefined) conditions.push(eq(runEvents.node_id, nodeId));

    const rows = await db
      .select()
      .from(runEvents)
      .where(and(...conditions))
      .orderBy(asc(runEvents.seq))
      .limit(limit)

    return rows.map((r: Record<string, unknown>) => new RunEvent(r as Record<string, unknown>));
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
      payload: (data.payload as Record<string, unknown>) ?? null
    });
  }

  /** Get the most recent event for a run, optionally filtered. */
  static async getLastEvent(
    runId: string,
    opts: { eventType?: EventType; nodeId?: string } = {}
  ): Promise<RunEvent | null> {
    const db = getDb();
    const conditions = [eq(runEvents.run_id, runId)];
    if (opts.eventType)
      conditions.push(eq(runEvents.event_type, opts.eventType));
    if (opts.nodeId) conditions.push(eq(runEvents.node_id, opts.nodeId));

    const rows = await db
      .select()
      .from(runEvents)
      .where(and(...conditions))
      .orderBy(desc(runEvents.seq))
      .limit(1)

    return rows.length > 0
      ? new RunEvent(rows[0] as Record<string, unknown>)
      : null;
  }
}
