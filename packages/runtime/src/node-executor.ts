/**
 * NodeExecutor interface – implemented by nodes that can be executed in the kernel.
 *
 * Defined here (in @nodetool-ai/runtime) so that @nodetool-ai/kernel can import it
 * without creating a circular dependency.  @nodetool-ai/kernel re-exports this
 * interface for backward compatibility.
 */

import type { ProcessingContext } from "./context.js";

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
  correlation_lineage: Record<string, { index: number }>;
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
  emit(slot: string, value: unknown, opts?: { lineage?: Record<string, { index: number }> }): Promise<void>;
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

  /** Called before process/genProcess. */
  preProcess?(): Promise<void>;

  /** Called after process/genProcess completes. */
  finalize?(): Promise<void>;

  /** Called once during graph initialization. */
  initialize?(): Promise<void>;
}
