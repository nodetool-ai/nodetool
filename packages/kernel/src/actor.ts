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
import type { ProcessingContext, NodeExecutor } from "@nodetool/runtime";
import { NodeInbox } from "./inbox.js";
import { NodeInputs, NodeOutputs } from "./io.js";

export type { NodeExecutor };

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
  /** Control context for controller nodes (injected as _control_context input). */
  private _controlContext: Record<string, unknown> | null;

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
    controlContext?: Record<string, unknown> | null;
  }) {
    this.node = opts.node;
    this.inbox = opts.inbox;
    this._executor = opts.executor;
    this._sendOutputs = opts.sendOutputs;
    this._emitMessage = opts.emitMessage;
    this._executionContext = opts.executionContext;
    this._initialStickyHandles = opts.stickyHandles ?? new Set();
    this._controlContext = opts.controlContext ?? null;
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
      log.debug("Actor started", {
        nodeId: this.node.id,
        type: this.node.type
      });
      this._emitNodeStatus("running");

      if (this._executor.preProcess) {
        await this._executor.preProcess();
      }

      // Determine execution mode
      if (this.node.is_streaming_input) {
        if (this._executor.run) {
          // Streaming input mode with run(): node drains inbox via
          // NodeInputs and pushes outputs via NodeOutputs.
          const nodeInputs = new NodeInputs(this.inbox);
          const nodeOutputs = new NodeOutputs({
            sendFn: async (slot: string, value: unknown) => {
              await this._sendOutputs(this.node.id, { [slot]: value });
            }
          });
          await this._executor.run(
            nodeInputs,
            nodeOutputs,
            this._executionContext
          );
          this._latestResult = nodeOutputs.collected();
        } else {
          // Legacy fallback: call process() once with empty inputs.
          const outputs = await this._executor.process(
            {},
            this._executionContext
          );
          this._latestResult = outputs;
          await this._sendOutputs(this.node.id, outputs);
        }
      } else if (this.node.is_controlled) {
        // Controlled mode: wait for control events from inbox
        await this._runControlled();
      } else {
        // Standard buffered or streaming-output mode
        await this._runBuffered();
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      log.error("Actor failed", {
        nodeId: this.node.id,
        type: this.node.type,
        error: errorMessage
      });
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

    log.debug("Actor completed", {
      nodeId: this.node.id,
      type: this.node.type
    });
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
    const syncMode = this.node.sync_mode ?? "zip_all";
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
    // Merge node properties as defaults — edge inputs override.
    // This matches Python's behavior where process() always receives
    // the node's own property values as baseline inputs.
    // Precedence: declared properties < dynamic_properties (user-typed) < edge inputs.
    if (this.node.properties || this.node.dynamic_properties) {
      inputs = {
        ...(this.node.properties ?? {}),
        ...(this.node.dynamic_properties ?? {}),
        ...inputs
      };
    }

    // Inject _control_context for controller nodes (Python parity:
    // process_streaming_node_with_inputs / _is_controller / _build_control_context)
    if (this._controlContext) {
      inputs = { ...inputs, _control_context: this._controlContext };
    }

    log.info("Executing node", {
      nodeId: this.node.id,
      type: this.node.type,
      syncMode: this.node.sync_mode ?? "on_any",
      inputHandles: Object.keys(inputs)
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
   *
   * Unlike the generic iterAny() approach, this iterates ONLY the
   * __control__ handle so that the loop terminates as soon as all
   * controllers signal EOS (markSourceDone). Data inputs are drained
   * from the inbox buffers before each execution and cached for replay.
   */
  private async _runControlled(): Promise<void> {
    // Identify data handles (non-control) that need to be populated
    const dataHandles = [...this.inbox["_buffers"].keys()].filter(
      (h) => h !== "__control__"
    );

    // Wait for all data handles to have at least one value before
    // processing the first control event. This ensures that when an
    // upstream node feeds data into the controlled node, the data
    // arrives before we try to execute.
    if (dataHandles.length > 0 && !this._cachedInputs) {
      await this._waitForDataInputs(dataHandles);
    }

    for await (const item of this.inbox.iterInput("__control__")) {
      const event = item as ControlEvent;
      if (event.event_type === "stop") {
        break;
      }
      if (event.event_type === "run") {
        this._currentControlProperties = event.properties;
        // Drain any buffered data inputs before processing (replay)
        this._cacheBufferedDataInputs();
        const inputs = this._cachedInputs ?? {};
        // Merge node properties as defaults (matching _executeWithInputs behavior)
        const baseProps = this.node.properties ?? {};
        const dynProps = this.node.dynamic_properties ?? {};
        const merged = {
          ...baseProps,
          ...dynProps,
          ...inputs,
          ...this._currentControlProperties
        };
        const outputs = await this._executor.process(
          merged,
          this._executionContext
        );
        this._latestResult = outputs;
        await this._sendOutputs(this.node.id, outputs);
      }
    }
  }

  /**
   * Wait until every data handle has at least one buffered value.
   * Drains items from the inbox as they arrive, caching them, until
   * all required handles are satisfied.
   */
  private async _waitForDataInputs(dataHandles: string[]): Promise<void> {
    const pending = new Set(dataHandles);

    // Check what's already buffered
    for (const handle of dataHandles) {
      if (this.inbox.hasBuffered(handle)) {
        pending.delete(handle);
      }
    }
    if (pending.size === 0) {
      this._cacheBufferedDataInputs();
      return;
    }

    // Drain items until all data handles have at least one value
    for await (const [handle, item] of this.inbox.iterAny()) {
      if (handle === "__control__") {
        // Push control events back – they'll be consumed by iterInput later
        this.inbox.prepend("__control__", {
          data: item,
          metadata: {},
          timestamp: Date.now(),
          event_id: ""
        });
        continue;
      }
      if (!this._cachedInputs) this._cachedInputs = {};
      this._cachedInputs[handle] = item;
      pending.delete(handle);
      if (pending.size === 0) break;
    }
  }

  /**
   * Drain all buffered data (non-control) inputs and cache them.
   * Called before each controlled execution to pick up any data that
   * arrived while waiting for the next control event.
   */
  private _cacheBufferedDataInputs(): void {
    const buffers = this.inbox["_buffers"] as Map<
      string,
      Array<{ data: unknown }>
    >;
    for (const [handle, buf] of buffers) {
      if (handle === "__control__" || buf.length === 0) continue;
      // Use the latest buffered value for each data handle
      while (buf.length > 0) {
        const envelope = buf.shift()!;
        if (!this._cachedInputs) this._cachedInputs = {};
        this._cachedInputs[handle] = envelope.data;
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
      const isSticky =
        !this.inbox.isOpen(handle) || this._initialStickyHandles.has(handle);
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
          : null
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
