/**
 * DB-backed stores for the kernel trigger primitives.
 *
 * The kernel stays store-agnostic (it must not depend on `@nodetool-ai/models`,
 * which would invert the package dependency order). These adapters live in the
 * websocket package — which already depends on both — and back the kernel's
 * {@link TriggerInputStore} and {@link DurableInboxStore} interfaces with the
 * `trigger_inputs` and `run_inbox_messages` tables.
 */

import { and, eq, lt } from "drizzle-orm";
import {
  TriggerInput as TriggerInputModel,
  RunInboxMessage,
  triggerInputs,
  runInboxMessages,
  getDb
} from "@nodetool-ai/models";
import type {
  DurableInboxStore,
  DurableMessage,
  TriggerInput,
  TriggerInputStore
} from "@nodetool-ai/kernel";

function toTriggerInput(m: TriggerInputModel): TriggerInput {
  return {
    runId: m.run_id,
    nodeId: m.node_id,
    inputId: m.input_id,
    payload: m.payload_json,
    cursor: m.cursor ?? undefined,
    processed: m.processed === 1,
    createdAt: new Date(m.created_at),
    processedAt: m.processed_at ? new Date(m.processed_at) : undefined
  };
}

/**
 * {@link TriggerInputStore} over the `trigger_inputs` table.
 */
export class DrizzleTriggerInputStore implements TriggerInputStore {
  async insertIfAbsent(input: TriggerInput): Promise<boolean> {
    // The unique index on input_id enforces idempotency; check first so a
    // duplicate resolves to `false` rather than rejecting on the constraint.
    const existing = await TriggerInputModel.findByInputId(input.inputId);
    if (existing) return false;

    await TriggerInputModel.create({
      input_id: input.inputId,
      run_id: input.runId,
      node_id: input.nodeId,
      payload_json: input.payload,
      processed: input.processed ? 1 : 0,
      processed_at: input.processedAt
        ? input.processedAt.toISOString()
        : null,
      cursor: input.cursor ?? null,
      created_at: input.createdAt.toISOString()
    });
    return true;
  }

  async findUnprocessed(limit = 100): Promise<TriggerInput[]> {
    const rows = await TriggerInputModel.findUnprocessed(limit);
    return rows.map(toTriggerInput);
  }

  async markProcessed(inputId: string): Promise<void> {
    // Returns null for an unknown id (no throw).
    await TriggerInputModel.markProcessed(inputId);
  }

  async cleanupProcessed(
    runId: string,
    nodeId: string,
    olderThanHours = 24
  ): Promise<number> {
    const cutoff = new Date(
      Date.now() - olderThanHours * 60 * 60 * 1000
    ).toISOString();
    const db = getDb();
    const condition = and(
      eq(triggerInputs.run_id, runId),
      eq(triggerInputs.node_id, nodeId),
      eq(triggerInputs.processed, 1),
      // processed_at is a lexicographically-comparable ISO string; rows with a
      // null processed_at are excluded (SQL NULL comparisons are unknown).
      lt(triggerInputs.processed_at, cutoff)
    );
    const doomed = await db
      .select({ id: triggerInputs.id })
      .from(triggerInputs)
      .where(condition);
    if (doomed.length === 0) return 0;
    await db.delete(triggerInputs).where(condition);
    return doomed.length;
  }
}

function toDurableMessage(m: RunInboxMessage): DurableMessage {
  return {
    id: m.id,
    runId: m.run_id,
    nodeId: m.node_id,
    handle: m.handle,
    messageId: m.message_id,
    seq: m.msg_seq,
    payload: m.payload_json,
    payloadRef: m.payload_ref ?? undefined,
    status: m.status === "consumed" ? "consumed" : "pending",
    createdAt: new Date(m.created_at),
    consumedAt: m.consumed_at ? new Date(m.consumed_at) : undefined
  };
}

/**
 * {@link DurableInboxStore} over the `run_inbox_messages` table.
 *
 * `getMaxSeq` reads straight from the table, so sequencing survives a process
 * restart: a fresh store instance over the same DB continues where the last
 * left off.
 */
export class DrizzleDurableInboxStore implements DurableInboxStore {
  async findByMessageId(messageId: string): Promise<DurableMessage | null> {
    const row = await this._findRow(messageId);
    return row ? toDurableMessage(row) : null;
  }

  async save(message: DurableMessage): Promise<void> {
    await RunInboxMessage.create({
      id: message.id,
      message_id: message.messageId,
      run_id: message.runId,
      node_id: message.nodeId,
      handle: message.handle,
      msg_seq: message.seq,
      payload_json: message.payload,
      payload_ref: message.payloadRef ?? null,
      status: message.status,
      consumed_at: message.consumedAt
        ? message.consumedAt.toISOString()
        : null,
      created_at: message.createdAt.toISOString()
    });
  }

  async findPending(
    runId: string,
    nodeId: string,
    handle: string,
    limit: number,
    minSeq = 0
  ): Promise<DurableMessage[]> {
    // Model query returns pending rows ordered by msg_seq asc.
    const rows = await RunInboxMessage.findPending(runId, nodeId, handle);
    return rows
      .filter((r) => r.msg_seq >= minSeq)
      .slice(0, limit)
      .map(toDurableMessage);
  }

  async getMaxSeq(
    runId: string,
    nodeId: string,
    handle: string
  ): Promise<number> {
    return RunInboxMessage.maxSeq(runId, nodeId, handle);
  }

  async markConsumed(messageId: string): Promise<void> {
    const row = await this._findRow(messageId);
    if (!row) return;
    row.status = "consumed";
    row.consumed_at = new Date().toISOString();
    await row.save();
  }

  async deleteConsumed(
    runId: string,
    nodeId: string,
    handle: string,
    olderThanSeq: number
  ): Promise<number> {
    const db = getDb();
    const condition = and(
      eq(runInboxMessages.run_id, runId),
      eq(runInboxMessages.node_id, nodeId),
      eq(runInboxMessages.handle, handle),
      eq(runInboxMessages.status, "consumed"),
      lt(runInboxMessages.msg_seq, olderThanSeq)
    );
    const doomed = await db
      .select({ id: runInboxMessages.id })
      .from(runInboxMessages)
      .where(condition);
    if (doomed.length === 0) return 0;
    await db.delete(runInboxMessages).where(condition);
    return doomed.length;
  }

  private async _findRow(messageId: string): Promise<RunInboxMessage | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(runInboxMessages)
      .where(eq(runInboxMessages.message_id, messageId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return new RunInboxMessage(row as Record<string, unknown>);
  }
}
