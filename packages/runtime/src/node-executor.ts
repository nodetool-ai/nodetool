/**
 * NodeExecutor interface – implemented by nodes that can be executed in the kernel.
 *
 * Defined here (in @nodetool/runtime) so that @nodetool/kernel can import it
 * without creating a circular dependency.  @nodetool/kernel re-exports this
 * interface for backward compatibility.
 */

import type { ProcessingContext } from "./context.js";

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

  /** Called before process/genProcess. */
  preProcess?(): Promise<void>;

  /** Called after process/genProcess completes. */
  finalize?(): Promise<void>;

  /** Called once during graph initialization. */
  initialize?(): Promise<void>;
}
