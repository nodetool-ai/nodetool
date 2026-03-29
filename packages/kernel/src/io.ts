/**
 * NodeInputs / NodeOutputs – node I/O convenience wrappers.
 *
 * Port of src/nodetool/workflows/io.py.
 *
 * NodeInputs wraps a NodeInbox for reading inputs in node implementations.
 * NodeOutputs provides an emit-based output interface backed by callbacks
 * supplied by the actor/runner, decoupled from WorkflowRunner internals.
 */

import type { MessageEnvelope } from "./inbox.js";
import { NodeInbox } from "./inbox.js";

export class NodeInputs {
  private _inbox: NodeInbox;

  constructor(inbox: NodeInbox) {
    this._inbox = inbox;
  }

  /**
   * Return the first available item for a handle, or default if EOS.
   */
  async first(name: string, defaultValue?: unknown): Promise<unknown> {
    for await (const item of this._inbox.iterInput(name)) {
      return item;
    }
    return defaultValue;
  }

  /**
   * Return the first available MessageEnvelope for a handle, or default if EOS.
   */
  async firstWithEnvelope(
    name: string,
    defaultValue?: unknown
  ): Promise<MessageEnvelope | unknown> {
    for await (const envelope of this._inbox.iterInputWithEnvelope(name)) {
      return envelope;
    }
    return defaultValue;
  }

  /**
   * Async generator: yields items until EOS.
   */
  async *stream(name: string): AsyncGenerator<unknown> {
    for await (const item of this._inbox.iterInput(name)) {
      yield item;
    }
  }

  /**
   * Async generator: yields MessageEnvelopes until EOS.
   */
  async *streamWithEnvelope(name: string): AsyncGenerator<MessageEnvelope> {
    for await (const envelope of this._inbox.iterInputWithEnvelope(name)) {
      yield envelope;
    }
  }

  /**
   * Async generator: yields [handle, item] tuples in arrival order.
   */
  async *any(): AsyncGenerator<[string, unknown]> {
    for await (const tuple of this._inbox.iterAny()) {
      yield tuple;
    }
  }

  /**
   * Async generator: yields [handle, MessageEnvelope] tuples.
   */
  async *anyWithEnvelope(): AsyncGenerator<[string, MessageEnvelope]> {
    for await (const tuple of this._inbox.iterAnyWithEnvelope()) {
      yield tuple;
    }
  }

  /**
   * True if handle has buffered items.
   */
  hasBuffered(name: string): boolean {
    return this._inbox.hasBuffered(name);
  }

  /**
   * True if handle has open upstream sources.
   */
  hasStream(name: string): boolean {
    return this._inbox.isOpen(name);
  }
}

// ---------------------------------------------------------------------------
// NodeOutputs
// ---------------------------------------------------------------------------

export interface NodeOutputsOptions {
  /**
   * Called for each emitted (slot, value) pair to route the value downstream.
   * If not provided, outputs are only collected locally.
   */
  sendFn?: (slot: string, value: unknown) => Promise<void>;

  /**
   * Called when complete(slot) is invoked to signal early EOS on a slot.
   */
  eosCallback?: (slot: string) => void;
}

/**
 * Emitter wrapper for routing node outputs.
 *
 * Port of src/nodetool/workflows/io.py (NodeOutputs class).
 *
 * Provides a clean emit-based interface for nodes to produce outputs.
 * Routing is decoupled via callbacks provided by the actor/runner.
 */
export class NodeOutputs {
  private _collected: Record<string, unknown> = {};
  private _sendFn: ((slot: string, value: unknown) => Promise<void>) | null;
  private _eosCallback: ((slot: string) => void) | null;

  constructor(opts: NodeOutputsOptions = {}) {
    this._sendFn = opts.sendFn ?? null;
    this._eosCallback = opts.eosCallback ?? null;
  }

  /**
   * Emit a value to a named output slot.
   * Routes downstream via sendFn (if set) and collects the last value per slot.
   * An empty or null slot name defaults to "output".
   */
  async emit(slot: string, value: unknown): Promise<void> {
    const resolvedSlot = slot || "output";
    this._collected[resolvedSlot] = value;
    if (this._sendFn) {
      await this._sendFn(resolvedSlot, value);
    }
  }

  /**
   * Convenience: emit to the "output" slot.
   */
  async default(value: unknown): Promise<void> {
    await this.emit("output", value);
  }

  /**
   * Signal early end-of-stream for a specific output slot.
   * Calls the eosCallback if provided.
   */
  complete(slot: string): void {
    if (this._eosCallback) {
      this._eosCallback(slot);
    }
  }

  /**
   * Return a snapshot of all collected outputs (slot → last emitted value).
   */
  collected(): Record<string, unknown> {
    return { ...this._collected };
  }
}
