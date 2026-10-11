/**
 * TriggerRegistration model — a trigger node compiled to a durable listener.
 */

import { eq, and, asc } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getPortableDb } from "./db.js";
import { triggerRegistrations } from "./schema/trigger-registrations.js";

export class TriggerRegistration extends DBModel {
  static override table = triggerRegistrations;

  declare id: string;
  declare user_id: string;
  declare workflow_id: string;
  declare node_id: string;
  declare kind: string;
  declare config_json: Record<string, unknown> | null;
  declare enabled: number;
  declare cursor: string | null;
  declare last_fired_at: string | null;
  declare last_error: string | null;
  declare disabled_reason: string | null;
  declare consecutive_failures: number;
  declare run_count: number;
  declare expires_at: string | null;
  declare max_runs: number | null;
  /** 1 when runs from this trigger are supervised. Off (0) by default. */
  declare supervise: number;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.enabled ??= 1;
    this.config_json ??= null;
    this.cursor ??= null;
    this.last_fired_at ??= null;
    this.last_error ??= null;
    this.disabled_reason ??= null;
    this.consecutive_failures ??= 0;
    this.run_count ??= 0;
    this.expires_at ??= null;
    this.max_runs ??= null;
    this.supervise ??= 0;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Static queries ───────────────────────────────────────────────

  static async findEnabledByKind(kind: string): Promise<TriggerRegistration[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(
        and(
          eq(triggerRegistrations.kind, kind),
          eq(triggerRegistrations.enabled, 1)
        )
      )
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r)
    );
  }

  static async findByWorkflow(
    workflowId: string
  ): Promise<TriggerRegistration[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(eq(triggerRegistrations.workflow_id, workflowId))
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r)
    );
  }

  /**
   * Write only `fields`, and only to a row that still exists. `save()` upserts
   * the whole object, so a writer holding an old copy re-arms a stopped
   * trigger, resets its counters, or recreates a deleted row. Returns the
   * updated row, or `null` when it is gone.
   */
  static async updateColumns(
    id: string,
    fields: Partial<
      Pick<
        TriggerRegistration,
        | "enabled"
        | "cursor"
        | "last_fired_at"
        | "last_error"
        | "disabled_reason"
        | "consecutive_failures"
        | "run_count"
      >
    >
  ): Promise<TriggerRegistration | null> {
    const db = getPortableDb();
    const [row] = await db
      .update(triggerRegistrations)
      .set({ ...fields, updated_at: new Date().toISOString() })
      .where(eq(triggerRegistrations.id, id))
      .returning();
    if (!row) return null;
    const updated = new TriggerRegistration(row);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED);
    return updated;
  }

  /** Disarm every trigger of a workflow that no longer exists. */
  static async deleteByWorkflow(workflowId: string): Promise<void> {
    const db = getPortableDb();
    await db
      .delete(triggerRegistrations)
      .where(eq(triggerRegistrations.workflow_id, workflowId));
  }

  static async findByUser(userId: string): Promise<TriggerRegistration[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(eq(triggerRegistrations.user_id, userId))
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r)
    );
  }
}
