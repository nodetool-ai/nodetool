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
 */
export interface StreamingInputs {
  /** Yield items for a single handle until EOS. */
  stream(name: string): AsyncGenerator<unknown>;
  /** Yield [handle, item] tuples in arrival order across all handles. */
  any(): AsyncGenerator<[string, unknown]>;
  /** Return the first available item for a handle, or default if EOS. */
  first(name: string, defaultValue?: unknown): Promise<unknown>;
}

/**
 * Write-side interface for streaming output from within a run() method.
 * Nodes call emit() to push partial results downstream immediately.
 */
export interface StreamingOutputs {
  /** Emit a value to a named output slot. */
  emit(slot: string, value: unknown): Promise<void>;
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
