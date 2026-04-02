/**
 * NodeInbox – per-node input queuing with backpressure.
 *
 * Port of src/nodetool/workflows/inbox.py.
 *
 * Core semantics:
 *   - Per-handle FIFO buffers.
 *   - Upstream source counting for EOS detection.
 *   - Async iteration with backpressure (optional buffer limit).
 *   - Arrival-order multiplexing for iterAny.
 *   - MessageEnvelope wrapping for metadata propagation.
 */

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// MessageEnvelope
// ---------------------------------------------------------------------------

export interface MessageEnvelope {
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: number; // epoch ms
  event_id: string;
}

function makeEnvelope(
  data: unknown,
  metadata: Record<string, unknown> = {}
): MessageEnvelope {
  return {
    data,
    metadata,
    timestamp: Date.now(),
    event_id: randomUUID()
  };
}

// ---------------------------------------------------------------------------
// Deferred – a tiny promise that can be resolved externally
// ---------------------------------------------------------------------------

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (val: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (val: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// NodeInbox
// ---------------------------------------------------------------------------

export class NodeInbox {
  /** Per-handle FIFO of envelopes. */
  private _buffers = new Map<string, MessageEnvelope[]>();

  /** Number of open upstream sources per handle. */
  private _openCounts = new Map<string, number>();

  /** Global arrival order queue of handle names. */
  private _arrival: string[] = [];

  /** Optional per-handle buffer capacity. */
  private _bufferLimit: number | null;

  /** Flag: inbox is closed (no more data accepted). */
  private _closed = false;

  /** Waiters: consumers blocking for new data. */
  private _waiters: Array<Deferred<void>> = [];

  /** Waiters: producers blocking when buffer is full. */
  private _putWaiters: Array<Deferred<void>> = [];

  constructor(bufferLimit: number | null = null) {
    this._bufferLimit = bufferLimit;
  }

  // -----------------------------------------------------------------------
  // Producer API
  // -----------------------------------------------------------------------

  /**
   * Register upstream producer count for a handle.
   * Must be called before `put()`.
   */
  addUpstream(handle: string, count: number = 1): void {
    const cur = this._openCounts.get(handle) ?? 0;
    this._openCounts.set(handle, cur + count);
    if (!this._buffers.has(handle)) {
      this._buffers.set(handle, []);
    }
  }

  /**
   * Enqueue an item for a handle.
   * Blocks (via returned promise) if the per-handle buffer is at capacity.
   */
  async put(
    handle: string,
    item: unknown,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (this._closed) return;

    const buf = this._buffers.get(handle);
    if (!buf) {
      // Handle not registered – auto-create
      this._buffers.set(handle, []);
    }

    // Backpressure: wait if buffer is at limit
    if (this._bufferLimit !== null) {
      while (
        !this._closed &&
        (this._buffers.get(handle)?.length ?? 0) >= this._bufferLimit
      ) {
        const d = deferred<void>();
        this._putWaiters.push(d);
        await d.promise;
      }
      if (this._closed) return;
    }

    const envelope = makeEnvelope(item, metadata);
    this._buffers.get(handle)!.push(envelope);
    this._arrival.push(handle);
    this._notifyWaiters();
  }

  /**
   * Prepend an envelope back to the front of a handle's buffer.
   * Used for push-back scenarios.
   */
  prepend(handle: string, envelope: MessageEnvelope): void {
    const buf = this._buffers.get(handle);
    if (buf) {
      buf.unshift(envelope);
      this._arrival.unshift(handle);
      this._notifyWaiters();
    }
  }

  /**
   * Signal that one upstream source for `handle` is done.
   * When all sources are done and buffer is empty, EOS for that handle.
   */
  markSourceDone(handle: string): void {
    const cur = this._openCounts.get(handle) ?? 0;
    if (cur > 0) {
      this._openCounts.set(handle, cur - 1);
    }
    this._notifyWaiters();
  }

  // -----------------------------------------------------------------------
  // Consumer API – async iterators
  // -----------------------------------------------------------------------

  /**
   * Yield items for a single handle until EOS.
   */
  async *iterInput(handle: string): AsyncGenerator<unknown> {
    while (true) {
      const buf = this._buffers.get(handle);
      if (buf && buf.length > 0) {
        const envelope = buf.shift()!;
        this._removeFromArrival(handle);
        this._notifyPutWaiters();
        yield envelope.data;
        continue;
      }
      // Check EOS
      if (this._isHandleDone(handle) || this._closed) {
        return;
      }
      // Wait for new data
      await this._waitForData();
    }
  }

  /**
   * Yield MessageEnvelopes for a single handle until EOS.
   */
  async *iterInputWithEnvelope(
    handle: string
  ): AsyncGenerator<MessageEnvelope> {
    while (true) {
      const buf = this._buffers.get(handle);
      if (buf && buf.length > 0) {
        const envelope = buf.shift()!;
        this._removeFromArrival(handle);
        this._notifyPutWaiters();
        yield envelope;
        continue;
      }
      if (this._isHandleDone(handle) || this._closed) {
        return;
      }
      await this._waitForData();
    }
  }

  /**
   * Yield (handle, item) tuples in arrival order across all handles.
   * Completes when all handles are drained.
   */
  async *iterAny(): AsyncGenerator<[string, unknown]> {
    while (true) {
      const popped = this.tryPopAny();
      if (popped) {
        yield popped;
        continue;
      }
      if (this.isFullyDrained() || this._closed) {
        return;
      }
      await this._waitForData();
    }
  }

  /**
   * Yield (handle, MessageEnvelope) in arrival order.
   */
  async *iterAnyWithEnvelope(): AsyncGenerator<[string, MessageEnvelope]> {
    while (true) {
      const popped = this.tryPopAnyWithEnvelope();
      if (popped) {
        yield popped;
        continue;
      }
      if (this.isFullyDrained() || this._closed) {
        return;
      }
      await this._waitForData();
    }
  }

  // -----------------------------------------------------------------------
  // Non-blocking pop
  // -----------------------------------------------------------------------

  /**
   * Non-blocking: pop the earliest-arriving item across all handles.
   * Returns [handle, item] or null.
   */
  tryPopAny(): [string, unknown] | null {
    const env = this.tryPopAnyWithEnvelope();
    if (!env) return null;
    return [env[0], env[1].data];
  }

  /**
   * Non-blocking: pop the earliest-arriving envelope.
   */
  tryPopAnyWithEnvelope(): [string, MessageEnvelope] | null {
    while (this._arrival.length > 0) {
      const handle = this._arrival[0];
      const buf = this._buffers.get(handle);
      if (buf && buf.length > 0) {
        this._arrival.shift();
        const envelope = buf.shift()!;
        this._notifyPutWaiters();
        return [handle, envelope];
      }
      // Stale arrival entry (buffer already consumed) – skip
      this._arrival.shift();
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // State queries
  // -----------------------------------------------------------------------

  /** Whether any handle has buffered data. */
  hasAny(): boolean {
    for (const buf of this._buffers.values()) {
      if (buf.length > 0) return true;
    }
    return false;
  }

  /** Whether a specific handle has buffered data. */
  hasBuffered(handle: string): boolean {
    const buf = this._buffers.get(handle);
    return buf !== undefined && buf.length > 0;
  }

  /** Whether a handle still has open upstream sources. */
  isOpen(handle: string): boolean {
    return (this._openCounts.get(handle) ?? 0) > 0;
  }

  /**
   * Whether the inbox is fully drained:
   * all handles have no buffered data AND no open upstream sources.
   */
  isFullyDrained(): boolean {
    for (const [handle, buf] of this._buffers) {
      if (buf.length > 0) return false;
      if ((this._openCounts.get(handle) ?? 0) > 0) return false;
    }
    return true;
  }

  /** Inverse of isFullyDrained. */
  hasPendingWork(): boolean {
    return !this.isFullyDrained();
  }

  // -----------------------------------------------------------------------
  // Control
  // -----------------------------------------------------------------------

  /** Close the inbox – wake all consumers, reject further writes. */
  async closeAll(): Promise<void> {
    this._closed = true;
    this._notifyWaiters();
    this._notifyPutWaiters();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private _isHandleDone(handle: string): boolean {
    const buf = this._buffers.get(handle);
    const empty = !buf || buf.length === 0;
    const noUpstream = (this._openCounts.get(handle) ?? 0) === 0;
    return empty && noUpstream;
  }

  /** Wake one consumer waiter. */
  private _notifyWaiters(): void {
    while (this._waiters.length > 0) {
      const w = this._waiters.shift()!;
      w.resolve();
    }
  }

  /** Wake one producer waiter (backpressure relief). */
  private _notifyPutWaiters(): void {
    while (this._putWaiters.length > 0) {
      const w = this._putWaiters.shift()!;
      w.resolve();
    }
  }

  /** Wait until notified of new data or close. */
  private _waitForData(): Promise<void> {
    const d = deferred<void>();
    this._waiters.push(d);
    return d.promise;
  }

  /**
   * Remove the first occurrence of `handle` from the arrival queue.
   * Called after consuming from a specific handle.
   */
  private _removeFromArrival(handle: string): void {
    const idx = this._arrival.indexOf(handle);
    if (idx >= 0) {
      this._arrival.splice(idx, 1);
    }
  }
}
