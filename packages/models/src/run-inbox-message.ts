/**
 * RunInboxMessage model — durable inbox for events delivered to a run's nodes.
 */

import { eq, and, asc, max } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { runInboxMessages } from "./schema/run-inbox-messages.js";

export class RunInboxMessage extends DBModel {
  static override table = runInboxMessages;

  declare id: string;
  declare message_id: string;
  declare run_id: string;
  declare node_id: string;
  declare handle: string;
  declare msg_seq: number;
  declare payload_json: unknown | null;
  declare payload_ref: string | null;
  declare status: string;
  declare claim_worker_id: string | null;
  declare claim_expires_at: string | null;
  declare consumed_at: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.payload_json ??= null;
    this.payload_ref ??= null;
    this.claim_worker_id ??= null;
    this.claim_expires_at ??= null;
    this.consumed_at ??= null;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Static queries ───────────────────────────────────────────────

  static async maxSeq(
    runId: string,
    nodeId: string,
    handle: string
  ): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ value: max(runInboxMessages.msg_seq) })
      .from(runInboxMessages)
      .where(
        and(
          eq(runInboxMessages.run_id, runId),
          eq(runInboxMessages.node_id, nodeId),
          eq(runInboxMessages.handle, handle)
        )
      );
    return rows[0]?.value ?? 0;
  }

  static async findPending(
    runId: string,
    nodeId: string,
    handle: string
  ): Promise<RunInboxMessage[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(runInboxMessages)
      .where(
        and(
          eq(runInboxMessages.run_id, runId),
          eq(runInboxMessages.node_id, nodeId),
          eq(runInboxMessages.handle, handle),
          eq(runInboxMessages.status, "pending")
        )
      )
      .orderBy(asc(runInboxMessages.msg_seq));
    return rows.map((r) => new RunInboxMessage(r as Record<string, unknown>));
  }
}
