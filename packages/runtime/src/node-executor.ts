/**
 * NodeExecutor interface – implemented by nodes that can be executed in the kernel.
 *
 * Defined here (in @nodetool-ai/runtime) so that @nodetool-ai/kernel can import it
 * without creating a circular dependency.  @nodetool-ai/kernel re-exports this
 * interface for backward compatibility.
 */

import type { ProcessingContext } from "./context.js";
import type { CorrelationLineage } from "@nodetool-ai/protocol";

// ---------------------------------------------------------------------------
// Streaming I/O interfaces (implemented by NodeInputs / NodeOutputs in kernel)
// ---------------------------------------------------------------------------

/**
 * Read-side interface for streaming input nodes.
 * Nodes call stream() or any() to consume incoming data.
 *
 * The `*WithEnvelope` variants expose correlation lineage and source edge
 * ids; explicit join nodes (Zip/Cross) and forwarding nodes use them to
 * preserve §3 lineage downstream.
 */
export interface StreamingInputs {
  /** Yield items for a single handle until EOS. */
  stream(name: string): AsyncGenerator<unknown>;
  /** Yield MessageEnvelopes for a single handle until EOS. §5. */
  streamWithEnvelope(name: string): AsyncGenerator<MessageEnvelopeLike>;
  /** Yield [handle, item] tuples in arrival order across all handles. */
  any(): AsyncGenerator<[string, unknown]>;
  /** Yield [handle, MessageEnvelope] tuples in arrival order. */
  anyWithEnvelope(): AsyncGenerator<[string, MessageEnvelopeLike]>;
  /** Return the first available item for a handle, or default if EOS. */
  first(name: string, defaultValue?: unknown): Promise<unknown>;

  /**
   * Static scope (ordered iteration roots, outermost first) for a connected
   * input handle. Returns `[]` if the handle has no static scope (constant /
   * config edge), or if correlation analysis was not run.
   *
   * Used by join nodes (§7) to identify each side's differing iteration root
   * and project to the common parent prefix.
   */
  scopeFor(handle: string): ReadonlyArray<string>;

  /**
   * The node's invocation scope — the largest non-empty input scope under the
   * legacy comparable-prefix rule, or the longest common parent prefix on
   * join nodes (§7). `[]` when analysis is off or the node has no inputs.
   */
  invocationScope(): ReadonlyArray<string>;

  /**
   * True if the handle has at least one open upstream source. Distinguishes
   * patched from unpatched optional streaming inputs (upstream counts are
   * registered before actors start, so this is race-free at the top of
   * `run()`).
   */
  hasStream(name: string): boolean;

  /**
   * Aborted when the run is cancelled. Producers that emit without waiting
   * on inputs (generators, wall-clock pacers) must observe it — inbox
   * closure only unblocks consumers, it does not stop a producing loop.
   */
  readonly signal: AbortSignal;
}

/**
 * Minimal MessageEnvelope shape visible to nodes. Mirrors
 * `kernel/inbox.MessageEnvelope` without forcing runtime to import kernel
 * (kernel depends on runtime, not the other way around).
 */
export interface MessageEnvelopeLike {
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: number;
  event_id: string;
  // Reuse the protocol's `CorrelationLineage` (a `Readonly<Record<...>>`)
  // so node-visible envelopes are typed consistently with the on-wire
  // shape and mutation is discouraged at the type level.
  correlation_lineage: CorrelationLineage;
  source_edge_id: string;
}

/**
 * Write-side interface for streaming output from within a run() method.
 * Nodes call emit() to push partial results downstream immediately.
 *
 * `forward` copies an envelope's correlation lineage onto the emitted value
 * — essential for stream nodes that act as filters/passthroughs. `drop`
 * sends `lineage_done` for the source key so downstream joins do not wait
 * on a key that was deliberately not emitted. §5.
 */
export interface StreamingOutputs {
  /** Emit a value to a named output slot. */
  emit(slot: string, value: unknown, opts?: { lineage?: CorrelationLineage }): Promise<void>;
  /**
   * Emit a frame of grouped values atomically. Every sibling handle that
   * shares an iteration group (same root id) receives the **same** minted
   * token, so a Zip pair (`{ left, right, index }`) is one logical item
   * downstream — not three independent items with different tokens. §1.
   *
   * Non-iteration handles in `values` inherit the supplied `opts.lineage`
   * (or the actor's ambient invocation lineage if omitted).
   */
  emitGroup(
    values: Record<string, unknown>,
    opts?: { lineage?: CorrelationLineage }
  ): Promise<void>;
  /** Forward an envelope's lineage to `slot`. §5. */
  forward(
    slot: string,
    envelope: MessageEnvelopeLike,
    ...overrideValue: [] | [unknown]
  ): Promise<void>;
  /** Send `lineage_done` for `slot` at the envelope's projected key. §5. */
  drop(slot: string, envelope: MessageEnvelopeLike): Promise<void>;
  /** Signal early end-of-stream for a specific output slot. */
  complete(slot: string): void;
}

// ---------------------------------------------------------------------------
// Trigger entry point
// ---------------------------------------------------------------------------

/**
 * The event that woke a workflow. Delivered to a trigger node's
 * `emitTriggerEvent` entry point when a run starts because this event fired,
 * instead of the node running its live-listen loop. `node_id` identifies the
 * target trigger node in the graph; `input_id` is the durable, idempotent id
 * of the stored `trigger_input`.
 */
export interface TriggerEvent {
  node_id: string;
  payload: unknown;
  input_id: string;
}

// ---------------------------------------------------------------------------
// Node execution interface (implemented by actual node classes)
// ---------------------------------------------------------------------------

export interface NodeExecutor {
  /** One-shot processing (buffered mode). */
  process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>>;

  /**
   * Generator processing (streaming output mode).
   * Each yielded record is a partial output batch.
   */
  genProcess?(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>>;

  /**
   * Streaming input+output processing.
   * Called for nodes with isStreamingInput=true that implement this method.
   * The node drains inputs via `inputs.stream()` / `inputs.any()` and
   * pushes results via `outputs.emit()`.
   */
  run?(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void>;

  /**
   * Trigger entry point. Called instead of run()/genProcess()/process() when
   * the run carries a `trigger_event` targeting this node. The node emits the
   * event payload on its declared output slots and returns.
   */
  emitTriggerEvent?(
    event: TriggerEvent,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void>;

  /**
   * Apply property updates to a live executor instance. Long-running
   * streaming nodes (synth generators, realtime effects) that read their
   * properties per chunk pick the new values up on the next chunk —
   * the basis for live parameter changes while a patch is running.
   */
  applyProperties?(properties: Record<string, unknown>): void;

  /** Called before process/genProcess. */
  preProcess?(): Promise<void>;

  /** Called after process/genProcess completes. */
  finalize?(): Promise<void>;

  /** Called once during graph initialization. */
  initialize?(): Promise<void>;
}
