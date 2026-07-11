/**
 * TriggerInput model — durable, idempotent trigger events awaiting dispatch.
 */

import { eq, asc } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { triggerInputs } from "./schema/trigger-inputs.js";

export class TriggerInput extends DBModel {
  static override table = triggerInputs;

  declare id: string;
  declare input_id: string;
  declare run_id: string;
  declare node_id: string;
  declare payload_json: unknown | null;
  declare processed: number;
  declare processed_at: string | null;
  declare cursor: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.processed ??= 0;
    this.payload_json ??= null;
    this.processed_at ??= null;
    this.cursor ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Static queries ───────────────────────────────────────────────

  static async findUnprocessed(limit = 100): Promise<TriggerInput[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(triggerInputs)
      .where(eq(triggerInputs.processed, 0))
      .orderBy(asc(triggerInputs.created_at))
      .limit(limit);
    return rows.map((r) => new TriggerInput(r as Record<string, unknown>));
  }

  static async findByInputId(inputId: string): Promise<TriggerInput | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(triggerInputs)
      .where(eq(triggerInputs.input_id, inputId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return new TriggerInput(row as Record<string, unknown>);
  }

  static async markProcessed(inputId: string): Promise<TriggerInput | null> {
    const input = await TriggerInput.findByInputId(inputId);
    if (!input) return null;
    input.processed = 1;
    input.processed_at = new Date().toISOString();
    await input.save();
    return input;
  }
}
