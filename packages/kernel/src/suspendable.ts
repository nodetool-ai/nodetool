/**
 * Suspendable node support for resumable workflows.
 *
 * Port of src/nodetool/workflows/suspendable_node.py.
 *
 * Enables nodes to suspend workflow execution, save state, and resume later.
 * Use cases: human-in-the-loop, external callbacks, scheduled resumption.
 */

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.kernel.suspendable");

/**
 * Control-flow error raised when a node suspends workflow execution.
 * The runner catches this and performs cleanup + state persistence.
 */
export class WorkflowSuspendedError extends Error {
  readonly nodeId: string;
  readonly reason: string;
  readonly state: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;

  constructor(opts: {
    nodeId: string;
    reason: string;
    state: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    super(`Workflow suspended at node ${opts.nodeId}: ${opts.reason}`);
    this.name = "WorkflowSuspendedError";
    this.nodeId = opts.nodeId;
    this.reason = opts.reason;
    this.state = opts.state;
    this.metadata = opts.metadata ?? {};
  }

  toDict(): Record<string, unknown> {
    return {
      node_id: this.nodeId,
      reason: this.reason,
      state: this.state,
      metadata: this.metadata
    };
  }
}

/**
 * Mixin interface for suspendable node capabilities.
 * Nodes implementing this can suspend and resume workflow execution.
 */
export interface SuspendableNode {
  /** Whether this node supports suspension. */
  isSuspendable(): boolean;

  /** Whether this node is resuming from a previous suspension. */
  isResuming(): boolean;

  /** Get the state saved during suspension. Throws if not resuming. */
  getSavedState(): Record<string, unknown>;

  /**
   * Suspend workflow execution at this node.
   * @throws WorkflowSuspendedError — always (control flow exception)
   */
  suspendWorkflow(
    reason: string,
    state: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): never;

  /**
   * Update the state of a suspended node (called externally, e.g. via API).
   */
  updateSuspendedState(updates: Record<string, unknown>): void;
}

/**
 * Default implementation of SuspendableNode state management.
 * Can be mixed into any node executor.
 */
export class SuspendableState implements SuspendableNode {
  private _nodeId: string;
  private _isResuming = false;
  private _savedState: Record<string, unknown> | null = null;
  /** Sequence number from the last suspension event. */
  public eventSeq: number | null = null;

  constructor(nodeId: string) {
    this._nodeId = nodeId;
  }

  isSuspendable(): boolean {
    return true;
  }

  isResuming(): boolean {
    return this._isResuming;
  }

  getSavedState(): Record<string, unknown> {
    if (!this._isResuming) {
      throw new Error(
        "getSavedState() can only be called when resuming from suspension"
      );
    }
    if (this._savedState === null) {
      log.warn("No saved state found for suspended node", {
        nodeId: this._nodeId
      });
      return {};
    }
    return this._savedState;
  }

  suspendWorkflow(
    reason: string,
    state: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): never {
    log.info("Suspending workflow at node", {
      nodeId: this._nodeId,
      reason,
      stateKeys: Object.keys(state)
    });
    throw new WorkflowSuspendedError({
      nodeId: this._nodeId,
      reason,
      state,
      metadata
    });
  }

  updateSuspendedState(updates: Record<string, unknown>): void {
    if (!this._isResuming) {
      log.warn("updateSuspendedState called on non-suspended node");
    }
    if (this._savedState === null) {
      this._savedState = {};
    }
    Object.assign(this._savedState, updates);
    log.info("Updated suspended state", {
      nodeId: this._nodeId,
      keys: Object.keys(updates)
    });
  }

  /**
   * Internal: set resumption state (called by the workflow runner).
   */
  setResumingState(
    savedState: Record<string, unknown>,
    eventSeq: number
  ): void {
    this._isResuming = true;
    this._savedState = savedState;
    this.eventSeq = eventSeq;
    log.debug("Node set to resuming mode", {
      nodeId: this._nodeId,
      eventSeq,
      stateKeys: Object.keys(savedState)
    });
  }
}
