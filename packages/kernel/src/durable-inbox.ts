/**
 * Durable inbox for reliable message delivery.
 *
 * Port of src/nodetool/workflows/durable_inbox.py.
 *
 * Provides at-least-once delivery with idempotency guarantees.
 * The default implementation is in-memory; production deployments
 * can swap in a database-backed adapter.
 */

import { createHash } from "node:crypto";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.kernel.durable-inbox");

export interface DurableMessage {
  id: string;
  runId: string;
  nodeId: string;
  handle: string;
  messageId: string;
  seq: number;
  payload: unknown;
  payloadRef?: string;
  status: "pending" | "consumed";
  createdAt: Date;
  consumedAt?: Date;
}

/**
 * Storage backend interface for durable inbox messages.
 */
export interface DurableInboxStore {
  findByMessageId(messageId: string): Promise<DurableMessage | null>;
  save(message: DurableMessage): Promise<void>;
  findPending(
    runId: string,
    nodeId: string,
    handle: string,
    limit: number,
    minSeq?: number
  ): Promise<DurableMessage[]>;
  getMaxSeq(runId: string, nodeId: string, handle: string): Promise<number>;
  markConsumed(messageId: string): Promise<void>;
  deleteConsumed(
    runId: string,
    nodeId: string,
    handle: string,
    olderThanSeq: number
  ): Promise<number>;
}

/**
 * In-memory implementation of DurableInboxStore.
 * Suitable for single-process / testing scenarios.
 */
export class MemoryDurableInboxStore implements DurableInboxStore {
  private messages: DurableMessage[] = [];

  async findByMessageId(messageId: string): Promise<DurableMessage | null> {
    return this.messages.find((m) => m.messageId === messageId) ?? null;
  }

  async save(message: DurableMessage): Promise<void> {
    this.messages.push(message);
  }

  async findPending(
    runId: string,
    nodeId: string,
    handle: string,
    limit: number,
    minSeq = 0
  ): Promise<DurableMessage[]> {
    return this.messages
      .filter(
        (m) =>
          m.runId === runId &&
          m.nodeId === nodeId &&
          m.handle === handle &&
          m.status === "pending" &&
          m.seq >= minSeq
      )
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }

  async getMaxSeq(
    runId: string,
    nodeId: string,
    handle: string
  ): Promise<number> {
    let max = 0;
    for (const m of this.messages) {
      if (
        m.runId === runId &&
        m.nodeId === nodeId &&
        m.handle === handle &&
        m.seq > max
      ) {
        max = m.seq;
      }
    }
    return max;
  }

  async markConsumed(messageId: string): Promise<void> {
    const msg = this.messages.find((m) => m.messageId === messageId);
    if (msg) {
      msg.status = "consumed";
      msg.consumedAt = new Date();
    }
  }

  async deleteConsumed(
    runId: string,
    nodeId: string,
    handle: string,
    olderThanSeq: number
  ): Promise<number> {
    const before = this.messages.length;
    this.messages = this.messages.filter(
      (m) =>
        !(
          m.runId === runId &&
          m.nodeId === nodeId &&
          m.handle === handle &&
          m.status === "consumed" &&
          m.seq < olderThanSeq
        )
    );
    return before - this.messages.length;
  }
}

/**
 * Durable inbox for a specific node in a workflow run.
 * Provides idempotent message delivery with sequencing.
 */
export class DurableInbox {
  readonly runId: string;
  readonly nodeId: string;
  private store: DurableInboxStore;

  constructor(runId: string, nodeId: string, store?: DurableInboxStore) {
    this.runId = runId;
    this.nodeId = nodeId;
    this.store = store ?? new MemoryDurableInboxStore();
  }

  /**
   * Generate a deterministic message ID from the addressing tuple.
   */
  static generateMessageId(
    runId: string,
    nodeId: string,
    handle: string,
    seq: number
  ): string {
    const key = `${runId}:${nodeId}:${handle}:${seq}`;
    return createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  /**
   * Append a message to the inbox (idempotent).
   * If messageId already exists, returns existing without error.
   */
  async append(
    handle: string,
    payload: unknown,
    messageId?: string,
    payloadRef?: string
  ): Promise<DurableMessage> {
    const nextSeq =
      (await this.store.getMaxSeq(this.runId, this.nodeId, handle)) + 1;

    const finalId =
      messageId ??
      DurableInbox.generateMessageId(this.runId, this.nodeId, handle, nextSeq);

    const existing = await this.store.findByMessageId(finalId);
    if (existing) {
      log.debug("Message already exists (idempotent)", { messageId: finalId });
      return existing;
    }

    const message: DurableMessage = {
      id: finalId,
      runId: this.runId,
      nodeId: this.nodeId,
      handle,
      messageId: finalId,
      seq: nextSeq,
      payload,
      payloadRef,
      status: "pending",
      createdAt: new Date()
    };

    await this.store.save(message);
    log.debug("Appended message to inbox", {
      messageId: finalId,
      runId: this.runId,
      nodeId: this.nodeId,
      handle,
      seq: nextSeq
    });

    return message;
  }

  /**
   * Get pending messages for a handle in sequence order.
   */
  async getPending(
    handle: string,
    limit = 100,
    minSeq = 0
  ): Promise<DurableMessage[]> {
    return this.store.findPending(
      this.runId,
      this.nodeId,
      handle,
      limit,
      minSeq
    );
  }

  /**
   * Mark a message as consumed.
   */
  async markConsumed(message: DurableMessage): Promise<void> {
    await this.store.markConsumed(message.messageId);
    log.debug("Marked message as consumed", {
      messageId: message.messageId,
      handle: message.handle,
      seq: message.seq
    });
  }

  /**
   * Get the maximum sequence number for a handle.
   */
  async getMaxSeq(handle: string): Promise<number> {
    return this.store.getMaxSeq(this.runId, this.nodeId, handle);
  }

  /**
   * Clean up consumed messages older than a given sequence.
   */
  async cleanupConsumed(handle: string, olderThanSeq: number): Promise<number> {
    const count = await this.store.deleteConsumed(
      this.runId,
      this.nodeId,
      handle,
      olderThanSeq
    );
    if (count > 0) {
      log.info("Cleaned up consumed messages", {
        count,
        runId: this.runId,
        nodeId: this.nodeId,
        handle
      });
    }
    return count;
  }
}
