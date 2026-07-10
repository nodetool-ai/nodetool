/**
 * Trigger wakeup service for managing suspended trigger workflows.
 *
 * Port of src/nodetool/workflows/trigger_wakeup_service.py.
 *
 * Stores trigger inputs, tracks suspended triggers, and coordinates
 * wakeup of suspended workflows when events arrive.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  DurableInbox,
  type DurableInboxStore,
  MemoryDurableInboxStore
} from "./durable-inbox.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.kernel.trigger-wakeup");

export interface TriggerInput {
  runId: string;
  nodeId: string;
  inputId: string;
  payload: unknown;
  cursor?: string;
  processed: boolean;
  createdAt: Date;
  processedAt?: Date;
}

/**
 * A value that a store may return synchronously (in-memory) or as a Promise
 * (DB-backed). The service awaits writes, so both satisfy the same interface.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Storage backend for trigger inputs.
 *
 * The default {@link MemoryTriggerInputStore} keeps inputs in a process-local
 * array (single-process / testing). A DB-backed implementation (in the
 * websocket package) makes inputs durable across restarts. Both implement this
 * one interface: methods return {@link MaybePromise} so a synchronous memory
 * store and an asynchronous DB store are interchangeable.
 *
 * The service awaits {@link TriggerWakeupService.deliverTriggerInput}, so it
 * works with either kind of store. Its synchronous query helpers
 * (`getPendingInputs` / `markProcessed` / `cleanupProcessed`) only work against
 * a synchronous store — the DB store is consumed by the dispatcher directly.
 */
export interface TriggerInputStore {
  /** Insert unless `inputId` already exists. Returns true if newly inserted. */
  insertIfAbsent(input: TriggerInput): MaybePromise<boolean>;
  /** All unprocessed inputs (oldest first), optionally capped at `limit`. */
  findUnprocessed(limit?: number): MaybePromise<TriggerInput[]>;
  /** Mark the input processed; a no-op for an unknown `inputId`. */
  markProcessed(inputId: string): MaybePromise<void>;
  /**
   * Remove processed inputs for `(runId, nodeId)` whose `processedAt` is older
   * than `olderThanHours`. Returns the number removed.
   */
  cleanupProcessed(
    runId: string,
    nodeId: string,
    olderThanHours?: number
  ): MaybePromise<number>;
}

/**
 * In-memory {@link TriggerInputStore}. The default backing for
 * {@link TriggerWakeupService}; suitable for single-process / testing.
 */
export class MemoryTriggerInputStore implements TriggerInputStore {
  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus entry matches no runId/nodeId/inputId and is excluded by every query/filter
  private _inputs: TriggerInput[] = [];

  insertIfAbsent(input: TriggerInput): boolean {
    if (this._inputs.some((i) => i.inputId === input.inputId)) {
      return false;
    }
    this._inputs.push(input);
    return true;
  }

  findUnprocessed(limit?: number): TriggerInput[] {
    const unprocessed = this._inputs.filter((i) => !i.processed);
    return limit === undefined ? unprocessed : unprocessed.slice(0, limit);
  }

  markProcessed(inputId: string): void {
    const input = this._inputs.find((i) => i.inputId === inputId);
    if (input) {
      input.processed = true;
      input.processedAt = new Date();
    }
  }

  cleanupProcessed(
    runId: string,
    nodeId: string,
    olderThanHours = 24
  ): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const before = this._inputs.length;
    this._inputs = this._inputs.filter(
      (i) =>
        !(
          i.runId === runId &&
          i.nodeId === nodeId &&
          i.processed &&
          i.processedAt &&
          i.processedAt.getTime() < cutoff
        )
    );
    return before - this._inputs.length;
  }
}

/**
 * Service for delivering trigger events and waking suspended workflows.
 * Stores trigger inputs durably and coordinates wakeup.
 */
export class TriggerWakeupService {
  private _inputStore: TriggerInputStore;
  private _inboxStore: DurableInboxStore;
  /**
   * One DurableInbox per (runId, nodeId). DurableInbox.append() serializes its
   * read-modify-write (getMaxSeq → save) per *instance* via a promise chain, so
   * concurrent deliveries for the same (run, node) must share one instance or
   * they each read the same maxSeq and persist duplicate seq values. The key is
   * `JSON.stringify([runId, nodeId])` because runId/nodeId are arbitrary
   * strings — a plain `:` join would let ("a:b","c") collide with ("a","b:c").
   */
  private _inboxes = new Map<string, DurableInbox>();

  constructor(inboxStore?: DurableInboxStore, inputStore?: TriggerInputStore) {
    this._inboxStore = inboxStore ?? new MemoryDurableInboxStore();
    this._inputStore = inputStore ?? new MemoryTriggerInputStore();
  }

  private _inboxFor(runId: string, nodeId: string): DurableInbox {
    const key = JSON.stringify([runId, nodeId]);
    let inbox = this._inboxes.get(key);
    if (!inbox) {
      inbox = new DurableInbox(runId, nodeId, this._inboxStore);
      this._inboxes.set(key, inbox);
    }
    return inbox;
  }

  /**
   * Deliver a trigger input to a node (idempotent by inputId).
   * Also appends it as an inbox message for the trigger node.
   *
   * @returns true if newly created, false if already existed
   */
  async deliverTriggerInput(opts: {
    runId: string;
    nodeId: string;
    inputId: string;
    payload: unknown;
    cursor?: string;
  }): Promise<boolean> {
    // Idempotency + storage are delegated to the store: insertIfAbsent returns
    // false when an input with this inputId already exists.
    const created = await this._inputStore.insertIfAbsent({
      runId: opts.runId,
      nodeId: opts.nodeId,
      inputId: opts.inputId,
      payload: opts.payload,
      cursor: opts.cursor,
      processed: false,
      createdAt: new Date()
    });

    if (!created) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.debug("Trigger input already exists (idempotent)", {
        inputId: opts.inputId
      });
      return false;
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral,ConditionalExpression: diagnostic log args only (the cursor spread only affects log fields)
    log.info("Stored trigger input", {
      inputId: opts.inputId,
      runId: opts.runId,
      nodeId: opts.nodeId,
      // Stryker disable next-line ObjectLiteral,ConditionalExpression: diagnostic log field only
      ...(opts.cursor ? { cursor: opts.cursor } : {})
    });

    // Also append as inbox message. Reuse a cached DurableInbox per (run, node)
    // so its per-instance append serialization applies across concurrent
    // deliveries — a fresh instance per call would defeat it (see finding #9).
    const inbox = this._inboxFor(opts.runId, opts.nodeId);
    await inbox.append("trigger", opts.payload, `trigger-${opts.inputId}`);

    return true;
  }

  /**
   * Get pending (unprocessed) trigger inputs for a node.
   *
   * Synchronous: only valid against a synchronous {@link TriggerInputStore}
   * (the default memory store). A DB-backed store is polled by the dispatcher
   * through its own async `findUnprocessed`.
   */
  getPendingInputs(runId: string, nodeId: string, limit = 100): TriggerInput[] {
    const all = this._inputStore.findUnprocessed();
    if (all instanceof Promise) {
      throw new Error(
        "getPendingInputs requires a synchronous TriggerInputStore"
      );
    }
    return all
      .filter((i) => i.runId === runId && i.nodeId === nodeId)
      .slice(0, limit);
  }

  /**
   * Mark a trigger input as processed.
   *
   * Synchronous convenience over the store. With an asynchronous store the
   * write is issued fire-and-forget; durability-sensitive callers use the
   * store's own async `markProcessed`.
   */
  markProcessed(inputId: string): void {
    const result = this._inputStore.markProcessed(inputId);
    if (result instanceof Promise) {
      result.catch(() => undefined);
    }
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.debug("Marked trigger input as processed", { inputId });
  }

  /**
   * Clean up processed trigger inputs older than specified hours.
   *
   * Synchronous: only valid against a synchronous {@link TriggerInputStore}.
   */
  cleanupProcessed(runId: string, nodeId: string, olderThanHours = 24): number {
    const removed = this._inputStore.cleanupProcessed(
      runId,
      nodeId,
      olderThanHours
    );
    if (removed instanceof Promise) {
      throw new Error(
        "cleanupProcessed requires a synchronous TriggerInputStore"
      );
    }
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: the guard only gates a diagnostic log; `removed` is returned regardless
    if (removed > 0) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Cleaned up processed trigger inputs", {
        count: removed,
        runId,
        nodeId
      });
    }
    return removed;
  }
}
