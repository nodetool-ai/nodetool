/**
 * NodeInputs / NodeOutputs – node I/O convenience wrappers.
 *
 * Port of src/nodetool/workflows/io.py.
 *
 * NodeInputs wraps a NodeInbox for reading inputs in node implementations.
 * NodeOutputs provides an emit-based output interface backed by callbacks
 * supplied by the actor/runner, decoupled from WorkflowRunner internals.
 */

import type { CorrelationLineage } from "@nodetool-ai/protocol";
import type { MessageEnvelope } from "./inbox.js";
import { NodeInbox } from "./inbox.js";

export class NodeInputs {
  private _inbox: NodeInbox;
  private _envelopeTracker: Map<string, MessageEnvelope> | null;

  /**
   * `envelopeTracker`, when provided, records the most recently consumed
   * envelope per handle. The actor passes its own `_lastEnvelopes` map so
   * raw `stream()`/`first()`/`any()` consumers still surface lineage to the
   * actor — that's how unmigrated stream filters (Take, Drop, Filter*)
   * inherit lineage even when they call `outputs.emit()` with no options.
   */
  constructor(
    inbox: NodeInbox,
    envelopeTracker?: Map<string, MessageEnvelope> | null
  ) {
    this._inbox = inbox;
    this._envelopeTracker = envelopeTracker ?? null;
  }

  /**
   * Return the first available item for a handle, or default if EOS.
   */
  async first(name: string, defaultValue?: unknown): Promise<unknown> {
    for await (const envelope of this._inbox.iterInputWithEnvelope(name)) {
      this._envelopeTracker?.set(name, envelope);
      return envelope.data;
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
      this._envelopeTracker?.set(name, envelope);
      return envelope;
    }
    return defaultValue;
  }

  /**
   * Async generator: yields items until EOS. The most recent envelope per
   * handle is recorded so the actor can derive invocation lineage.
   */
  async *stream(name: string): AsyncGenerator<unknown> {
    for await (const envelope of this._inbox.iterInputWithEnvelope(name)) {
      this._envelopeTracker?.set(name, envelope);
      yield envelope.data;
    }
  }

  /**
   * Async generator: yields MessageEnvelopes until EOS.
   */
  async *streamWithEnvelope(name: string): AsyncGenerator<MessageEnvelope> {
    for await (const envelope of this._inbox.iterInputWithEnvelope(name)) {
      this._envelopeTracker?.set(name, envelope);
      yield envelope;
    }
  }

  /**
   * Async generator: yields [handle, item] tuples in arrival order.
   */
  async *any(): AsyncGenerator<[string, unknown]> {
    for await (const [handle, envelope] of this._inbox.iterAnyWithEnvelope()) {
      this._envelopeTracker?.set(handle, envelope);
      yield [handle, envelope.data];
    }
  }

  /**
   * Async generator: yields [handle, MessageEnvelope] tuples.
   */
  async *anyWithEnvelope(): AsyncGenerator<[string, MessageEnvelope]> {
    for await (const [handle, envelope] of this._inbox.iterAnyWithEnvelope()) {
      this._envelopeTracker?.set(handle, envelope);
      yield [handle, envelope];
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

export interface EmitOptions {
  /**
   * Override the lineage propagated downstream for this emission.
   * Used by `outputs.forward()` to copy the source envelope's lineage; can be
   * supplied directly when a stream node mints lineage itself.
   */
  lineage?: CorrelationLineage;
}

export interface NodeOutputsOptions {
  /**
   * Called for each emitted (slot, value) pair to route the value downstream.
   * If not provided, outputs are only collected locally.
   *
   * `opts.lineage` is forwarded to the inbox `put()` call so the downstream
   * envelope carries the correct correlation lineage.
   */
  sendFn?: (
    slot: string,
    value: unknown,
    opts?: EmitOptions
  ) => Promise<void>;

  /**
   * Called when complete(slot) is invoked to signal early EOS on a slot.
   */
  eosCallback?: (slot: string) => void;

  /**
   * Send `lineage_done` for `slot` at the projected key carried by
   * `envelope`. Plumbed in PR 3 when correlated scheduling lands.
   */
  dropFn?: (slot: string, envelope: MessageEnvelope) => Promise<void>;
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
  private _sendFn:
    | ((slot: string, value: unknown, opts?: EmitOptions) => Promise<void>)
    | null;
  private _eosCallback: ((slot: string) => void) | null;
  private _dropFn:
    | ((slot: string, envelope: MessageEnvelope) => Promise<void>)
    | null;

  constructor(opts: NodeOutputsOptions = {}) {
    this._sendFn = opts.sendFn ?? null;
    this._eosCallback = opts.eosCallback ?? null;
    this._dropFn = opts.dropFn ?? null;
  }

  /**
   * Emit a value to a named output slot.
   * Routes downstream via sendFn (if set) and collects the last value per slot.
   * An empty or null slot name defaults to "output".
   *
   * If `opts.lineage` is provided, that lineage is propagated to the
   * downstream envelope; otherwise the actor's ambient invocation lineage is
   * used.
   */
  async emit(
    slot: string,
    value: unknown,
    opts?: EmitOptions
  ): Promise<void> {
    const resolvedSlot = slot || "output";
    this._collected[resolvedSlot] = value;
    if (this._sendFn) {
      await this._sendFn(resolvedSlot, value, opts);
    }
  }

  /**
   * Convenience: emit to the "output" slot.
   */
  async default(value: unknown): Promise<void> {
    await this.emit("output", value);
  }

  /**
   * Forward an envelope to `slot`, preserving its correlation lineage.
   *
   * With two arguments, the envelope's `data` is forwarded unchanged. With
   * three arguments, the caller-supplied value replaces it — including
   * `null`/`undefined`, which would otherwise be indistinguishable from
   * "not supplied" if we used `??`.
   */
  async forward(
    slot: string,
    envelope: MessageEnvelope,
    ...overrideValue: [] | [unknown]
  ): Promise<void> {
    const value =
      overrideValue.length > 0 ? overrideValue[0] : envelope.data;
    await this.emit(slot, value, {
      lineage: envelope.correlation_lineage
    });
  }

  /**
   * Send `lineage_done` for `slot` at the projected key carried by
   * `envelope`. No-op until PR 3's correlated scheduler is in place.
   */
  async drop(slot: string, envelope: MessageEnvelope): Promise<void> {
    if (this._dropFn) {
      await this._dropFn(slot || "output", envelope);
    }
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
