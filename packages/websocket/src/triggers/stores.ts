/**
 * Database-backed implementations of the kernel's trigger storage interfaces.
 *
 * The kernel defines `TriggerInputStore` and `DurableInboxStore` but stays
 * store-agnostic — it cannot depend on `@nodetool-ai/models` without inverting
 * the package order. These adapters live in the server package, which already
 * owns the database.
 *
 * Queries use Drizzle's relational callback API (`db.query.<table>`) so this
 * package needs no direct `drizzle-orm` dependency and works on both the
 * SQLite and PostgreSQL dialects.
 */

import { getDb, RunInboxMessage, TriggerInput } from "@nodetool-ai/models";
import type {
  DurableInboxStore,
  DurableMessage,
  TriggerInput as TriggerInputRecord,
  TriggerInputStore
} from "@nodetool-ai/kernel";

interface TriggerInputRow {
  input_id: string;
  run_id: string;
  node_id: string;
  payload_json: unknown;
  processed: number;
  processed_at: string | null;
  cursor: string | null;
  created_at: string;
}

interface RunInboxMessageRow {
  id: string;
  message_id: string;
  run_id: string;
  node_id: string;
  handle: string;
  msg_seq: number;
  payload_json: unknown;
  payload_ref: string | null;
  status: string;
  consumed_at: string | null;
  created_at: string;
}

function toTriggerInput(row: TriggerInputRow): TriggerInputRecord {
  return {
    runId: row.run_id,
    nodeId: row.node_id,
    inputId: row.input_id,
    payload: row.payload_json,
    cursor: row.cursor ?? undefined,
    processed: row.processed !== 0,
    createdAt: new Date(row.created_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined
  };
}

function toDurableMessage(row: RunInboxMessageRow): DurableMessage {
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    handle: row.handle,
    messageId: row.message_id,
    seq: row.msg_seq,
    payload: row.payload_json,
    payloadRef: row.payload_ref ?? undefined,
    status: row.status === "consumed" ? "consumed" : "pending",
    createdAt: new Date(row.created_at),
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : undefined
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return /unique/i.test(err instanceof Error ? err.message : String(err));
}

/**
 * `TriggerInputStore` over the `trigger_inputs` table.
 */
export class DrizzleTriggerInputStore implements TriggerInputStore {
  async has(inputId: string): Promise<boolean> {
    return (await TriggerInput.findByInputId(inputId)) !== null;
  }

  async insertIfAbsent(input: TriggerInputRecord): Promise<boolean> {
    if (await TriggerInput.findByInputId(input.inputId)) return false;
    try {
      await TriggerInput.create<TriggerInput>({
        input_id: input.inputId,
        run_id: input.runId,
        node_id: input.nodeId,
        payload_json: input.payload,
        cursor: input.cursor ?? null,
        processed: input.processed ? 1 : 0,
        processed_at: input.processedAt?.toISOString() ?? null,
        created_at: input.createdAt.toISOString()
      });
    } catch (err) {
      // A concurrent writer won the race — the unique index on input_id makes
      // this the "already exists" answer, not a failure.
      if (isUniqueConstraintError(err)) return false;
      throw err;
    }
    return true;
  }

  async findUnprocessed(
    runId: string,
    nodeId: string,
    limit = 100
  ): Promise<TriggerInputRecord[]> {
    const rows = await getDb().query.triggerInputs.findMany({
      where: (t, { and, eq }) =>
        and(eq(t.run_id, runId), eq(t.node_id, nodeId), eq(t.processed, 0)),
      orderBy: (t, { asc }) => asc(t.created_at),
      limit
    });
    return rows.map((r) => toTriggerInput(r));
  }

  async markProcessed(inputId: string): Promise<void> {
    await TriggerInput.markProcessed(inputId);
  }

  async cleanupProcessed(
    runId: string,
    nodeId: string,
    olderThanHours = 24
  ): Promise<number> {
    const cutoff = new Date(
      Date.now() - olderThanHours * 60 * 60 * 1000
    ).toISOString();
    const rows = await getDb().query.triggerInputs.findMany({
      where: (t, { and, eq, lt, isNotNull }) =>
        and(
          eq(t.run_id, runId),
          eq(t.node_id, nodeId),
          eq(t.processed, 1),
          isNotNull(t.processed_at),
          lt(t.processed_at, cutoff)
        )
    });
    for (const row of rows) {
      await new TriggerInput(row).delete();
    }
    return rows.length;
  }

  async hasInputsFor(runId: string, nodeId: string): Promise<boolean> {
    const row = await getDb().query.triggerInputs.findFirst({
      where: (t, { and, eq }) => and(eq(t.run_id, runId), eq(t.node_id, nodeId))
    });
    return row !== undefined;
  }

  async deleteRun(runId: string): Promise<void> {
    const rows = await getDb().query.triggerInputs.findMany({
      where: (t, { eq }) => eq(t.run_id, runId)
    });
    for (const row of rows) {
      await new TriggerInput(row).delete();
    }
  }
}

/**
 * `DurableInboxStore` over the `run_inbox_messages` table.
 */
export class DrizzleDurableInboxStore implements DurableInboxStore {
  private async row(messageId: string): Promise<RunInboxMessage | null> {
    const row = await getDb().query.runInboxMessages.findFirst({
      where: (t, { eq }) => eq(t.message_id, messageId)
    });
    return row ? new RunInboxMessage(row) : null;
  }

  async findByMessageId(messageId: string): Promise<DurableMessage | null> {
    const row = await this.row(messageId);
    return row ? toDurableMessage(row) : null;
  }

  async save(message: DurableMessage): Promise<void> {
    await RunInboxMessage.create<RunInboxMessage>({
      message_id: message.messageId,
      run_id: message.runId,
      node_id: message.nodeId,
      handle: message.handle,
      msg_seq: message.seq,
      payload_json: message.payload,
      payload_ref: message.payloadRef ?? null,
      status: message.status,
      consumed_at: message.consumedAt?.toISOString() ?? null,
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
    const rows = await getDb().query.runInboxMessages.findMany({
      where: (t, { and, eq, gte }) =>
        and(
          eq(t.run_id, runId),
          eq(t.node_id, nodeId),
          eq(t.handle, handle),
          eq(t.status, "pending"),
          gte(t.msg_seq, minSeq)
        ),
      orderBy: (t, { asc }) => asc(t.msg_seq),
      limit
    });
    return rows.map((r) => toDurableMessage(r));
  }

  async getMaxSeq(
    runId: string,
    nodeId: string,
    handle: string
  ): Promise<number> {
    return RunInboxMessage.maxSeq(runId, nodeId, handle);
  }

  async markConsumed(messageId: string): Promise<void> {
    const row = await this.row(messageId);
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
    const rows = await getDb().query.runInboxMessages.findMany({
      where: (t, { and, eq, lt }) =>
        and(
          eq(t.run_id, runId),
          eq(t.node_id, nodeId),
          eq(t.handle, handle),
          eq(t.status, "consumed"),
          lt(t.msg_seq, olderThanSeq)
        )
    });
    for (const row of rows) {
      await new RunInboxMessage(row).delete();
    }
    return rows.length;
  }
}
