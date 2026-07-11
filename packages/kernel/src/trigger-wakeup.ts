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
 * Service for delivering trigger events and waking suspended workflows.
 * Stores trigger inputs durably and coordinates wakeup.
 */
export class TriggerWakeupService {
  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus entry matches no runId/nodeId/inputId and is excluded by every query/filter
  private _inputs: TriggerInput[] = [];
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

  constructor(inboxStore?: DurableInboxStore) {
    this._inboxStore = inboxStore ?? new MemoryDurableInboxStore();
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
    // Idempotency check
    const existing = this._inputs.find((i) => i.inputId === opts.inputId);
    if (existing) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.debug("Trigger input already exists (idempotent)", {
        inputId: opts.inputId
      });
      return false;
    }

    const input: TriggerInput = {
      runId: opts.runId,
      nodeId: opts.nodeId,
      inputId: opts.inputId,
      payload: opts.payload,
      cursor: opts.cursor,
      processed: false,
      createdAt: new Date()
    };

    // Durable append FIRST, then record the in-memory idempotency marker.
    // Recording the marker before the append meant a transient append failure
    // left the marker behind, so the caller's retry hit the idempotency check
    // and returned early WITHOUT ever writing the durable message — the event
    // was lost. The inbox dedupes by message id (`trigger-<inputId>`), so a
    // concurrent double-append is safe. Reuse a cached DurableInbox per (run,
    // node) so its per-instance append serialization applies across concurrent
    // deliveries — a fresh instance per call would defeat it (see finding #9).
    const inbox = this._inboxFor(opts.runId, opts.nodeId);
    await inbox.append("trigger", opts.payload, `trigger-${opts.inputId}`);

    this._inputs.push(input);

    // Stryker disable next-line StringLiteral,ObjectLiteral,ConditionalExpression: diagnostic log args only (the cursor spread only affects log fields)
    log.info("Stored trigger input", {
      inputId: opts.inputId,
      runId: opts.runId,
      nodeId: opts.nodeId,
      // Stryker disable next-line ObjectLiteral,ConditionalExpression: diagnostic log field only
      ...(opts.cursor ? { cursor: opts.cursor } : {})
    });

    return true;
  }

  /**
   * Get pending (unprocessed) trigger inputs for a node.
   */
  getPendingInputs(runId: string, nodeId: string, limit = 100): TriggerInput[] {
    return this._inputs
      .filter((i) => i.runId === runId && i.nodeId === nodeId && !i.processed)
      .slice(0, limit);
  }

  /**
   * Mark a trigger input as processed.
   */
  markProcessed(inputId: string): void {
    const input = this._inputs.find((i) => i.inputId === inputId);
    if (input) {
      input.processed = true;
      input.processedAt = new Date();
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.debug("Marked trigger input as processed", { inputId });
    }
  }

  /**
   * Clean up processed trigger inputs older than specified hours.
   */
  cleanupProcessed(runId: string, nodeId: string, olderThanHours = 24): number {
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
    const removed = before - this._inputs.length;
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
