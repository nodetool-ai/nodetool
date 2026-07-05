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

import { importNodeBuiltin } from "@nodetool-ai/config";
import type {
  CorrelationLineage,
  LineageDone,
  LineageScopeClosed
} from "@nodetool-ai/protocol";

// Stryker disable next-line StringLiteral: module name; on failure importNodeBuiltin returns null and randomUUID falls back, so the literal is not behaviourally observable
const _nodeCrypto = await importNodeBuiltin<typeof import("node:crypto")>("node:crypto");

/**
 * RFC4122 v4 UUID derived from a `[0, 1)` random source. This is the fallback
 * for runtimes without a native `crypto.randomUUID`. Exported so the bit-twiddling
 * can be verified deterministically with a fixed `rand`.
 */
export function fallbackUuidV4(rand: () => number = Math.random): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomUUID(): string {
  // Stryker disable next-line ConditionalExpression,OptionalChaining: equivalent — _nodeCrypto and globalThis.crypto both yield a valid UUID, so which native source provides it is unobservable
  if (_nodeCrypto?.randomUUID) return _nodeCrypto.randomUUID();
  // Stryker disable next-line ConditionalExpression,OptionalChaining: equivalent — see above; in Node this branch is never reached because the line above returns
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return fallbackUuidV4();
}
import { EMPTY_LINEAGE } from "@nodetool-ai/protocol";
import { tryProjectLineageKey, type Scope } from "./correlation-analysis.js";

// ---------------------------------------------------------------------------
// MessageEnvelope
// ---------------------------------------------------------------------------

export interface MessageEnvelope {
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: number; // epoch ms
  event_id: string;
  correlation_lineage: CorrelationLineage;
  source_edge_id: string;
}

export interface PutOptions {
  metadata?: Record<string, unknown>;
  correlation_lineage?: CorrelationLineage;
  source_edge_id?: string;
}

function makeEnvelope(
  data: unknown,
  opts: PutOptions = {}
): MessageEnvelope {
  return {
    data,
    metadata: opts.metadata ?? {},
    timestamp: Date.now(),
    event_id: randomUUID(),
    correlation_lineage: opts.correlation_lineage ?? EMPTY_LINEAGE,
    source_edge_id: opts.source_edge_id ?? ""
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
  // Stryker disable next-line ArrayDeclaration: a non-empty seed is equivalent — a bogus handle has no matching buffer entry and is skipped by tryPopAny's stale guard
  private _arrival: string[] = [];

  /** Optional per-handle buffer capacity. */
  private _bufferLimit: number | null;

  /**
   * Pending-key safety limits. Default to conservative finite values so the
   * correlated scheduler cannot accumulate unbounded buckets when an upstream
   * close is missing. Hitting either is a terminal execution error. §6.
   */
  private _maxPendingKeys: number;
  private _maxPendingMessagesPerKey: number;

  /** Flag: inbox is closed (no more data accepted). */
  private _closed = false;

  /** Waiters: consumers blocking for new data. */
  private _waiters: Array<Deferred<void>> = [];

  /** Waiters: producers blocking when buffer is full. */
  private _putWaiters: Array<Deferred<void>> = [];

  /**
   * Per-(source_edge_id, projected lineage key) record of `lineage_done`
   * signals. The projection is canonical (root=index in scope order) so
   * lookup is unaffected by JavaScript object property order. §6.
   */
  private _doneByEdge = new Map<string, Set<string>>();

  /**
   * Per-(source_edge_id, parent lineage key) → set of closed root ids.
   * Used by `lineage_scope_closed`. §6.
   */
  private _closedByEdge = new Map<string, Map<string, Set<string>>>();

  /**
   * Per-handle set of source edge ids that have ever emitted a signal we
   * recorded. Lets the actor query "did any contributor announce a
   * close/done?" without scanning every edge.
   */
  private _signalEdgesByHandle = new Map<string, Set<string>>();

  constructor(
    bufferLimit: number | null = null,
    opts: {
      maxPendingKeys?: number;
      maxPendingMessagesPerKey?: number;
    } = {}
  ) {
    this._bufferLimit = bufferLimit;
    this._maxPendingKeys = opts.maxPendingKeys ?? 10_000;
    this._maxPendingMessagesPerKey = opts.maxPendingMessagesPerKey ?? 10_000;
  }

  /** Configured pending-key limit (read by the actor for diagnostics). */
  get maxPendingKeys(): number {
    return this._maxPendingKeys;
  }

  /** Configured per-key message limit. */
  get maxPendingMessagesPerKey(): number {
    return this._maxPendingMessagesPerKey;
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
    opts: PutOptions = {}
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
        // Stryker disable next-line OptionalChaining: the buffer was auto-created above, so get(handle) is always defined here — the ?. is defensive
        (this._buffers.get(handle)?.length ?? 0) >= this._bufferLimit
      ) {
        const d = deferred<void>();
        this._putWaiters.push(d);
        await d.promise;
      }
      if (this._closed) return;
    }

    const envelope = makeEnvelope(item, opts);
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
   * Record a `lineage_done` signal: this source edge will not produce a value
   * for `signal.lineage` on `signal.output`.
   *
   * The lineage is canonicalized against the supplied static scope so lookups
   * are order-independent. If `scope` is empty the lineage projects to the
   * empty key, which matches "source edge done at the root scope".
   *
   * `handle` is the inbox's target handle for the edge. The actor uses this
   * to decide which firings to drop or propagate.
   */
  signalLineageDone(
    handle: string,
    signal: LineageDone,
    scope: Scope
  ): void {
    const key = tryProjectLineageKey(signal.lineage, scope);
    const finalKey = key ?? "";
    let set = this._doneByEdge.get(signal.source_edge_id);
    if (!set) {
      set = new Set();
      this._doneByEdge.set(signal.source_edge_id, set);
    }
    set.add(finalKey);
    this._registerSignalEdge(handle, signal.source_edge_id);
    this._notifyWaiters();
  }

  /**
   * Record a `lineage_scope_closed` signal: this source edge will not produce
   * any more descendants for `signal.closed_root` under
   * `signal.parent_lineage` on `signal.output`.
   *
   * Like `signalLineageDone`, the parent lineage is canonicalized using the
   * supplied static parent scope.
   */
  signalLineageScopeClosed(
    handle: string,
    signal: LineageScopeClosed,
    parentScope: Scope
  ): void {
    const key = tryProjectLineageKey(signal.parent_lineage, parentScope);
    const finalKey = key ?? "";
    let perEdge = this._closedByEdge.get(signal.source_edge_id);
    if (!perEdge) {
      perEdge = new Map();
      this._closedByEdge.set(signal.source_edge_id, perEdge);
    }
    let roots = perEdge.get(finalKey);
    if (!roots) {
      roots = new Set();
      perEdge.set(finalKey, roots);
    }
    roots.add(signal.closed_root);
    this._registerSignalEdge(handle, signal.source_edge_id);
    this._notifyWaiters();
  }

  /**
   * True if the given source edge has emitted `lineage_done` for `lineageKey`.
   * `lineageKey` is the canonical projection produced by `projectLineageKey`.
   */
  isEdgeDoneFor(sourceEdgeId: string, lineageKey: string): boolean {
    return this._doneByEdge.get(sourceEdgeId)?.has(lineageKey) ?? false;
  }

  /**
   * True if `closed_root` has been closed under `parentKey` for the given
   * source edge.
   */
  isScopeClosedFor(
    sourceEdgeId: string,
    parentKey: string,
    closedRoot: string
  ): boolean {
    return (
      this._closedByEdge.get(sourceEdgeId)?.get(parentKey)?.has(closedRoot) ??
      false
    );
  }

  /**
   * Source edge ids that have emitted at least one lineage signal targeting
   * `handle`. Used by the close-barrier machinery to enumerate contributors
   * that have already announced something.
   */
  signalEdgesForHandle(handle: string): ReadonlySet<string> {
    return this._signalEdgesByHandle.get(handle) ?? new Set<string>();
  }

  private _registerSignalEdge(handle: string, edgeId: string): void {
    let set = this._signalEdgesByHandle.get(handle);
    if (!set) {
      set = new Set();
      this._signalEdgesByHandle.set(handle, set);
    }
    set.add(edgeId);
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
      // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: defensive stale guard — _removeFromArrival keeps the arrival queue in lock-step with buffers, so the head is always backed by a non-empty buffer; the empty/undefined case is unreachable
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

  /** All handle names registered on this inbox. */
  handles(): string[] {
    return [...this._buffers.keys()];
  }

  /**
   * Drain and return every buffered envelope for a handle, releasing
   * backpressure on blocked producers and clearing arrival entries.
   */
  drainHandle(handle: string): MessageEnvelope[] {
    const buf = this._buffers.get(handle);
    if (!buf?.length) return [];
    const drained = buf.splice(0);
    this._arrival = this._arrival.filter((h) => h !== handle);
    this._notifyPutWaiters();
    return drained;
  }

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
    // Stryker disable next-line ConditionalExpression,BooleanLiteral: equivalent — _isHandleDone is only consulted after the iterator's buffered-data branch, so `buf` is always empty here; forcing `empty` true changes nothing
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
   * Resolve when the inbox is next notified of activity — a `put`, `prepend`,
   * lineage signal, `markSourceDone`, or `closeAll`. Yields nothing: unlike the
   * iterators, a close that produces no envelope still wakes the caller. Used by
   * consumers that manage their own draining (the controlled-node wait) and must
   * re-check handle state after an upstream close arrives while blocked.
   */
  async waitForActivity(): Promise<void> {
    await this._waitForData();
  }

  /**
   * Remove the first occurrence of `handle` from the arrival queue.
   * Called after consuming from a specific handle.
   */
  private _removeFromArrival(handle: string): void {
    const idx = this._arrival.indexOf(handle);
    // Stryker disable next-line ConditionalExpression: forcing this true is equivalent — _removeFromArrival is only called right after consuming a buffered item, so the handle is always present (idx >= 0); the guard is defensive against an idx === -1 that cannot occur
    if (idx >= 0) {
      this._arrival.splice(idx, 1);
    }
  }
}
