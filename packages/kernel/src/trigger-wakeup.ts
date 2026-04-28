/**
 * Trigger wakeup service for managing suspended trigger workflows.
 *
 * Port of src/nodetool/workflows/trigger_wakeup_service.py.
 *
 * Stores trigger inputs, tracks suspended triggers, and coordinates
 * wakeup of suspended workflows when events arrive.
 */

import { createLogger } from "@nodetool/config";
import {
  DurableInbox,
  type DurableInboxStore,
  MemoryDurableInboxStore
} from "./durable-inbox.js";

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
  private _inputs: TriggerInput[] = [];
  private _inboxStore: DurableInboxStore;

  constructor(inboxStore?: DurableInboxStore) {
    this._inboxStore = inboxStore ?? new MemoryDurableInboxStore();
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
    this._inputs.push(input);

    log.info("Stored trigger input", {
      inputId: opts.inputId,
      runId: opts.runId,
      nodeId: opts.nodeId,
      ...(opts.cursor ? { cursor: opts.cursor } : {})
    });

    // Also append as inbox message
    const inbox = new DurableInbox(opts.runId, opts.nodeId, this._inboxStore);
    await inbox.append("trigger", opts.payload, `trigger-${opts.inputId}`);

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
    if (removed > 0) {
      log.info("Cleaned up processed trigger inputs", {
        count: removed,
        runId,
        nodeId
      });
    }
    return removed;
  }
}
