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

import { createLogger } from "@nodetool-ai/config";
import type {
  CorrelationLineage,
  NodeDescriptor,
  ControlEvent
} from "@nodetool-ai/protocol";
import { EMPTY_LINEAGE } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.kernel.actor");
import type { ProcessingContext, NodeExecutor } from "@nodetool-ai/runtime";
import { withNodeSpan } from "@nodetool-ai/runtime";
import { NodeInbox, type MessageEnvelope } from "./inbox.js";
import { NodeInputs, NodeOutputs } from "./io.js";
import { isCorrelationEnabled } from "./correlation-flag.js";
import type { NodeAnalysis } from "./correlation-analysis.js";
import {
  iterationRootId,
  projectLineageKey,
  tryProjectLineageKey
} from "./correlation-analysis.js";

/**
 * Hints from the actor about how to route an invocation's outputs.
 * See runner.ts for the consumer.
 */
export interface OutputRoutingHints {
  invocationLineage?: CorrelationLineage;
  perSlotLineage?: Record<string, CorrelationLineage>;
}

export type { NodeExecutor };

/**
 * Canonical lineage keys join `root=index` pairs with `,`. To compute the
 * parent key for a shorter scope, take the first `prefixLength` pairs.
 */
function trimKey(key: string, prefixLength: number): string {
  if (prefixLength === 0) return "";
  if (key === "") return "";
  const parts = key.split(",");
  if (parts.length <= prefixLength) return key;
  return parts.slice(0, prefixLength).join(",");
}

/**
 * Find every pending max-scope key in `maxBuckets` whose parent (trimmed to
 * `parentLength`) equals `parentKey`. Used when a strict-prefix sticky
 * arrival can unblock pending child firings.
 */
function enumerateCandidateKeysForParent(
  maxBuckets: ReadonlyMap<string, ReadonlyMap<string, ReadonlyArray<unknown>>>,
  _dataHandles: ReadonlyArray<string>,
  _handleClass: ReadonlyMap<string, "max" | "prefix" | "empty">,
  _handleScope: ReadonlyMap<string, ReadonlyArray<string>>,
  _maxLength: number,
  parentKey: string,
  parentLength: number
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const buckets of maxBuckets.values()) {
    for (const key of buckets.keys()) {
      if (seen.has(key)) continue;
      if (trimKey(key, parentLength) === parentKey) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

function enumerateAllPendingKeys(
  maxBuckets: ReadonlyMap<string, ReadonlyMap<string, ReadonlyArray<unknown>>>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const buckets of maxBuckets.values()) {
    for (const key of buckets.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
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

  /** Handles where multiple upstream values should be collected into a list. */
  private _listInputHandles: Set<string>;

  /** Callback to route outputs downstream. */
  private _sendOutputs: (
    nodeId: string,
    outputs: Record<string, unknown>,
    hints?: OutputRoutingHints
  ) => Promise<void>;

  /**
   * Lineage of the current invocation. Set when the actor consumes input(s)
   * under the correlation flag and the inheritance case is unambiguous
   * (single-edge single-input handle).
   */
  private _currentInvocationLineage: CorrelationLineage | undefined;

  /**
   * Most recent envelope consumed per handle during the current gather.
   * Reset before each invocation. Used to compute invocation lineage when
   * the correlation flag is on.
   */
  private _lastEnvelopes: Map<string, import("./inbox.js").MessageEnvelope> =
    new Map();

  /** Callback to emit processing messages (NodeUpdate, etc.). */
  private _emitMessage: (msg: unknown) => void;
  /** Optional execution context passed into node executors. */
  private _executionContext: ProcessingContext | undefined;
  /** Control context for controller nodes (injected as _control_context input). */
  private _controlContext: Record<string, unknown> | null;

  /**
   * Static correlation analysis for this node, supplied by the runner when
   * `NODETOOL_USE_CORRELATION=1`. When undefined, the legacy sync_mode
   * scheduler runs. PR 3 step 3.
   */
  private _correlation: NodeAnalysis | undefined;

  /**
   * Per-iteration-root, per-parent-key counter for actor-minted iteration
   * tokens. §2 — counters are scoped by `(root id, exact parent lineage)`
   * and never reset for repeated invocations with the same parent key.
   */
  private _iterationCounters = new Map<string, Map<string, number>>();

  constructor(opts: {
    node: NodeDescriptor;
    inbox: NodeInbox;
    executor: NodeExecutor;
    sendOutputs: (
      nodeId: string,
      outputs: Record<string, unknown>,
      hints?: OutputRoutingHints
    ) => Promise<void>;
    emitMessage: (msg: unknown) => void;
    executionContext?: ProcessingContext;
    stickyHandles?: Set<string>;
    listInputHandles?: Set<string>;
    controlContext?: Record<string, unknown> | null;
    correlation?: NodeAnalysis;
  }) {
    this.node = opts.node;
    this.inbox = opts.inbox;
    this._executor = opts.executor;
    this._sendOutputs = opts.sendOutputs;
    this._emitMessage = opts.emitMessage;
    this._executionContext = opts.executionContext;
    this._initialStickyHandles = opts.stickyHandles ?? new Set();
    this._listInputHandles = opts.listInputHandles ?? new Set();
    this._controlContext = opts.controlContext ?? null;
    this._correlation = opts.correlation;
  }

  // -----------------------------------------------------------------------
  // Main execution entry point
  // -----------------------------------------------------------------------

  /**
   * Run the actor to completion.
   * Returns the last outputs produced.
   */
  async run(): Promise<ActorResult> {
    return withNodeSpan(
      { nodeId: this.node.id, nodeType: this.node.type },
      () => this._runImpl()
    );
  }

  private async _runImpl(): Promise<ActorResult> {
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
          // NodeInputs and pushes outputs via NodeOutputs. Passing
          // _lastEnvelopes as the tracker lets unmigrated filters that
          // call inputs.stream()+outputs.emit() inherit lineage from the
          // single-edge input automatically — matching the buffered rule.
          const nodeInputs = new NodeInputs(this.inbox, this._lastEnvelopes);
          const nodeOutputs = new NodeOutputs({
            sendFn: async (slot: string, value: unknown, opts) => {
              const hints: OutputRoutingHints = {};
              if (opts?.lineage !== undefined) {
                hints.perSlotLineage = { [slot]: opts.lineage };
              } else {
                const inherited = this._computeInvocationLineage();
                if (inherited !== undefined) {
                  hints.invocationLineage = inherited;
                }
              }
              await this._sendOutputs(
                this.node.id,
                { [slot]: value },
                hints
              );
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
      } else if (isCorrelationEnabled() && this._correlation) {
        // Correlated buffered scheduler (PR 3 step 3). Static analysis is
        // required, so the runner only supplies it when the flag is on.
        await this._runCorrelated(this._correlation);
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
    // Skip attaching result for constant/input nodes: the client already
    // holds these values as properties, so echoing them back is redundant.
    const skipResult =
      this.node.type.startsWith("nodetool.constant.") ||
      this.node.type.startsWith("nodetool.input.");
    this._emitNodeStatus(
      "completed",
      skipResult ? undefined : (this._latestResult ?? {})
    );
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

    // zip_all: keep gathering input batches until inbox is drained.
    while (true) {
      const inputs = await this._gatherZipAll();
      if (inputs === null) break;

      await this._executeWithInputs(inputs);

      if (this.inbox.isFullyDrained()) break;
    }
  }

  // -----------------------------------------------------------------------
  // Correlated buffered scheduler (PR 3 of docs/correlation-design.md)
  // -----------------------------------------------------------------------

  /**
   * Project an envelope's lineage onto a static scope, returning the
   * canonical key or `null` if the lineage is incomplete for the scope.
   */
  private _projectKey(
    envelope: MessageEnvelope,
    scope: ReadonlyArray<string>
  ): string | null {
    return tryProjectLineageKey(envelope.correlation_lineage, scope);
  }

  /**
   * Mint the next token index for `rootId` under `parentKey` and remember it.
   * Counters never reset within one workflow run, matching §2's rule that
   * repeated invocations with the same parent key continue numbering instead
   * of restarting at 0.
   */
  private _mintIterationToken(rootId: string, parentKey: string): number {
    let perRoot = this._iterationCounters.get(rootId);
    if (!perRoot) {
      perRoot = new Map();
      this._iterationCounters.set(rootId, perRoot);
    }
    const next = perRoot.get(parentKey) ?? 0;
    perRoot.set(parentKey, next + 1);
    return next;
  }

  /**
   * Correlated buffered scheduler — replaces `_runBuffered` under
   * `NODETOOL_USE_CORRELATION=1`.
   *
   * Algorithm (v1 of §4):
   *  1. Classify each connected data handle by its static scope:
   *       - max-scope: scope length == invocation scope length → bucket per key
   *       - strict-prefix sticky: shorter non-empty scope → sticky per projected
   *         parent key
   *       - empty: empty scope → single sticky entry
   *  2. Find the repeating driver, if any: at most one max-scope handle may be
   *     `repeats_per_key`. Static validation already rejects more than one.
   *  3. Pull envelopes via `iterAnyWithEnvelope`. On each arrival:
   *       - record into the right bucket,
   *       - re-evaluate the keys that could now be ready.
   *  4. For each ready key, gather values and call `_executeWithInputs`.
   *
   * Source nodes (no connected data handles) fire once with empty inputs.
   */
  private async _runCorrelated(analysis: NodeAnalysis): Promise<void> {
    this._inCorrelatedBuffered = true;
    try {
      await this._runCorrelatedImpl(analysis);
    } finally {
      this._inCorrelatedBuffered = false;
    }
  }

  private async _runCorrelatedImpl(analysis: NodeAnalysis): Promise<void> {
    const dataHandles = [...this.inbox["_buffers"].keys()].filter(
      (h) => h !== "__control__"
    );

    if (dataHandles.length === 0) {
      // Source node: fire once with empty inputs at empty scope.
      await this._executeWithInputs({});
      return;
    }

    type HandleClass = "max" | "prefix" | "empty";

    const handleScope = new Map<string, ReadonlyArray<string>>();
    const handleClass = new Map<string, HandleClass>();
    const handleRepeats = new Map<string, boolean>();
    const invocationScope = analysis.invocationScope;

    for (const h of dataHandles) {
      const info = analysis.inputs.get(h);
      const scope = info?.scope ?? [];
      handleScope.set(h, scope);
      handleRepeats.set(h, info?.repeatsPerKey ?? false);
      if (scope.length === 0) {
        handleClass.set(h, "empty");
      } else if (scope.length === invocationScope.length) {
        handleClass.set(h, "max");
      } else {
        handleClass.set(h, "prefix");
      }
    }

    const driverHandle = (() => {
      for (const h of dataHandles) {
        if (handleClass.get(h) === "max" && handleRepeats.get(h)) {
          return h;
        }
      }
      return null;
    })();

    // Buckets keyed by canonical projected key.
    const maxBuckets = new Map<string, Map<string, MessageEnvelope[]>>();
    const prefixSticky = new Map<string, Map<string, MessageEnvelope>>();
    const emptySticky = new Map<string, MessageEnvelope>();

    for (const h of dataHandles) {
      const cls = handleClass.get(h);
      if (cls === "max") maxBuckets.set(h, new Map());
      else if (cls === "prefix") prefixSticky.set(h, new Map());
    }

    const fired = new Set<string>();

    const isReady = (key: string): boolean => {
      for (const h of dataHandles) {
        const cls = handleClass.get(h);
        if (cls === "max") {
          const bucket = maxBuckets.get(h)!.get(key);
          if (!bucket || bucket.length === 0) {
            // No driver value: not ready unless a non-driver max handle has
            // sticky from a side-input semantic — which only applies when a
            // repeating driver exists.
            if (driverHandle && h !== driverHandle) {
              // Side input must have produced for this exact key. v1: still
              // wait for it to arrive.
              return false;
            }
            return false;
          }
        } else if (cls === "prefix") {
          // Need a sticky value for the projected parent key.
          const parentScope = handleScope.get(h)!;
          // Build the parent key by trimming the max-scope key against this
          // handle's scope. Since handle scope is a prefix of invocation
          // scope, the parent key is the first parentScope.length entries.
          const parentKey = trimKey(key, parentScope.length);
          const stickyMap = prefixSticky.get(h)!;
          if (!stickyMap.has(parentKey)) return false;
        } else {
          // empty-scope sticky
          if (!emptySticky.has(h)) {
            // Allow node properties / dynamic_properties to supply defaults:
            // _executeWithInputs already merges them. So an empty-scope
            // handle without an envelope is treated as "use the node's
            // declared default" if the handle has no open upstream.
            if (this.inbox.isOpen(h)) return false;
          }
        }
      }
      return true;
    };

    const collect = (key: string): {
      values: Record<string, unknown>;
      envelopes: Map<string, MessageEnvelope>;
    } => {
      const values: Record<string, unknown> = {};
      const envelopes = new Map<string, MessageEnvelope>();
      for (const h of dataHandles) {
        const cls = handleClass.get(h);
        if (cls === "max") {
          const bucket = maxBuckets.get(h)!.get(key);
          if (!bucket || bucket.length === 0) continue;
          const env = bucket.shift()!;
          envelopes.set(h, env);
          values[h] = env.data;
          if (bucket.length === 0) maxBuckets.get(h)!.delete(key);
        } else if (cls === "prefix") {
          const parentScope = handleScope.get(h)!;
          const parentKey = trimKey(key, parentScope.length);
          const env = prefixSticky.get(h)!.get(parentKey);
          if (env) {
            envelopes.set(h, env);
            values[h] = env.data;
          }
        } else {
          const env = emptySticky.get(h);
          if (env) {
            envelopes.set(h, env);
            values[h] = env.data;
          }
        }
      }
      return { values, envelopes };
    };

    const tryFire = async (candidateKeys: Iterable<string>): Promise<void> => {
      for (const key of candidateKeys) {
        if (fired.has(key) && driverHandle === null) {
          // For non-repeating drivers each key fires at most once because
          // bucket consumption strips it. The fired set protects against
          // double-fire when the same key comes from multiple notifications.
          continue;
        }
        if (!isReady(key)) continue;
        const { values, envelopes } = collect(key);
        // Set per-invocation envelopes so output routing can derive lineage.
        this._lastEnvelopes = envelopes;
        await this._executeWithInputs(values);
        if (driverHandle === null) fired.add(key);
      }
    };

    // Pre-seed: if any handle starts with no upstream (closed), nothing
    // arrives. Continue and let the loop terminate.
    for await (const [handle, envelope] of this.inbox.iterAnyWithEnvelope()) {
      if (handle === "__control__") continue;
      const cls = handleClass.get(handle);
      if (cls === undefined) continue;

      if (cls === "max") {
        const scope = handleScope.get(handle)!;
        const key = this._projectKey(envelope, scope) ?? "";
        const handleBuckets = maxBuckets.get(handle)!;
        let bucket = handleBuckets.get(key);
        if (!bucket) {
          if (handleBuckets.size >= this.inbox.maxPendingKeys) {
            throw new Error(
              `Inbox for node "${this.node.id}" exceeded max_pending_keys ` +
                `(${this.inbox.maxPendingKeys}) on handle "${handle}". ` +
                `Likely missing upstream close — see docs/correlation-design.md §6.`
            );
          }
          bucket = [];
          handleBuckets.set(key, bucket);
        }
        if (bucket.length >= this.inbox.maxPendingMessagesPerKey) {
          throw new Error(
            `Inbox for node "${this.node.id}" exceeded ` +
              `max_pending_messages_per_key (` +
              `${this.inbox.maxPendingMessagesPerKey}) on handle "${handle}" ` +
              `for key "${key}".`
          );
        }
        bucket.push(envelope);
        await tryFire([key]);
      } else if (cls === "prefix") {
        const parentScope = handleScope.get(handle)!;
        const parentKey = this._projectKey(envelope, parentScope) ?? "";
        prefixSticky.get(handle)!.set(parentKey, envelope);
        // Try firing any max-scope keys whose parent matches this parentKey.
        const candidates = enumerateCandidateKeysForParent(
          maxBuckets,
          dataHandles,
          handleClass,
          handleScope,
          invocationScope.length,
          parentKey,
          parentScope.length
        );
        await tryFire(candidates);
      } else {
        emptySticky.set(handle, envelope);
        // Empty-scope arrival can unblock any pending max-scope key.
        const candidates = enumerateAllPendingKeys(maxBuckets);
        await tryFire(candidates);
      }
    }

    // If the node has no max-scope inputs (all empty / prefix), fire once.
    if (
      [...handleClass.values()].every((c) => c !== "max") &&
      !fired.has("")
    ) {
      // Build values from sticky state.
      const values: Record<string, unknown> = {};
      const envelopes = new Map<string, MessageEnvelope>();
      let readyOrAllowed = true;
      for (const h of dataHandles) {
        if (handleClass.get(h) === "prefix") {
          // Use the only sticky entry, if any.
          const sticky = prefixSticky.get(h)!;
          if (sticky.size === 0) {
            // No value arrived; defaults will apply in _executeWithInputs.
            continue;
          }
          const first = sticky.values().next().value as MessageEnvelope;
          envelopes.set(h, first);
          values[h] = first.data;
        } else {
          const env = emptySticky.get(h);
          if (env) {
            envelopes.set(h, env);
            values[h] = env.data;
          } else if (this.inbox.isOpen(h)) {
            readyOrAllowed = false;
          }
        }
      }
      if (readyOrAllowed) {
        this._lastEnvelopes = envelopes;
        await this._executeWithInputs(values);
        fired.add("");
      }
    }
  }

  // -----------------------------------------------------------------------
  // Correlated invocation lineage and output routing
  // -----------------------------------------------------------------------

  /**
   * Under the correlated scheduler the invocation lineage is the projected
   * lineage of the consumed max-scope envelopes, written canonically. PR 2's
   * fallback (single non-list handle) still applies when the analyzer is not
   * available.
   */
  private _correlatedInvocationLineage(): CorrelationLineage | undefined {
    if (!this._correlation) return undefined;
    const invocationScope = this._correlation.invocationScope;
    if (invocationScope.length === 0) {
      // For empty-scope nodes the lineage is also empty.
      return EMPTY_LINEAGE;
    }
    // Build a lineage from the longest projection any consumed envelope
    // supplies. Max-scope envelopes have the complete projection; prefix
    // envelopes contribute parent roots only.
    const out: Record<string, { index: number }> = {};
    for (const env of this._lastEnvelopes.values()) {
      for (const root of invocationScope) {
        if (root in env.correlation_lineage) {
          out[root] = env.correlation_lineage[root];
        }
      }
    }
    return out;
  }

  /**
   * Build the per-slot lineage map for an emission. Single/forward/chunk
   * outputs inherit the invocation lineage; iteration outputs mint a token
   * per group per frame.
   */
  private _correlatedOutputLineage(
    invocationLineage: CorrelationLineage,
    emittedHandles: ReadonlyArray<string>
  ): Record<string, CorrelationLineage> | undefined {
    if (!this._correlation) return undefined;
    const declared = this.node.output_correlation ?? {};
    const perSlot: Record<string, CorrelationLineage> = {};
    const groupTokens = new Map<string, number>();
    const invocationScope = this._correlation.invocationScope;
    const parentKey = invocationScope.length
      ? projectLineageKey(invocationLineage, invocationScope)
      : "";

    for (const handle of emittedHandles) {
      const corr = declared[handle];
      if (!corr) {
        perSlot[handle] = invocationLineage;
        continue;
      }
      if (corr.kind === "iteration") {
        const root = iterationRootId(this.node.id, handle, corr.group);
        let index = groupTokens.get(root);
        if (index === undefined) {
          // Reuse the token already minted for this frame, if any
          // (`_mintIterationFrameOverrides` mints before _sendOutputs runs).
          const fromFrame = this._lastMintedFrameTokens.get(root);
          if (fromFrame !== undefined) {
            index = fromFrame;
          } else {
            index = this._mintIterationToken(root, parentKey);
          }
          groupTokens.set(root, index);
        }
        perSlot[handle] = { ...invocationLineage, [root]: { index } };
      } else {
        // single/forward/chunk all inherit invocation lineage in v1.
        // forward outputs route their source envelope's lineage via
        // outputs.forward(); the static path is invocation lineage.
        perSlot[handle] = invocationLineage;
      }
    }
    return perSlot;
  }

  /**
   * on_any execution: wait for all handles to have at least one value,
   * then fire. After initial fire, each subsequent item fires immediately.
   */
  private async _runOnAny(inputHandles: string[]): Promise<void> {
    const current: Record<string, unknown> = {};
    const pendingHandles = new Set(inputHandles);
    let initialFired = false;

    for await (const [handle, envelope] of this.inbox.iterAnyWithEnvelope()) {
      if (handle === "__control__") continue;

      const item = envelope.data;
      this._lastEnvelopes.set(handle, envelope);

      if (this._listInputHandles.has(handle)) {
        if (Array.isArray(item)) {
          current[handle] = item;
        } else {
          current[handle] = await this._collectScalarListInput(handle, item);
        }
      } else {
        current[handle] = item;
      }

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
      syncMode: this.node.sync_mode ?? "zip_all",
      inputHandles: Object.keys(inputs)
    });

    this._currentInvocationLineage = this._computeInvocationLineage();

    if (this.node.is_streaming_output && this._executor.genProcess) {
      this._streamingCollectedOutputs = {};
      for await (const partial of this._executor.genProcess(
        inputs,
        this._executionContext
      )) {
        const routed = this._filterStreamingPartial(partial);
        const handles = Object.keys(routed);
        if (handles.length === 0) continue;
        // Strip actor-reserved `index` from iteration groups before routing
        // (the actor mints the token index; node code is migrating away from
        // supplying it). §1 — under the correlation scheduler this becomes
        // a validation error after migration; for now we warn-and-overwrite.
        const overrides = this._mintIterationFrameOverrides(routed);
        Object.assign(this._streamingCollectedOutputs, routed);
        if (overrides) Object.assign(this._streamingCollectedOutputs, overrides);
        const emit = overrides ? { ...routed, ...overrides } : routed;
        this._latestResult = { ...this._streamingCollectedOutputs };
        await this._sendOutputs(
          this.node.id,
          emit,
          this._currentHints(Object.keys(emit))
        );
      }
      this._latestResult = { ...(this._streamingCollectedOutputs ?? {}) };
    } else {
      const outputs = await this._executor.process(
        inputs,
        this._executionContext
      );
      this._latestResult = outputs;
      await this._sendOutputs(
        this.node.id,
        outputs,
        this._currentHints(Object.keys(outputs))
      );
    }
  }

  /**
   * For each iteration group present in `frame`, mint or reuse a token. If
   * the frame supplies an `index` value for a group that has an `index`
   * sibling handle declared, overwrite it with the actor-minted index. §1.
   *
   * Returns the override map (only the slots that needed mutation) or null
   * when no iteration groups are in play.
   */
  private _mintIterationFrameOverrides(
    frame: Record<string, unknown>
  ): Record<string, unknown> | null {
    if (!this._correlation) return null;
    const declared = this.node.output_correlation;
    if (!declared) return null;
    const invocationScope = this._correlation.invocationScope;
    const parentKey =
      invocationScope.length && this._currentInvocationLineage
        ? projectLineageKey(this._currentInvocationLineage, invocationScope)
        : "";

    // Collect groups whose handles appear in the frame.
    const groupHandles = new Map<string, string[]>(); // group root → handles
    for (const handle of Object.keys(frame)) {
      const corr = declared[handle];
      if (!corr || corr.kind !== "iteration") continue;
      const root = iterationRootId(this.node.id, handle, corr.group);
      let arr = groupHandles.get(root);
      if (!arr) {
        arr = [];
        groupHandles.set(root, arr);
      }
      arr.push(handle);
    }
    if (groupHandles.size === 0) return null;

    // Each frame mints fresh tokens; clear last frame's bookkeeping.
    this._lastMintedFrameTokens.clear();
    const overrides: Record<string, unknown> = {};
    for (const [root, handles] of groupHandles) {
      const index = this._mintIterationToken(root, parentKey);
      for (const handle of handles) {
        if (handle === "index") {
          overrides[handle] = index;
        }
      }
      // Stash the minted token so _correlatedOutputLineage reuses it.
      this._lastMintedFrameTokens.set(root, index);
    }
    return Object.keys(overrides).length > 0 ? overrides : null;
  }

  /** Tokens minted for the most recent frame, reused by output lineage. */
  private _lastMintedFrameTokens = new Map<string, number>();

  /**
   * True while `_runCorrelated` is the active execution path. PR 3 keeps the
   * streaming-input branch on PR 2's single-envelope inheritance so test
   * fixtures and unmigrated stream filters without explicit
   * `output_correlation` keep working.
   */
  private _inCorrelatedBuffered = false;

  /**
   * Build routing hints for the current invocation.
   *
   * Under PR 2 only single-input single-edge buffered nodes inherit lineage.
   * Under PR 3, when correlation analysis is available the actor mints
   * per-slot lineage for iteration outputs and propagates invocation lineage
   * for single/forward/chunk outputs.
   */
  private _currentHints(
    emittedHandles?: ReadonlyArray<string>
  ): OutputRoutingHints | undefined {
    if (!isCorrelationEnabled()) return undefined;
    if (this._currentInvocationLineage === undefined) return undefined;
    if (this._correlation && emittedHandles && emittedHandles.length > 0) {
      const perSlot = this._correlatedOutputLineage(
        this._currentInvocationLineage,
        emittedHandles
      );
      if (perSlot) {
        return {
          invocationLineage: this._currentInvocationLineage,
          perSlotLineage: perSlot
        };
      }
    }
    return { invocationLineage: this._currentInvocationLineage };
  }

  /**
   * Compute the invocation lineage for the current set of consumed
   * envelopes. Returns undefined when the case is ambiguous or the flag is
   * off — downstream routing then sees empty lineage, matching pre-PR-2
   * behavior.
   *
   * PR 2 handles only the unambiguous "exactly one connected single-edge
   * data input" case. PR 3 extends this with full multi-input merging.
   *
   * The map is NOT cleared here so that streaming-input nodes that emit
   * multiple times per consumed envelope continue to inherit lineage on
   * every emit. Buffered gather paths overwrite envelopes per handle on
   * each iteration, which naturally tracks the latest consumed envelope.
   */
  private _computeInvocationLineage(): CorrelationLineage | undefined {
    if (!isCorrelationEnabled()) return undefined;
    if (this._correlation && this._inCorrelatedBuffered) {
      return this._correlatedInvocationLineage();
    }

    const dataHandles = [...this._lastEnvelopes.keys()].filter(
      (h) => h !== "__control__" && !this._listInputHandles.has(h)
    );
    if (dataHandles.length !== 1) return undefined;
    return this._lastEnvelopes.get(dataHandles[0])?.correlation_lineage;
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
          event_id: "",
          correlation_lineage: EMPTY_LINEAGE,
          source_edge_id: ""
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
      if (this._listInputHandles.has(handle)) {
        const collected = await this._collectListInput(handle);
        if (collected === null) return null;
        result[handle] = collected.values;
        gotNew = gotNew || collected.gotNew;
        continue;
      }

      if (this.inbox.hasBuffered(handle)) {
        const popped = this._popHandle(handle);
        if (popped !== undefined) {
          result[handle] = popped;
          this._stickyValues[handle] = popped;
          gotNew = true;
          continue;
        }
      }

      // Topology-marked sticky handles (one-shot upstream like Constant)
      // reuse their last value across firings. Streaming handles do NOT —
      // when they EOS, zip_all halts. Use on_any if you want broadcast/
      // fan-out semantics across closed streaming handles.
      const isInitialSticky = this._initialStickyHandles.has(handle);
      if (isInitialSticky && handle in this._stickyValues) {
        result[handle] = this._stickyValues[handle];
        continue;
      }

      // Handle still open: wait for the next value.
      if (this.inbox.isOpen(handle)) {
        const gen = this.inbox.iterInputWithEnvelope(handle);
        const next = await gen.next();
        if (next.done) {
          // EOS — only initial-sticky handles fall back to the cached value.
          // Non-sticky streaming handles closing means no more pairs.
          if (isInitialSticky && handle in this._stickyValues) {
            result[handle] = this._stickyValues[handle];
            continue;
          }
          return null;
        }
        this._lastEnvelopes.set(handle, next.value);
        result[handle] = next.value.data;
        this._stickyValues[handle] = next.value.data;
        gotNew = true;
        await gen.return(undefined);
        continue;
      }

      // Handle closed and not initial-sticky (or no value ever received) —
      // can't form a complete tuple, stop iterating.
      return null;
    }

    if (!gotNew) return null; // every handle yielded only sticky reuse
    return result;
  }

  private async _collectScalarListInput(
    handle: string,
    firstValue: unknown
  ): Promise<unknown[]> {
    const values: unknown[] = [];
    this._appendListInputValue(values, firstValue);

    while (true) {
      while (this.inbox.hasBuffered(handle)) {
        const popped = this._popHandle(handle);
        if (popped !== undefined) {
          this._appendListInputValue(values, popped);
        }
      }

      if (!this.inbox.isOpen(handle)) {
        return values;
      }

      const gen = this.inbox.iterInput(handle);
      const next = await gen.next();
      if (next.done) {
        return values;
      }
      this._appendListInputValue(values, next.value);
      await gen.return(undefined);
    }
  }

  private _appendListInputValue(values: unknown[], value: unknown): void {
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
  }

  private async _collectListInput(
    handle: string
  ): Promise<{ values: unknown[]; gotNew: boolean } | null> {
    const values: unknown[] = [];
    let gotNew = false;

    while (true) {
      while (this.inbox.hasBuffered(handle)) {
        const popped = this._popHandle(handle);
        if (popped !== undefined) {
          this._appendListInputValue(values, popped);
          gotNew = true;
        }
      }

      if (!this.inbox.isOpen(handle)) {
        break;
      }

      const gen = this.inbox.iterInput(handle);
      const next = await gen.next();
      if (next.done) {
        break;
      }
      this._appendListInputValue(values, next.value);
      gotNew = true;
      await gen.return(undefined);
    }

    if (!gotNew) return null;
    return { values, gotNew };
  }

  /**
   * Pop a single item from a specific handle's buffer.
   */
  private _popHandle(handle: string): unknown | undefined {
    const buf = this.inbox["_buffers"].get(handle);
    if (!buf || buf.length === 0) return undefined;
    const envelope = buf.shift()!;
    this._lastEnvelopes.set(handle, envelope);
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
