/**
 * TriggerRegistration model — a trigger node compiled to a durable listener.
 */

import { eq, and, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
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
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Static queries ───────────────────────────────────────────────

  static async findEnabledByKind(kind: string): Promise<TriggerRegistration[]> {
    const db = getDb();
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
      (r) => new TriggerRegistration(r as Record<string, unknown>)
    );
  }

  /**
   * All registrations of a kind, enabled and disabled. The webhook route needs
   * disabled rows too, to answer 410 (disabled) distinctly from 404 (unknown).
   */
  static async findByKind(kind: string): Promise<TriggerRegistration[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(eq(triggerRegistrations.kind, kind))
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r as Record<string, unknown>)
    );
  }

  static async findByWorkflow(
    workflowId: string
  ): Promise<TriggerRegistration[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(eq(triggerRegistrations.workflow_id, workflowId))
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r as Record<string, unknown>)
    );
  }

  static async findByUser(userId: string): Promise<TriggerRegistration[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(triggerRegistrations)
      .where(eq(triggerRegistrations.user_id, userId))
      .orderBy(asc(triggerRegistrations.created_at));
    return rows.map(
      (r) => new TriggerRegistration(r as Record<string, unknown>)
    );
  }
}
