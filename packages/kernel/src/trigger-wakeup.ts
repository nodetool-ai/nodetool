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
 * Storage backend for trigger inputs.
 *
 * Methods may answer synchronously (the in-memory store) or asynchronously (a
 * database-backed store), so callers written against the interface must await.
 * The kernel stays store-agnostic: DB-backed implementations live in the
 * server package, which is the only layer allowed to depend on the models.
 */
export interface TriggerInputStore {
  /** Store an input; false when one with the same inputId already exists. */
  insertIfAbsent(input: TriggerInput): boolean | Promise<boolean>;
  /** Unprocessed inputs for a (run, node), oldest first. */
  findUnprocessed(
    runId: string,
    nodeId: string,
    limit?: number
  ): TriggerInput[] | Promise<TriggerInput[]>;
  /** Mark an input processed. Unknown ids are a no-op. */
  markProcessed(inputId: string): void | Promise<void>;
  /** Drop processed inputs older than the cutoff; returns how many went. */
  cleanupProcessed(
    runId: string,
    nodeId: string,
    olderThanHours?: number
  ): number | Promise<number>;
}

/**
 * In-memory trigger input store — the default, and all a single-process run
 * needs. Beyond the interface it exposes the synchronous lookups
 * `TriggerWakeupService` needs to keep its own API synchronous.
 */
export class MemoryTriggerInputStore implements TriggerInputStore {
  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus entry matches no runId/nodeId/inputId and is excluded by every query/filter
  private _inputs: TriggerInput[] = [];

  has(inputId: string): boolean {
    return this._inputs.some((i) => i.inputId === inputId);
  }

  insertIfAbsent(input: TriggerInput): boolean {
    if (this.has(input.inputId)) return false;
    this._inputs.push(input);
    return true;
  }

  findUnprocessed(runId: string, nodeId: string, limit = 100): TriggerInput[] {
    return this._inputs
      .filter((i) => i.runId === runId && i.nodeId === nodeId && !i.processed)
      .slice(0, limit);
  }

  markProcessed(inputId: string): void {
    const input = this._inputs.find((i) => i.inputId === inputId);
    if (input) {
      input.processed = true;
      input.processedAt = new Date();
    }
  }

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
    return before - this._inputs.length;
  }

  /** Whether any input (processed or not) remains for a (run, node). */
  hasInputsFor(runId: string, nodeId: string): boolean {
    return this._inputs.some((i) => i.runId === runId && i.nodeId === nodeId);
  }

  /** Drop every input belonging to a run. */
  deleteRun(runId: string): void {
    this._inputs = this._inputs.filter((i) => i.runId !== runId);
  }
}

/**
 * Service for delivering trigger events and waking suspended workflows.
 * Stores trigger inputs durably and coordinates wakeup.
 */
export class TriggerWakeupService {
  private _store = new MemoryTriggerInputStore();
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
  /**
   * inputIds whose durable append is in flight. Recorded before the `await` so
   * two concurrent deliveries of the same inputId dedupe against each other
   * (the in-memory `_inputs` marker is only written after a successful append,
   * so it can't cover the concurrent window). Cleared once the append settles.
   */
  private _inflightInputIds = new Set<string>();

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
    // Idempotency check — against both the committed marker and any delivery
    // of the same inputId whose durable append is still in flight.
    if (
      this._store.has(opts.inputId) ||
      this._inflightInputIds.has(opts.inputId)
    ) {
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
    // The in-flight marker covers the await window; on failure it is cleared so
    // a retry is not short-circuited.
    const inbox = this._inboxFor(opts.runId, opts.nodeId);
    this._inflightInputIds.add(opts.inputId);
    try {
      await inbox.append("trigger", opts.payload, `trigger-${opts.inputId}`);
    } finally {
      this._inflightInputIds.delete(opts.inputId);
    }

    this._store.insertIfAbsent(input);

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
    return this._store.findUnprocessed(runId, nodeId, limit);
  }

  /**
   * Mark a trigger input as processed.
   */
  markProcessed(inputId: string): void {
    this._store.markProcessed(inputId);
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.debug("Marked trigger input as processed", { inputId });
  }

  /**
   * Clean up processed trigger inputs older than specified hours.
   */
  cleanupProcessed(runId: string, nodeId: string, olderThanHours = 24): number {
    const removed = this._store.cleanupProcessed(runId, nodeId, olderThanHours);
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: the guard only gates a diagnostic log; `removed` is returned regardless
    if (removed > 0) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Cleaned up processed trigger inputs", {
        count: removed,
        runId,
        nodeId
      });
    }
    // Evict the cached DurableInbox once no inputs remain for this (run, node),
    // otherwise _inboxes grows by one entry per run for the process lifetime
    // (runId is unique per run) even after cleanupProcessed purges the inputs.
    if (!this._store.hasInputsFor(runId, nodeId)) {
      this._inboxes.delete(JSON.stringify([runId, nodeId]));
    }
    return removed;
  }

  /**
   * Release all in-memory state for a finished run: its trigger inputs and any
   * cached DurableInbox instances. Call when a run terminates so a long-lived
   * service does not accumulate per-run state indefinitely.
   */
  disposeRun(runId: string): void {
    this._store.deleteRun(runId);
    for (const key of [...this._inboxes.keys()]) {
      const [keyRunId] = JSON.parse(key) as [string, string];
      if (keyRunId === runId) {
        this._inboxes.delete(key);
      }
    }
  }
}
