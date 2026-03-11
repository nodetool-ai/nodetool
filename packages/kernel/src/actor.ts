/**
 * NodeActor – per-node asynchronous execution.
 *
 * Port of src/nodetool/workflows/actor.py.
 *
 * Execution modes:
 *   1. Buffered: gather all inputs, call process() once.
 *   2. Streaming input: node drains inbox via iterInput / iterAny.
 *   3. Streaming output: call genProcess() which yields items.
 *   4. Controlled: accept control events, cache inputs for replay.
 *
 * Sync modes:
 *   - on_any: fire when ANY input handle has data.
 *   - zip_all: wait until ALL handles have data (with sticky semantics).
 */

import { createLogger } from "@nodetool/config";
import type { NodeDescriptor, ControlEvent } from "@nodetool/protocol";

const log = createLogger("nodetool.kernel.actor");
import type { ProcessingContext } from "@nodetool/runtime";
import { NodeInbox } from "./inbox.js";

// ---------------------------------------------------------------------------
// Node execution interface (to be implemented by actual node classes)
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

// ---------------------------------------------------------------------------
// Actor result
// ---------------------------------------------------------------------------

export interface ActorResult {
  outputs: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// NodeActor
// ---------------------------------------------------------------------------

export class NodeActor {
  readonly node: NodeDescriptor;
  readonly inbox: NodeInbox;
  private _executor: NodeExecutor;

  /** Cached inputs for controlled-node replay. */
  private _cachedInputs: Record<string, unknown> | null = null;

  /** Properties from the latest control event. */
  private _currentControlProperties: Record<string, unknown> = {};

  /** Latest execution result. */
  private _latestResult: Record<string, unknown> | null = null;

  /** Collected non-null outputs for streaming-output nodes. */
  private _streamingCollectedOutputs: Record<string, unknown> | null = null;

  /** Handles that are sticky from the start (non-streaming edges). */
  private _initialStickyHandles: Set<string>;

  /** Callback to route outputs downstream. */
  private _sendOutputs: (
    nodeId: string,
    outputs: Record<string, unknown>
  ) => Promise<void>;

  /** Callback to emit processing messages (NodeUpdate, etc.). */
  private _emitMessage: (msg: unknown) => void;
  /** Optional execution context passed into node executors. */
  private _executionContext: ProcessingContext | undefined;

  constructor(opts: {
    node: NodeDescriptor;
    inbox: NodeInbox;
    executor: NodeExecutor;
    sendOutputs: (
      nodeId: string,
      outputs: Record<string, unknown>
    ) => Promise<void>;
    emitMessage: (msg: unknown) => void;
    executionContext?: ProcessingContext;
    stickyHandles?: Set<string>;
  }) {
    this.node = opts.node;
    this.inbox = opts.inbox;
    this._executor = opts.executor;
    this._sendOutputs = opts.sendOutputs;
    this._emitMessage = opts.emitMessage;
    this._executionContext = opts.executionContext;
    this._initialStickyHandles = opts.stickyHandles ?? new Set();
  }

  // -----------------------------------------------------------------------
  // Main execution entry point
  // -----------------------------------------------------------------------

  /**
   * Run the actor to completion.
   * Returns the last outputs produced.
   */
  async run(): Promise<ActorResult> {
    let errorMessage: string | undefined;
    try {
      log.debug("Actor started", { nodeId: this.node.id, type: this.node.type });
      this._emitNodeStatus("running");

      if (this._executor.preProcess) {
        await this._executor.preProcess();
      }

      // Determine execution mode
      if (this.node.is_streaming_input) {
        // Streaming input mode: the node itself drains the inbox.
        // We just call process() once with an empty input map;
        // the node uses iter_input / iter_any internally.
        const outputs = await this._executor.process({}, this._executionContext);
        this._latestResult = outputs;
        await this._sendOutputs(this.node.id, outputs);
      } else if (this.node.is_controlled) {
        // Controlled mode: wait for control events from inbox
        await this._runControlled();
      } else {
        // Standard buffered or streaming-output mode
        await this._runBuffered();
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      log.error("Actor failed", { nodeId: this.node.id, type: this.node.type, error: errorMessage });
    } finally {
      // Always finalize, even on error (Python parity: gap #13)
      if (this._executor.finalize) {
        try {
          await this._executor.finalize();
        } catch {
          // Swallow finalize errors — don't mask original error
        }
      }
    }

    if (errorMessage !== undefined) {
      this._emitNodeStatus("error", undefined, errorMessage);
      return { outputs: {}, error: errorMessage };
    }

    log.debug("Actor completed", { nodeId: this.node.id, type: this.node.type });
    this._emitNodeStatus("completed", this._latestResult ?? {});
    return { outputs: this._latestResult ?? {} };
  }

  // -----------------------------------------------------------------------
  // Execution modes
  // -----------------------------------------------------------------------

  /**
   * Buffered / streaming-output execution.
   * Gathers inputs per sync_mode, then runs process or genProcess.
   */
  private async _runBuffered(): Promise<void> {
    const syncMode = this.node.sync_mode ?? "on_any";
    const inputHandles = [...this.inbox["_buffers"].keys()].filter(
      (h) => h !== "__control__"
    );

    // Source nodes with no data inputs should execute once with empty inputs.
    if (inputHandles.length === 0) {
      await this._executeWithInputs({});
      return;
    }

    if (syncMode === "on_any") {
      return this._runOnAny(inputHandles);
    }

    // zip_all: keep gathering input batches until inbox is drained
    while (true) {
      const inputs = await this._gatherZipAll();
      if (inputs === null) break;

      await this._executeWithInputs(inputs);

      if (this.inbox.isFullyDrained()) break;
    }
  }

  /**
   * on_any execution: wait for all handles to have at least one value,
   * then fire. After initial fire, each subsequent item fires immediately.
   */
  private async _runOnAny(inputHandles: string[]): Promise<void> {
    const current: Record<string, unknown> = {};
    const pendingHandles = new Set(inputHandles);
    let initialFired = false;

    for await (const [handle, item] of this.inbox.iterAny()) {
      if (handle === "__control__") continue;

      current[handle] = item;

      if (!initialFired) {
        pendingHandles.delete(handle);
        if (pendingHandles.size > 0) continue;
        await this._executeWithInputs({ ...current });
        initialFired = true;
      } else {
        await this._executeWithInputs({ ...current });
      }
    }
  }

  /**
   * Execute process or genProcess with the given inputs.
   */
  private async _executeWithInputs(
    inputs: Record<string, unknown>
  ): Promise<void> {
    log.info("Executing node", {
      nodeId: this.node.id,
      type: this.node.type,
      syncMode: this.node.sync_mode ?? "on_any",
      inputHandles: Object.keys(inputs),
    });

    if (this.node.is_streaming_output && this._executor.genProcess) {
      this._streamingCollectedOutputs = {};
      for await (const partial of this._executor.genProcess(
        inputs,
        this._executionContext
      )) {
        const routed = this._filterStreamingPartial(partial);
        if (Object.keys(routed).length === 0) continue;
        Object.assign(this._streamingCollectedOutputs, routed);
        this._latestResult = { ...this._streamingCollectedOutputs };
        await this._sendOutputs(this.node.id, routed);
      }
      this._latestResult = { ...(this._streamingCollectedOutputs ?? {}) };
    } else {
      const outputs = await this._executor.process(
        inputs,
        this._executionContext
      );
      this._latestResult = outputs;
      await this._sendOutputs(this.node.id, outputs);
    }
  }

  /**
   * Controlled execution: wait for control events on __control__ handle.
   */
  private async _runControlled(): Promise<void> {
    for await (const [handle, item] of this.inbox.iterAny()) {
      if (handle === "__control__") {
        const event = item as ControlEvent;
        if (event.event_type === "stop") {
          break;
        }
        if (event.event_type === "run") {
          this._currentControlProperties = event.properties;
          // Apply control properties as inputs override
          const inputs = this._cachedInputs ?? {};
          const merged = { ...inputs, ...this._currentControlProperties };
          const outputs = await this._executor.process(
            merged,
            this._executionContext
          );
          this._latestResult = outputs;
          await this._sendOutputs(this.node.id, outputs);
        }
      } else {
        // Data input on a controlled node – cache for replay
        if (!this._cachedInputs) this._cachedInputs = {};
        this._cachedInputs[handle] = item;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Input gathering (sync modes)
  // -----------------------------------------------------------------------

  /**
   * zip_all: wait until every registered handle has at least one item,
   * using "sticky" semantics for handles that have no more upstream.
   */
  private _stickyValues: Record<string, unknown> = {};

  private async _gatherZipAll(): Promise<Record<string, unknown> | null> {
    const handles = [...this.inbox["_buffers"].keys()].filter(
      (h) => h !== "__control__"
    );

    if (handles.length === 0) return null;

    const result: Record<string, unknown> = {};
    let gotNew = false;

    for (const handle of handles) {
      if (this.inbox.hasBuffered(handle)) {
        const popped = this._popHandle(handle);
        if (popped !== undefined) {
          result[handle] = popped;
          this._stickyValues[handle] = popped;
          gotNew = true;
          continue;
        }
      }

      // Use sticky value if handle is closed or marked sticky from streaming analysis
      const isSticky = !this.inbox.isOpen(handle) || this._initialStickyHandles.has(handle);
      if (isSticky && handle in this._stickyValues) {
        result[handle] = this._stickyValues[handle];
        continue;
      }

      // Handle still open but no data yet – wait
      if (this.inbox.isOpen(handle)) {
        const gen = this.inbox.iterInput(handle);
        const next = await gen.next();
        if (next.done) {
          // EOS – use sticky if available
          if (handle in this._stickyValues) {
            result[handle] = this._stickyValues[handle];
            continue;
          }
          return null; // no sticky, no data
        }
        result[handle] = next.value;
        this._stickyValues[handle] = next.value;
        gotNew = true;
        await gen.return(undefined);
        continue;
      }

      // Handle closed, no sticky
      if (!(handle in this._stickyValues)) {
        return null;
      }
      result[handle] = this._stickyValues[handle];
    }

    if (!gotNew) return null; // all sticky, no new data
    return result;
  }

  /**
   * Pop a single item from a specific handle's buffer.
   */
  private _popHandle(handle: string): unknown | undefined {
    const buf = this.inbox["_buffers"].get(handle);
    if (!buf || buf.length === 0) return undefined;
    const envelope = buf.shift()!;
    return envelope.data;
  }

  // -----------------------------------------------------------------------
  // Status helpers
  // -----------------------------------------------------------------------

  private _emitNodeStatus(
    status: string,
    result?: Record<string, unknown>,
    error?: string
  ): void {
    this._emitMessage({
      type: "node_update",
      node_id: this.node.id,
      node_name: this.node.name ?? this.node.type,
      node_type: this.node.type,
      status,
      result: result ?? null,
      error: error ?? null,
      properties:
        this.node.properties && typeof this.node.properties === "object"
          ? (this.node.properties as Record<string, unknown>)
          : null,
    });
  }

  private _filterStreamingPartial(
    partial: Record<string, unknown>
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(partial)) {
      if (value === null || value === undefined) continue;
      filtered[key] = value;
    }
    return filtered;
  }
}
