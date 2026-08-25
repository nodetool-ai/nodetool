/**
 * WorkflowRunner – DAG orchestration.
 *
 * Port of src/nodetool/workflows/workflow_runner.py.
 *
 * Responsibilities:
 *   - Graph validation and initialization.
 *   - Inbox creation with upstream counts.
 *   - Input value dispatch to input nodes.
 *   - Actor spawning with concurrent execution.
 *   - Output routing via send_messages.
 *   - Edge counter tracking for EOS propagation.
 *   - Control event dispatch.
 *   - Completion detection.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  isBoolean,
  isCallable,
  isNumber,
  isObjectValue,
  isString
} from "./predicates.js";
import type {
  NodeDescriptor,
  HydratedGraphData,
  Edge,
  ProcessingMessage,
  ControlEvent,
  CorrelationLineage,
  Intervention
} from "@nodetool-ai/protocol";
import { TypeMetadata } from "@nodetool-ai/protocol";
import { ensureBounded, redactValue } from "./supervisor.js";
import type { SupervisorHandle } from "./supervisor.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.kernel.runner");

/** Node type that publishes to a variable channel (see runtime VariableChannel). */
const SET_VARIABLE_NODE_TYPE = "nodetool.variable.SetVariable";

/**
 * Minimum interval between edge_update emissions per edge. The first message
 * on an edge always emits (it starts the flow animation); afterwards the
 * counter badge is refreshed at most this often, with the exact final count
 * flushed at run end. Keeps audio-rate streams (~50 chunks/s per edge) from
 * flooding the message transport.
 */
const EDGE_UPDATE_MIN_INTERVAL_MS = 1000;

/**
 * Cap on messages retained for RunResult.messages. Long-running streaming
 * jobs would otherwise accumulate messages without bound; when the cap is
 * hit, the oldest half is dropped (block-wise, so the cost amortizes).
 */
const MAX_RETAINED_MESSAGES = 10_000;

/**
 * Cap on lineages retained per node for `read_node_output`. A supervisor reads
 * the failing invocation's own branch, which is recent; a wide fan-out must not
 * turn the cache into a second copy of the run's data.
 */
const MAX_RECORDED_LINEAGES_PER_NODE = 64;

function hasDefinedOwnProperty(
  record: Record<string, unknown>,
  key: string
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(record, key) &&
    record[key] !== undefined
  );
}

/** A value that already carries its own control-event envelope. */
function isControlEventValue(value: unknown): value is ControlEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "event_type" in value &&
    typeof (value as Record<string, unknown>).event_type === "string"
  );
}

/** An output_update whose value is a streamed audio chunk (sample payload). */
function isAudioChunkOutputUpdate(msg: ProcessingMessage): boolean {
  if (msg.type !== "output_update") return false;
  const value = (msg as { value?: unknown }).value;
  if (!isObjectValue(value)) return false;
  const v = value as { type?: unknown; content_type?: unknown };
  return v.type === "chunk" && v.content_type === "audio";
}
import type { ProcessingContext } from "@nodetool-ai/runtime";
// Import span helpers from the narrow `/tracing` subpath, not the package root,
// so thin consumers (e.g. the in-browser workflow runner) don't drag the
// provider / python-bridge barrel into their bundle.
import { withWorkflowSpan } from "@nodetool-ai/runtime/tracing";
import { isControlEdge, isDataEdge } from "@nodetool-ai/protocol";
import { Graph, GraphValidationError } from "./graph.js";
import { rewriteBypassedNodes } from "./graph-utils.js";
import { dynamicSlotPropertyTypes } from "./dynamic-slots.js";
import { NodeInbox } from "./inbox.js";
import { NodeActor, type NodeExecutor } from "./actor.js";
import { syntheticEdgeId } from "./edge-ids.js";
import {
  analyzeCorrelation,
  projectLineageKey,
  type CorrelationAnalysisResult
} from "./correlation-analysis.js";
import {
  lineageRelated,
  type NodeOutputRead,
  type NodeRunState,
  type RunStateDigest,
  type RunStateReader
} from "./run-state.js";

/**
 * Hints from the actor about how to route an invocation's outputs.
 *
 * `invocationLineage` is applied to outputs that inherit the invocation scope.
 * `perSlotLineage` overrides it per slot (e.g. minted iteration lineage or
 * `outputs.forward()` calls). `lineageDoneSlots` marks slots the node dropped,
 * for which the runner sends `signalLineageDone` instead of a value.
 */
export interface OutputRoutingHints {
  /** Lineage carried by the consumed envelope when the node had exactly one. */
  invocationLineage?: CorrelationLineage;
  /** Explicit per-slot lineage overrides (e.g. from outputs.forward). */
  perSlotLineage?: Record<string, CorrelationLineage>;
  /**
   * Slots being dropped for the given lineage. The runner sends
   * `signalLineageDone` to downstream inboxes for these slots instead of
   * delivering a value. §5.
   */
  lineageDoneSlots?: Set<string>;
  /**
   * A supervisor `skip` verdict: this invocation produced nothing. The runner
   * sends `lineage_done` on every outgoing data edge at `invocationLineage`,
   * *and* `lineage_scope_closed` for every child root the invocation would have
   * opened. Design §5.2.
   */
  skipInvocation?: boolean;
}

// ---------------------------------------------------------------------------
// Node-level validation hook
// ---------------------------------------------------------------------------

/**
 * Issue reported by a node validator. Mirrors the shape of
 * `@nodetool-ai/node-sdk`'s `NodePropertyValidationIssue`, redeclared here to
 * avoid a circular dependency (node-sdk depends on kernel).
 */
export interface NodeValidationIssue {
  nodeId?: string;
  nodeType?: string;
  property: string;
  message: string;
}

/**
 * Function used by WorkflowRunner to validate each node before execution.
 * `connectedHandles` lists the targetHandles on the node that have an
 * incoming data edge — those properties are produced at runtime and the
 * validator must not flag them as missing.
 */
export type NodeValidator = (
  node: NodeDescriptor,
  connectedHandles: ReadonlySet<string>
) => NodeValidationIssue[] | undefined | null;

// ---------------------------------------------------------------------------
// Runner options
// ---------------------------------------------------------------------------

export interface RunJobRequest {
  /** Unique job identifier. */
  job_id: string;

  /** Workflow / graph identifier. */
  workflow_id?: string;

  /** Input parameters keyed by input-node name. */
  params?: Record<string, unknown>;

  /** Optional parent workflow ID for sub-graph execution. */
  parent_id?: string;

  /**
   * Wake-up payload for a trigger-driven run. Mirrors
   * `@nodetool-ai/protocol`'s `RunJobRequest.trigger_event`, redeclared here
   * (like {@link NodeValidationIssue}) to avoid a circular dependency. When
   * present, propagated onto `WorkflowRunnerOptions.executionContext` as
   * `triggerEvent` at the start of the run so actors can read it via
   * `ProcessingContext`.
   */
  trigger_event?: {
    node_id: string;
    payload: unknown;
    input_id: string;
  };
}

export interface WorkflowRunnerOptions {
  /**
   * Factory that resolves a NodeDescriptor to a NodeExecutor.
   * This is the integration point for actual node implementations.
   */
  resolveExecutor: (node: NodeDescriptor) => NodeExecutor;

  /** Optional per-inbox buffer limit. */
  bufferLimit?: number | null;

  /** Optional execution context passed to each node executor call. */
  executionContext?: ProcessingContext;

  /**
   * Optional pre-flight validator invoked once per node after structural
   * graph validation succeeds. Returning a non-empty list of issues aborts
   * the run with a `GraphValidationError` before any actor is spawned.
   *
   * `NodeRegistry.createNodeValidator()` from `@nodetool-ai/node-sdk` produces
   * a callback compatible with this signature.
   */
  validateNode?: NodeValidator;

  /**
   * Strict mode (docs/RELIABILITY_ARCHITECTURE.md §12: "strict mode is a
   * kernel flag, not a fork"). Default `false` (advisory-only, current
   * behavior).
   *
   * When `true`, the checks that are otherwise logged as advisory warnings —
   * `_checkPendingInboxWork` finding undelivered messages, a controlled node
   * completing with pending `sendControlEvent` responses still unresolved,
   * and `_drainActiveEdges` finding an edge still buffered/open after the
   * graph settled — throw an `Error` instead. The error is caught by the
   * same top-level handler that reports node/graph failures, so a strict
   * violation surfaces as `RunResult.status === "failed"` with a message
   * naming every offending node/edge, exactly like any other run failure.
   */
  strict?: boolean;

  /**
   * Turns a failing node invocation into a decision instead of a dead run.
   * Absent — the default — means no escalation is ever constructed and the run
   * behaves exactly as it does today. See docs/workflow-supervisor-design.md.
   */
  supervisor?: SupervisorHandle;
}

// ---------------------------------------------------------------------------
// Runner result
// ---------------------------------------------------------------------------

export interface RunResult {
  /** Outputs collected from output nodes, keyed by node name/id. */
  outputs: Record<string, unknown[]>;

  /** All processing messages emitted during the run. */
  messages: ProcessingMessage[];

  /** Final job status. */
  status: "completed" | "failed" | "cancelled" | "suspended";

  /** Error message if status is 'failed'. */
  error?: string;

  /**
   * Set when status is 'suspended': the node that suspended, the human
   * reason, and the saved state/metadata to persist for a future resume.
   * snake_case to match the wire / job_update convention and
   * `WorkflowSuspendedError.toDict()`.
   */
  suspend?: {
    node_id: string;
    reason: string;
    state: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };

  /**
   * Every supervisor escalation and the verdict it received, in order. A
   * completed run with a non-empty list is "Completed — supervised": a derived
   * display state, not a fifth status, so existing `status` consumers keep
   * working.
   */
  interventions?: Intervention[];
}

/**
 * For workflow sink nodes (`nodetool.output.Output`, Preview), the user-facing
 * key is `properties.name` (workflow output / vvvv pin name). The process
 * result still uses internal handles (e.g. `output`). Map those updates to the
 * logical name so WebSocket clients can route values to the right pins.
 */
function clientFacingOutputName(node: NodeDescriptor, handle: string): string {
  const t = node.type ?? "";
  const props = node.properties as Record<string, unknown> | undefined;
  const workflowKey =
    props && isString(props.name) && props.name.trim().length > 0
      ? props.name.trim()
      : undefined;

  if (t === "nodetool.output.Output" || t.endsWith(".output.Output")) {
    return workflowKey ?? handle;
  }
  if (
    t === "nodetool.workflows.base_node.Preview" ||
    t.endsWith(".workflows.base_node.Preview")
  ) {
    return workflowKey ?? handle;
  }
  return handle;
}

// ---------------------------------------------------------------------------
// WorkflowRunner
// ---------------------------------------------------------------------------

export class WorkflowRunner {
  readonly jobId: string;
  private _graph!: Graph;
  private _options: WorkflowRunnerOptions;

  /** Per-node inboxes. */
  private _inboxes = new Map<string, NodeInbox>();

  /** Per-edge message counters (for EdgeUpdate tracking). */
  private _edgeCounters = new Map<string, number>();

  /** Per-edge timestamp of the last emitted edge_update (throttling). */
  private _edgeCounterLastEmitMs = new Map<string, number>();

  /** Edges whose counter advanced since their last emitted edge_update. */
  private _edgeCounterDirty = new Set<string>();

  /**
   * Static correlation analysis result. Always populated before actors run.
   */
  private _correlation: CorrelationAnalysisResult | undefined;

  /**
   * Multi-edge list inputs: nodeId → set of handles that aggregate
   * multiple edges into a list.
   */
  private _multiEdgeListInputs = new Map<string, Set<string>>();

  /** Collected outputs from output nodes. */
  private _outputs = new Map<string, unknown[]>();

  /** All emitted messages. */
  private _messages: ProcessingMessage[] = [];

  /** Cancellation flag. */
  private _cancelled = false;

  /**
   * Actors spawned and not yet finished (including their completion
   * handling). Exposed via {@link liveActorCount} for leak accounting — after
   * a run this must be back to zero, and a harness that can't measure it
   * can't assert it.
   */
  private _liveActors = 0;

  /**
   * Latch set by `cancel()` and never cleared by `_resetRunState`. A cancel
   * that lands between construction and `run()` would otherwise be dropped —
   * the reset clears `_cancelled` and swaps the AbortController. `_runImpl`
   * re-applies this latch after the reset so such a run terminates as
   * "cancelled". §17.
   */
  private _cancelRequested = false;

  /**
   * True while a run is in flight. A second concurrent `run()` on the same
   * instance would clobber all shared run state, so `_runImpl` rejects it. §17.
   */
  private _running = false;

  /**
   * Job id used for `edge_update` emissions during a run. Captured from
   * `request.job_id` at the start of `_runImpl` so edge updates and
   * `job_update` messages carry the same id; before a run starts it defaults
   * to the constructor id. §16.
   */
  private _effectiveJobId: string;

  /** Run-level cancellation signal source; aborted by `cancel()`. */
  private _abortController = new AbortController();

  /**
   * Pending response resolvers for sendControlEvent, FIFO per node. The
   * controlled actor processes control events in order and emits outputs in
   * order, so the oldest waiter matches the next output. A single slot per
   * node would let a burst of concurrent control events (e.g. parallel agent
   * tool calls) overwrite an earlier resolver, leaving its promise unsettled
   * forever.
   */
  private _pendingControlResponses = new Map<
    string,
    Array<{
      resolve: (outputs: Record<string, unknown>) => void;
      reject: (err: Error) => void;
    }>
  >();

  /**
   * Executor instance per node. Resolved once and reused so that the
   * instance initialized in _initializeGraph is the same one that executes
   * (NodeRegistry.resolve constructs a fresh instance per call).
   */
  private _executors = new Map<string, NodeExecutor>();

  /**
   * Nodes whose actor has finished running. A control event sent to such a
   * node can never be answered (the actor's run loop is gone), so
   * sendControlEvent rejects instead of registering a promise that hangs
   * forever. This guards against an agent dispatching a burst of control
   * tool calls where the controlled node errors (and terminates) partway
   * through.
   */
  private _completedNodes = new Set<string>();

  /** Errors reported by node actors, keyed by node id. */
  private _nodeErrors = new Map<string, string>();

  /**
   * Edge ids whose source has already been marked done on the target inbox.
   * `markSourceDone` decrements an upstream counter, so marking the same edge
   * twice would over-decrement and could prematurely close a handle that still
   * has other open upstreams. Early per-slot EOS (`outputs.complete`) and the
   * final `_sendEOS` both guard against double-marking via this set.
   */
  private _eosSentEdges = new Set<string>();

  /**
   * First suspension reported by a node actor (`WorkflowSuspendedError`).
   * Precedence in finalization is cancel > suspend > failed > completed.
   */
  private _suspend:
    | {
        node_id: string;
        reason: string;
        state: Record<string, unknown>;
        metadata: Record<string, unknown>;
      }
    | undefined;

  /** Supervisor escalations and their verdicts, in decision order. */
  private _interventions: Intervention[] = [];

  /**
   * Last output of each node per invocation lineage, for `read_node_output`.
   * Only populated on a supervised run — an unsupervised one keeps nothing.
   * Bounded per node: a 10k-item fan-out must not become a 10k-entry cache.
   */
  private _recordedOutputs = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();

  /** Undefined on an unsupervised run, so its `RunResult` is unchanged. */
  private _recordedInterventions(): Intervention[] | undefined {
    return this._interventions.length > 0 ? this._interventions : undefined;
  }

  /**
   * The handle every escalation actually goes through: whatever the caller
   * configured, under the kernel's bounds. Nothing else in the runner reads
   * `_options.supervisor`.
   */
  private readonly _supervisor: SupervisorHandle | undefined;

  constructor(jobId: string, options: WorkflowRunnerOptions) {
    this.jobId = jobId;
    this._effectiveJobId = jobId;
    this._options = options;
    this._supervisor = options.supervisor
      ? ensureBounded(options.supervisor)
      : undefined;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Push a streaming input value into the graph while it is running.
   * The input name matches an input-node's `name` (or `id` fallback).
   */
  async pushInputValue(
    inputName: string,
    value: unknown,
    sourceHandle?: string
  ): Promise<void> {
    if (!this._graph) {
      throw new Error("Workflow has not been started");
    }

    const inputNodes = this._resolveInputNodes(inputName);
    if (inputNodes.length === 0) {
      throw new Error(`Input node not found: ${inputName}`);
    }

    for (const node of inputNodes) {
      // Run the node's own process() so streamed values transform exactly like
      // start params do in _dispatchInputs (StringInput max_length,
      // DocumentFileInput building a DocumentRef, MessageDeconstructor
      // splitting). Otherwise the same input node behaves differently depending
      // on whether the value arrived as a param or was streamed in. This is a
      // live-stream path, so a process() failure throws rather than silently
      // dropping the value.
      const executor = this._resolveExecutor(node);
      let nodeOutputs: Record<string, unknown>;
      try {
        nodeOutputs = await executor.process(
          { value },
          this._options.executionContext
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Input node "${node.name ?? node.id}" (${node.type}) failed: ${message}`
        );
      }

      // Same fallback semantics as _dispatchInputs: raw-value dispatch only
      // when process() produced no defined output at all (the test-double
      // case). Once the record carries any real output, a handle it omits
      // stays silent rather than leaking the raw input value onto it.
      const outputsEmpty = !Object.values(nodeOutputs).some(
        (v) => v !== undefined
      );
      const outgoing = this._graph
        .findOutgoingEdges(node.id)
        .filter(isDataEdge);
      for (const edge of outgoing) {
        if (sourceHandle && edge.sourceHandle !== sourceHandle) {
          continue;
        }
        const hasHandleValue =
          Object.hasOwn(nodeOutputs, edge.sourceHandle) &&
          nodeOutputs[edge.sourceHandle] !== undefined;
        if (!outputsEmpty && !hasHandleValue) continue;
        const targetInbox = this._inboxes.get(edge.target);
        if (!targetInbox) continue;
        const handleValue = hasHandleValue
          ? nodeOutputs[edge.sourceHandle]
          : value;
        await targetInbox.put(edge.targetHandle, handleValue, {
          source_edge_id:
            edge.id ??
            syntheticEdgeId(
              edge.source,
              edge.sourceHandle,
              edge.target,
              edge.targetHandle
            )
        });
        this._incrementEdgeCounter(edge);
      }
    }
  }

  /**
   * Signal end-of-stream for an input node so downstream handles can complete.
   */
  finishInputStream(inputName: string, sourceHandle?: string): void {
    if (!this._graph) {
      throw new Error("Workflow has not been started");
    }

    const inputNodes = this._resolveInputNodes(inputName);
    if (inputNodes.length === 0) {
      throw new Error(`Input node not found: ${inputName}`);
    }

    for (const node of inputNodes) {
      const outgoing = this._graph
        .findOutgoingEdges(node.id)
        .filter(isDataEdge);
      for (const edge of outgoing) {
        if (sourceHandle && edge.sourceHandle !== sourceHandle) {
          continue;
        }
        const targetInbox = this._inboxes.get(edge.target);
        if (!targetInbox) continue;
        targetInbox.markSourceDone(edge.targetHandle);
      }
    }
  }

  /**
   * Execute a workflow graph.
   *
   * Requires hydrated descriptors: the actor trusts the behavior flags
   * (`is_streaming_input` & co.) to pick the execution mode, so accepting a
   * raw wire graph here would silently run streaming nodes as one-shot
   * process() calls. Hydrate via `Graph.loadFromDict`, node-sdk's
   * `hydrateGraphNodeFlags(graph, registry)`, or — for graphs constructed in
   * code where the author sets the flags — `withExplicitNodeFlags`.
   */
  async run(
    request: RunJobRequest,
    graphData: HydratedGraphData
  ): Promise<RunResult> {
    return withWorkflowSpan(
      {
        workflowId: request.workflow_id ?? undefined,
        nodeCount: graphData.nodes.length,
        extra: { "workflow.job_id": request.job_id }
      },
      () => this._runImpl(request, graphData)
    );
  }

  private async _runImpl(
    request: RunJobRequest,
    graphData: HydratedGraphData
  ): Promise<RunResult> {
    // Reject a second concurrent run before touching any shared state — a reset
    // here would wipe the in-flight run's inboxes/outputs/messages. §17.
    if (this._running) {
      throw new Error(
        `WorkflowRunner "${this.jobId}" is already running; ` +
          "create a new runner instance per job"
      );
    }
    this._running = true;

    this._resetRunState();
    this._effectiveJobId = request.job_id ?? this.jobId;

    // A cancel() that landed before this run started set the latch but was
    // undone by _resetRunState (fresh controller, _cancelled cleared). Re-apply
    // it so the run terminates as "cancelled" rather than silently ignoring the
    // request. §17.
    if (this._cancelRequested) {
      this._cancelled = true;
      this._abortController.abort();
    }

    // Publish this run's cancellation signal on the shared context so nodes
    // reached through process()/genProcess() — which receive no NodeInputs —
    // can abort long-running work (agent loops, provider calls) on cancel().
    // _resetRunState mints a fresh controller per run, so this must be
    // re-published each time rather than wired once at construction.
    if (this._options.executionContext) {
      this._options.executionContext.signal = this._abortController.signal;
      this._options.executionContext.triggerEvent =
        request.trigger_event ?? null;
    }

    try {
      log.info("Workflow started", {
        jobId: request.job_id,
        workflowId: request.workflow_id
      });

      // Emit job_update: running before any validation. A run that dies in
      // graph validation still gets the running acknowledgement first, so
      // clients never see a terminal update for a job they were never told
      // started.
      this._emit({
        type: "job_update",
        status: "running",
        job_id: request.job_id,
        workflow_id: request.workflow_id ?? null
      });
      // Rewrite the graph to route around nodes marked
      // `ui_properties.bypassed === true`. Each outgoing edge of a
      // bypassed node is re-attached to the matching upstream source
      // (by type compatibility); outgoing edges with no compatible
      // upstream are dropped, as is the bypassed node itself.
      const effectiveGraph = rewriteBypassedNodes(graphData);
      this._graph = new Graph(effectiveGraph);

      // Python parity: _filter_invalid_edges — silently remove edges
      // whose source or target node doesn't exist in the graph.
      this._filterInvalidEdges();

      // Static correlation analysis is mandatory. Issues abort the run with
      // a graph validation error before any actor is spawned.
      this._correlation = analyzeCorrelation({
        nodes: this._graph.nodes,
        edges: this._graph.edges
      });
      if (this._correlation.issues.length > 0) {
        const lines = this._correlation.issues.map((i) => `  - ${i.message}`);
        throw new GraphValidationError(
          `Correlation analysis failed:\n${lines.join("\n")}`,
          this._correlation.issues
            .filter((i): i is typeof i & { nodeId: string } => !!i.nodeId)
            .map((i) => ({
              nodeId: i.nodeId,
              nodeType: i.nodeType,
              property: i.handle ?? "",
              message: i.message
            }))
        );
      }

      // Validate
      this._graph.validate();

      // Pre-flight node validation: catch missing required fields and
      // unset model selections before spawning any actors.
      this._validateNodes();
      this._validateRequiredInputs(request.params ?? {});

      // Detect multi-edge list inputs
      this._detectMultiEdgeListInputs();

      // Initialize inboxes
      this._initializeInboxes();

      // Initialize all nodes (Python parity: initialize_graph)
      await this._initializeGraph();

      // Dispatch input parameters
      await this._dispatchInputs(request.params ?? {});

      // Bind sendControlEvent to processing context so agent nodes can dispatch
      // control events to controlled nodes and await their results.
      if (
        this._options.executionContext &&
        isCallable(this._options.executionContext.setSendControlEvent)
      ) {
        this._options.executionContext.setSendControlEvent(
          (targetNodeId: string, properties: Record<string, unknown>) =>
            this.sendControlEvent(targetNodeId, properties)
        );
      }

      // Register Set Variable writers so variable channels know when to close.
      this._registerVariableChannels();

      // Process graph (spawn actors)
      await this._processGraph();

      // Post-completion: drain any edges that still have pending/open state
      this._enforceCleanEdgeDrain(this._drainActiveEdges());

      // A suspension is a distinct terminal outcome (suspended, not failed).
      // Precedence is cancel > suspend > failed > completed: cancel is
      // checked first, then suspend takes priority over node errors so a
      // human-in-the-loop pause isn't masked by an incidental sibling error.
      if (!this._cancelled && this._suspend) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.info("Workflow suspended", {
          jobId: request.job_id,
          nodeId: this._suspend.node_id,
          reason: this._suspend.reason
        });
        this._emit({
          type: "job_update",
          status: "suspended",
          job_id: request.job_id,
          workflow_id: request.workflow_id ?? null
        });
        return {
          outputs: Object.fromEntries(this._outputs),
          messages: this._messages,
          status: "suspended",
          suspend: this._suspend,
          interventions: this._recordedInterventions()
        };
      }

      // A node failure fails the whole job (Python parity). Actors swallow
      // their own errors so sibling branches can finish, but the final
      // status must not report success when any node errored.
      if (!this._cancelled && this._nodeErrors.size > 0) {
        const error = [...this._nodeErrors]
          .map(([nodeId, msg]) => `Node "${nodeId}" failed: ${msg}`)
          .join("; ");
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.error("Workflow failed", { jobId: request.job_id, error });
        this._emit({
          type: "job_update",
          status: "failed",
          job_id: request.job_id,
          workflow_id: request.workflow_id ?? null,
          error
        });
        return {
          outputs: Object.fromEntries(this._outputs),
          messages: this._messages,
          status: "failed",
          error,
          interventions: this._recordedInterventions()
        };
      }

      const status = this._cancelled ? "cancelled" : "completed";
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.info("Workflow completed", { jobId: request.job_id, status });

      this._emit({
        type: "job_update",
        status,
        job_id: request.job_id,
        workflow_id: request.workflow_id ?? null
      });

      return {
        outputs: Object.fromEntries(this._outputs),
        messages: this._messages,
        status,
        interventions: this._recordedInterventions()
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.error("Workflow failed", { jobId: request.job_id, error: message });
      // Drain active edges on error for front-end cleanup
      this._drainActiveEdges();
      const validationIssues =
        err instanceof GraphValidationError && err.issues.length > 0
          ? err.issues
              .filter((i): i is typeof i & { nodeId: string } => !!i.nodeId)
              .map((i) => ({
                node_id: i.nodeId,
                node_type: i.nodeType ?? null,
                property: i.property ?? "",
                message: i.message
              }))
          : null;
      this._emit({
        type: "job_update",
        status: "failed",
        job_id: request.job_id,
        workflow_id: request.workflow_id ?? null,
        error: message,
        validation_issues: validationIssues
      });
      return {
        outputs: Object.fromEntries(this._outputs),
        messages: this._messages,
        status: "failed",
        error: message,
        interventions: this._recordedInterventions()
      };
    } finally {
      this._running = false;
    }
  }

  private _resetRunState(): void {
    this._inboxes = new Map();
    this._edgeCounters = new Map();
    this._edgeCounterLastEmitMs = new Map();
    this._edgeCounterDirty = new Set();
    this._multiEdgeListInputs = new Map();
    this._outputs = new Map();
    this._messages = [];
    this._cancelled = false;
    this._abortController = new AbortController();
    this._pendingControlResponses = new Map();
    this._completedNodes = new Set();
    this._executors = new Map();
    this._nodeErrors = new Map();
    this._correlation = undefined;
    this._eosSentEdges = new Set();
    this._suspend = undefined;
    this._interventions = [];
    this._recordedOutputs = new Map();
  }

  /**
   * The read-only view a supervisor gets of the run in flight. Built from
   * state the runner already holds, so a run without a supervisor pays for
   * none of it. See docs/workflow-supervisor-design.md §6.
   */
  private _runStateReader(): RunStateReader {
    return {
      digest: () => this._runStateDigest(),
      readOutput: (nodeId, lineage) => this._readRecordedOutput(nodeId, lineage)
    };
  }

  private _runStateDigest(): RunStateDigest {
    // A node error is raw `err.message` — an HTTP failure echoing its URL
    // carries the key it was called with. The digest goes to the supervisor
    // model, so it is redacted here, where the digest is built, exactly as the
    // actor redacts an escalation's `detail`.
    const secrets =
      this._options.executionContext?.getResolvedSecretValues?.() ??
      new Set<string>();
    const escalationsPerNode = new Map<string, number>();
    for (const intervention of this._interventions) {
      const nodeId = intervention.escalation.nodeId;
      escalationsPerNode.set(nodeId, (escalationsPerNode.get(nodeId) ?? 0) + 1);
    }
    const nodes: NodeRunState[] = this._graph.nodes.map((node) => {
      const error = this._nodeErrors.get(node.id);
      const done = this._completedNodes.has(node.id);
      const emissions = this._recordedOutputs.get(node.id)?.size ?? 0;
      const state: NodeRunState = {
        nodeId: node.id,
        nodeType: node.type,
        status:
          error !== undefined
            ? "failed"
            : done
              ? "completed"
              : emissions > 0
                ? "running"
                : "pending",
        emissions,
        escalations: escalationsPerNode.get(node.id) ?? 0
      };
      if (error !== undefined) {
        state.error = String(redactValue(error, secrets));
      }
      return state;
    });
    return {
      jobId: this._effectiveJobId,
      nodes,
      costUsd: this._options.executionContext?.getTotalCost?.() ?? 0
    };
  }

  private _readRecordedOutput(
    nodeId: string,
    lineage: readonly string[]
  ): NodeOutputRead | null {
    const perLineage = this._recordedOutputs.get(nodeId);
    if (!perLineage) return null;
    // Most specific first: an entry sharing more of the failing invocation's
    // roots is closer to it causally than a single-fire ancestor.
    let best: NodeOutputRead | null = null;
    for (const [key, outputs] of perLineage) {
      const recorded = key === "" ? [] : key.split(",");
      if (!lineageRelated(recorded, lineage)) continue;
      if (best === null || recorded.length > best.lineage.length) {
        best = { nodeId, lineage: recorded, outputs };
      }
    }
    return best;
  }

  /**
   * Remember what a node emitted, keyed by the invocation's lineage, so a
   * supervisor can read a producer's output while deciding a consumer's
   * failure. Off unless the run is supervised.
   */
  private _recordNodeOutput(
    sourceNodeId: string,
    outputs: Record<string, unknown>,
    lineage: CorrelationLineage | undefined
  ): void {
    const scope = this._correlation?.nodes.get(sourceNodeId)?.invocationScope;
    const key =
      scope && scope.length > 0 && lineage
        ? projectLineageKey(lineage, scope)
        : "";
    let perLineage = this._recordedOutputs.get(sourceNodeId);
    if (!perLineage) {
      perLineage = new Map();
      this._recordedOutputs.set(sourceNodeId, perLineage);
    }
    // Re-inserting moves the key to the end, so the eviction below always
    // drops the least recently emitted lineage rather than a live one.
    perLineage.delete(key);
    perLineage.set(key, outputs);
    while (perLineage.size > MAX_RECORDED_LINEAGES_PER_NODE) {
      const oldest = perLineage.keys().next();
      if (oldest.done) break;
      perLineage.delete(oldest.value);
    }
  }

  /** Actors spawned and not yet finished. Zero before and after a run. */
  get liveActorCount(): number {
    return this._liveActors;
  }

  /** Control-event responses still waiting on an actor, summed over nodes. */
  get pendingControlResponseCount(): number {
    let count = 0;
    for (const queue of this._pendingControlResponses.values()) {
      count += queue.length;
    }
    return count;
  }

  /**
   * Push property updates into a running node's executor instance (live
   * parameter changes — e.g. turning a synth knob while the patch plays).
   * Returns true when the node's executor exists and supports live updates;
   * false is not an error — the caller's canvas state already holds the new
   * value for the next run.
   */
  updateNodeProperties(
    nodeId: string,
    properties: Record<string, unknown>
  ): boolean {
    const executor = this._executors.get(nodeId);
    if (!executor?.applyProperties) return false;
    executor.applyProperties(properties);
    return true;
  }

  cancel(): void {
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.info("Job cancelled", { jobId: this.jobId });
    // Latch the request so a cancel before run() survives _resetRunState. §17.
    this._cancelRequested = true;
    this._cancelled = true;
    // Stop producing loops (generators, pacers) that never wait on inputs —
    // closing inboxes only unblocks consumers. Nodes observe this via
    // `inputs.signal`.
    this._abortController.abort();
    // Close all inboxes to unblock waiting actors
    for (const inbox of this._inboxes.values()) {
      void inbox.closeAll();
    }
  }

  // -----------------------------------------------------------------------
  // Invalid edge filtering (Python parity: _filter_invalid_edges)
  // -----------------------------------------------------------------------

  /**
   * Remove edges whose source or target node doesn't exist in the graph.
   * Reconstructs the graph without dangling edges.
   */
  private _filterInvalidEdges(): void {
    const validEdges = this._graph.edges.filter(
      (edge) =>
        this._graph.findNode(edge.source) !== undefined &&
        this._graph.findNode(edge.target) !== undefined
    );
    if (validEdges.length < this._graph.edges.length) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.warn("Filtered invalid edges", {
        // Stryker disable next-line ArithmeticOperator: diagnostic log arg only
        removed: this._graph.edges.length - validEdges.length,
        remaining: validEdges.length
      });
      this._graph = new Graph({
        nodes: [...this._graph.nodes],
        edges: validEdges
      });
    }
  }

  /**
   * Run the optional `validateNode` callback for every node in the graph,
   * passing the set of property handles that have an incoming data edge.
   * Aggregates issues across nodes and throws a single GraphValidationError.
   */
  private _validateNodes(): void {
    const validator = this._options.validateNode;
    if (!validator) return;

    // Build map: nodeId -> set of targetHandles with an incoming data edge.
    const connectedByNode = new Map<string, Set<string>>();
    for (const edge of this._graph.edges) {
      if (!isDataEdge(edge)) continue;
      let handles = connectedByNode.get(edge.target);
      if (!handles) {
        handles = new Set();
        connectedByNode.set(edge.target, handles);
      }
      handles.add(edge.targetHandle);
    }

    const issues: NodeValidationIssue[] = [];
    for (const node of this._graph.nodes) {
      const handles = connectedByNode.get(node.id) ?? new Set<string>();
      const nodeIssues = validator(node, handles);
      if (nodeIssues && nodeIssues.length > 0) {
        for (const issue of nodeIssues) {
          issues.push({
            nodeId: issue.nodeId ?? node.id,
            nodeType: issue.nodeType ?? node.type,
            property: issue.property,
            message: issue.message
          });
        }
      }
    }

    if (issues.length > 0) {
      const lines = issues.map((issue) => {
        const where = ` on node "${issue.nodeId}"${
          issue.nodeType ? ` (${issue.nodeType})` : ""
        }`;
        return `  - ${issue.message}${where}`;
      });
      throw new GraphValidationError(
        `Graph validation failed with ${issues.length} issue(s):\n${lines.join("\n")}`,
        issues.map((issue) => ({
          nodeId: issue.nodeId,
          nodeType: issue.nodeType,
          property: issue.property,
          message: issue.message
        }))
      );
    }
  }

  /** Refuse to start when a required workflow input has no supplied value. */
  private _validateRequiredInputs(params: Record<string, unknown>): void {
    const nodesWithIncomingData = new Set<string>();
    const nodesWithIncomingControl = new Set<string>();
    for (const edge of this._graph.edges) {
      if (isDataEdge(edge)) {
        nodesWithIncomingData.add(edge.target);
      } else if (isControlEdge(edge)) {
        nodesWithIncomingControl.add(edge.target);
      }
    }

    const missingNames: string[] = [];
    const issues: NodeValidationIssue[] = [];
    for (const node of this._graph.nodes) {
      if (!node.type.startsWith("nodetool.input.")) continue;
      if (node.is_streaming_output) continue;
      if (
        nodesWithIncomingData.has(node.id) ||
        nodesWithIncomingControl.has(node.id)
      ) {
        continue;
      }

      const inputName = this._getExternalInputName(node);
      const properties = isObjectValue(node.properties)
        ? node.properties
        : {};
      if (
        hasDefinedOwnProperty(params, inputName) ||
        hasDefinedOwnProperty(properties, "value")
      ) {
        continue;
      }

      if (!missingNames.includes(inputName)) {
        missingNames.push(inputName);
      }
      issues.push({
        nodeId: node.id,
        nodeType: node.type,
        property: "value",
        message: `Missing required workflow input "${inputName}"`
      });
    }

    if (issues.length > 0) {
      throw new GraphValidationError(
        `Missing required workflow inputs: ${missingNames.join(", ")}`,
        issues
      );
    }
  }

  // -----------------------------------------------------------------------
  // Node initialization
  // -----------------------------------------------------------------------

  /**
   * Initialize every node's executor before any actor runs.
   *
   * A failure here aborts the run before `_processGraph`, so the actors that
   * would normally call `finalize()` never start. Finalize the executors that
   * did initialize, otherwise whatever they opened (python bridge handles,
   * provider clients, file descriptors) leaks for the lifetime of the process.
   * The failure is also re-thrown with the offending node's identity attached —
   * a bare "connect ECONNREFUSED" gives no clue which node to fix.
   */
  private async _initializeGraph(): Promise<void> {
    const initialized: NodeExecutor[] = [];
    for (const node of this._graph.nodes) {
      const executor = this._resolveExecutor(node);
      if (!executor.initialize) continue;
      try {
        await executor.initialize();
        initialized.push(executor);
      } catch (err) {
        await this._finalizeExecutors(initialized);
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Node "${node.name ?? node.id}" (${node.type}) failed to initialize: ${message}`,
          { cause: err }
        );
      }
    }
  }

  /** Finalize executors, never letting one failure hide another. */
  private async _finalizeExecutors(
    executors: readonly NodeExecutor[]
  ): Promise<void> {
    for (const executor of executors) {
      if (!executor.finalize) continue;
      try {
        await executor.finalize();
      } catch (err) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.warn("Executor finalize failed during initialization rollback", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /** Resolve (and cache) the executor instance for a node. */
  private _resolveExecutor(node: NodeDescriptor): NodeExecutor {
    let executor = this._executors.get(node.id);
    if (!executor) {
      executor = this._options.resolveExecutor(node);
      this._executors.set(node.id, executor);
    }
    return executor;
  }

  // -----------------------------------------------------------------------
  // Inbox initialization
  // -----------------------------------------------------------------------

  private _initializeInboxes(): void {
    for (const node of this._graph.nodes) {
      const inbox = new NodeInbox(this._options.bufferLimit ?? null);

      // Count upstream sources per handle from data edges
      const incomingData = this._graph.findDataEdges(node.id);
      const handleCounts = new Map<string, number>();
      for (const edge of incomingData) {
        const cur = handleCounts.get(edge.targetHandle) ?? 0;
        handleCounts.set(edge.targetHandle, cur + 1);
      }

      // Also count control edges
      const incomingControl = this._graph
        .findIncomingEdges(node.id)
        .filter(isControlEdge);
      if (incomingControl.length > 0) {
        const uniqueControllerCount = new Set(
          incomingControl.map((e) => e.source)
        ).size;
        handleCounts.set(
          "__control__",
          (handleCounts.get("__control__") ?? 0) + uniqueControllerCount
        );
      }

      for (const [handle, count] of handleCounts) {
        inbox.addUpstream(handle, count);
      }

      this._inboxes.set(node.id, inbox);
    }
  }

  // -----------------------------------------------------------------------
  // Multi-edge list detection
  // -----------------------------------------------------------------------

  private _detectMultiEdgeListInputs(): void {
    // Find handles that receive more than one edge AND whose property type
    // is a list type.  Non-list handles with multiple edges should NOT be
    // marked for aggregation (Python parity: _classify_list_inputs).
    const handleEdgeCounts = new Map<string, number>(); // key = nodeId:handle
    for (const edge of this._graph.edges) {
      if (isControlEdge(edge)) continue;
      const key = `${edge.target}:${edge.targetHandle}`;
      handleEdgeCounts.set(key, (handleEdgeCounts.get(key) ?? 0) + 1);
    }

    for (const [key, count] of handleEdgeCounts) {
      if (count > 1) {
        const sepIdx = key.lastIndexOf(":");
        const nodeId = key.substring(0, sepIdx);
        const handle = key.substring(sepIdx + 1);

        // Look up the target node to check its property type
        const node = this._graph.findNode(nodeId);
        if (!node) continue;

        // Validate that the handle's type is a list type
        const propertyTypes = node.propertyTypes;
        if (propertyTypes) {
          const typeStr = propertyTypes[handle];
          if (typeStr) {
            const meta = TypeMetadata.fromString(typeStr);
            if (!meta.isListType()) {
              // Multiple edges to non-list property — skip aggregation
              continue;
            }
          }
        }

        if (!this._multiEdgeListInputs.has(nodeId)) {
          this._multiEdgeListInputs.set(nodeId, new Set());
        }
        this._multiEdgeListInputs.get(nodeId)!.add(handle);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Input dispatch
  // -----------------------------------------------------------------------

  /**
   * Deliver input parameters to input nodes (nodes with no incoming data edges).
   * After delivery, mark them as done (EOS) since input nodes produce exactly
   * one value.
   */
  /** Variable-channel name a Set Variable node publishes to (its `name` prop). */
  private _variableChannelName(node: NodeDescriptor): string {
    const props = isObjectValue(node.properties) ? node.properties : {};
    const raw = props.name;
    return isString(raw) ? raw.trim() : "";
  }

  /**
   * Tell the context how many Set Variable writers each channel has, before any
   * actor runs. A channel with no writers then closes on first read so readers
   * (Get Variable streams, Prompt awaits) end cleanly instead of hanging.
   */
  private _registerVariableChannels(): void {
    const ctx = this._options.executionContext;
    if (!ctx || !isCallable(ctx.registerChannelWriters)) {
      return;
    }
    for (const node of this._graph.nodes) {
      if (node.type !== SET_VARIABLE_NODE_TYPE) {
        continue;
      }
      const name = this._variableChannelName(node);
      if (name) {
        ctx.registerChannelWriters(name, 1);
      }
    }
  }

  private async _dispatchInputs(
    params: Record<string, unknown>
  ): Promise<void> {
    for (const node of this._graph.nodes) {
      const incoming = this._graph.findDataEdges(node.id);
      if (incoming.length > 0) continue; // not an input node
      // A node with an incoming control edge is run by its actor in
      // _processGraph (which only skips actor-spawning when the node has
      // neither data nor control edges). Skipping it here keeps the two
      // predicates in parity — otherwise a controlled input node would be
      // both one-shot dispatched here and spawned as an actor (double run).
      const incomingControl = this._graph
        .findIncomingEdges(node.id)
        .filter(isControlEdge);
      if (incomingControl.length > 0) continue;
      if (!this._isExternalInputNode(node)) continue;

      const inputName = this._getExternalInputName(node);
      const properties = isObjectValue(node.properties)
        ? node.properties
        : {};
      const hasRuntimeParam = hasDefinedOwnProperty(params, inputName);
      const hasDefaultValue = hasDefinedOwnProperty(properties, "value");

      // Streaming output input nodes (e.g. RealtimeAudioInput) should NOT
      // push empty defaults — real data will arrive later via pushInputValue().
      // Non-streaming inputs must push their default so downstream nodes can run.
      // (Python parity: checks is_streaming_output.)
      if (!hasRuntimeParam && (node.is_streaming_output || !hasDefaultValue)) {
        continue;
      }

      const value = hasRuntimeParam ? params[inputName] : properties.value;

      // Run the node's own process() so transforming input nodes (e.g.
      // DocumentFileInput building a DocumentRef, StringInput applying
      // max_length, MessageDeconstructor splitting a message) emit their
      // declared per-handle outputs instead of leaking the raw value to
      // every edge. Uses the cached executor instance initialized in
      // _initializeGraph. Test doubles whose process() returns an empty
      // record fall back to raw-value dispatch per handle below; a real
      // process() failure fails the run rather than leaking the raw value.
      const executor = this._resolveExecutor(node);
      let nodeOutputs: Record<string, unknown>;
      try {
        nodeOutputs = await executor.process(
          { value },
          this._options.executionContext
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Input node "${node.name ?? node.id}" (${node.type}) failed: ${message}`
        );
      }

      // Raw-value fallback only when process() produced no defined output at
      // all (the documented test-double case, incl. `{}`). Once the record
      // carries any real output, a handle it legitimately omits (e.g. an input
      // with no attachments) stays silent instead of leaking the raw input
      // value onto that edge. §6. Keyed on `!== undefined` to match the
      // per-handle check below. The EOS pass below still closes every edge so
      // downstream nodes complete.
      const outputsEmpty = !Object.values(nodeOutputs).some(
        (v) => v !== undefined
      );
      const outgoing = this._graph
        .findOutgoingEdges(node.id)
        .filter(isDataEdge);
      for (const edge of outgoing) {
        const hasHandleValue =
          Object.hasOwn(nodeOutputs, edge.sourceHandle) &&
          nodeOutputs[edge.sourceHandle] !== undefined;
        if (!outputsEmpty && !hasHandleValue) continue;
        const targetInbox = this._inboxes.get(edge.target);
        if (targetInbox) {
          const handleValue = hasHandleValue
            ? nodeOutputs[edge.sourceHandle]
            : value;
          await targetInbox.put(edge.targetHandle, handleValue, {
            source_edge_id:
              edge.id ??
              syntheticEdgeId(
                edge.source,
                edge.sourceHandle,
                edge.target,
                edge.targetHandle
              )
          });
        }
        this._incrementEdgeCounter(edge);
      }

      // Streaming output input nodes (e.g. RealtimeAudioInput) keep their
      // downstream inboxes open so that future pushInputValue() calls can
      // deliver more data.  Non-streaming input nodes signal EOS immediately
      // since they produce exactly one value.
      // (Python parity: _dispatch_inputs checks is_streaming_output, not
      // is_streaming_input.)
      if (!node.is_streaming_output) {
        for (const edge of outgoing) {
          const targetInbox = this._inboxes.get(edge.target);
          if (targetInbox) {
            targetInbox.markSourceDone(edge.targetHandle);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Graph processing
  // -----------------------------------------------------------------------

  /**
   * Spawn one NodeActor per node and run them concurrently.
   * Actors that depend on inputs will block on their inboxes until
   * upstream actors produce data.
   */
  private async _processGraph(): Promise<void> {
    // Before any actor can escalate, the supervisor gets its read-only view.
    // A handle that throws here is a broken supervisor, and a broken
    // supervisor must never be worse for the run than no supervisor: it
    // proceeds without a reader and its decisions degrade to `fail`.
    try {
      this._supervisor?.attach?.(this._runStateReader());
    } catch (error) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.warn("Supervisor attach failed; running without a run-state view", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const actorPromises: Array<Promise<void>> = [];
    /** Parallel to `actorPromises` — maps a settled index back to its node. */
    const actorNodeIds: string[] = [];

    for (const node of this._graph.nodes) {
      // Skip input-only nodes that have no incoming edges
      // (they were already handled in _dispatchInputs)
      const incoming = this._graph.findDataEdges(node.id);
      const incomingControl = this._graph
        .findIncomingEdges(node.id)
        .filter(isControlEdge);

      if (
        incoming.length === 0 &&
        incomingControl.length === 0 &&
        this._isExternalInputNode(node)
      ) {
        continue; // pure input node, already dispatched
      }

      const inbox = this._inboxes.get(node.id)!;
      const executor = this._resolveExecutor(node);

      // Build control context for controller nodes (Python parity:
      // _is_controller / _build_control_context). This tells the node
      // which downstream nodes it controls and their available properties.
      const controlContext = this._buildControlContext(node.id);

      const actor = new NodeActor({
        node,
        inbox,
        executor,
        sendOutputs: async (nodeId, outputs, hints) => {
          await this._sendMessages(nodeId, outputs, hints);
        },
        emitMessage: (msg) => {
          this._emit(msg as ProcessingMessage);
        },
        executionContext: this._options.executionContext,
        listInputHandles: this._multiEdgeListInputs.get(node.id),
        controlContext,
        correlation: this._correlation?.nodes.get(node.id),
        cancelSignal: this._abortController.signal,
        signalSlotEos: (sourceNodeId, slot) =>
          this._signalSlotEos(sourceNodeId, slot),
        supervisor: this._supervisor,
        onIntervention: (intervention) => this._interventions.push(intervention)
      });

      actorNodeIds.push(node.id);
      this._liveActors++;
      actorPromises.push(
        actor
          .run()
          .then(async (result) => {
            // Nothing will read this inbox again. Wake any upstream actor parked
            // on a full buffer so it can finish instead of waiting forever for a
            // consumer that is gone.
            inbox.releaseBackpressure();

            if (result.error !== undefined) {
              this._nodeErrors.set(node.id, result.error);
            }

            // A suspension is a distinct terminal outcome, not an error.
            // Record the first one; precedence is resolved at finalization.
            if (result.suspend !== undefined) {
              this._suspend ??= {
                node_id: result.suspend.nodeId,
                reason: result.suspend.reason,
                state: result.suspend.state,
                metadata: result.suspend.metadata
              };
            }

            // After actor completes, send EOS to all downstream inboxes
            await this._sendEOS(node.id);

            // A Set Variable writer finished — when the last writer for a channel
            // is done, the context closes it so readers (Get Variable / Prompt)
            // drain and end instead of waiting forever.
            if (node.type === SET_VARIABLE_NODE_TYPE) {
              const channelName = this._variableChannelName(node);
              if (channelName) {
                this._options.executionContext?.markChannelWriterDone?.(
                  channelName
                );
              }
            }

            // The actor's run loop is gone — it can no longer answer control
            // events. Mark it so future sendControlEvent calls reject fast
            // rather than hang, and reject any response still waiting on it
            // (the actor finished without producing the awaited output, e.g.
            // it errored mid-burst).
            this._completedNodes.add(node.id);
            const pendingQueue = this._pendingControlResponses.get(node.id);
            if (pendingQueue) {
              this._pendingControlResponses.delete(node.id);
              for (const pending of pendingQueue) {
                pending.reject(
                  new Error(
                    result.error ??
                      `Controlled node ${node.id} completed without responding`
                  )
                );
              }
            }

            // If this is an output node, collect the result
            if (this._isOutputNode(node)) {
              const name = this._outputCollectionKey(node);
              if (!this._outputs.has(name)) {
                this._outputs.set(name, []);
              }
              if (result.outputs) {
                for (const val of Object.values(result.outputs)) {
                  this._outputs.get(name)!.push(val);
                }
              }
            }
          })
          // Counts the actor as live until its completion handling (EOS
          // routing, output collection) is done too — that work can still emit
          // messages, so an actor is not "gone" before it finishes.
          .finally(() => {
            this._liveActors--;
          })
      );
    }

    // Wait for every actor, including post-completion routing. `allSettled`
    // rather than `all`: a throw in one actor's completion handler (EOS
    // routing, channel bookkeeping, a message-transport failure) must not
    // return the run while its siblings are still executing — orphaned actors
    // would keep writing to inboxes and emitting messages after the runner
    // reported a terminal status.
    const settled = await Promise.allSettled(actorPromises);
    for (const [index, outcome] of settled.entries()) {
      if (outcome.status !== "rejected") continue;
      const nodeId = actorNodeIds[index];
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.error("Actor completion handling failed", { nodeId, error: message });
      if (!this._nodeErrors.has(nodeId)) {
        this._nodeErrors.set(nodeId, message);
      }
    }

    // Backstop: release any reader still waiting on a channel (e.g. a writer
    // that errored before publishing). Non-cyclic graphs are already closed by
    // markChannelWriterDone above.
    this._options.executionContext?.closeAllChannels?.();

    // Check for in-flight messages after all actors complete (Python parity: _check_pending_inbox_work)
    const pendingNodes = this._checkPendingInboxWork();
    if (pendingNodes.length > 0) {
      if (this._options.strict && !this._cancelled && !this._suspend) {
        throw new Error(
          `Strict mode: pending inbox work detected after all actors ` +
            `completed for node(s): ${pendingNodes.join(", ")}`
        );
      }
      log.warn(
        // Stryker disable next-line StringLiteral: diagnostic log args only
        "Pending inbox work detected after all actors completed — possible data loss",
        // Stryker disable next-line ObjectLiteral: diagnostic log args only
        {
          pendingNodes
        }
      );
    }

    // Check for controlled-node control events whose response never arrived
    // (the target actor completed — or was never reachable — while a
    // `sendControlEvent` waiter was still registered for it). Every
    // completion path (actor completion handler, the completion race guard
    // in `sendControlEvent`) rejects its own waiters, so a non-empty queue
    // here means a waiter was registered for a node whose actor never ran at
    // all, or another gap in that bookkeeping — either way, "zero pending
    // control responses" (§6) is violated.
    const pendingControlNodes = [...this._pendingControlResponses.entries()]
      .filter(([, queue]) => queue.length > 0)
      .map(([nodeId]) => nodeId);
    if (pendingControlNodes.length > 0) {
      if (this._options.strict && !this._cancelled && !this._suspend) {
        throw new Error(
          `Strict mode: pending control-event responses never resolved for ` +
            `node(s): ${pendingControlNodes.join(", ")}`
        );
      }
      log.warn(
        // Stryker disable next-line StringLiteral: diagnostic log args only
        "Pending control-event responses after all actors completed — possible hang",
        // Stryker disable next-line ObjectLiteral: diagnostic log args only
        {
          pendingControlNodes
        }
      );
    }
  }

  // -----------------------------------------------------------------------
  // Output routing (send_messages equivalent)
  // -----------------------------------------------------------------------

  /**
   * Route output values from a node to downstream inboxes.
   * For control edges: route control events to the __control__ handle.
   * For data edges: route to the named target handle.
   */
  private async _sendMessages(
    sourceNodeId: string,
    outputs: Record<string, unknown>,
    routingHints: OutputRoutingHints = {}
  ): Promise<void> {
    if (this._cancelled) return;

    if (routingHints.skipInvocation) {
      this._skipInvocationOutputs(
        sourceNodeId,
        routingHints.invocationLineage ?? {}
      );
      return;
    }

    if (this._supervisor) {
      this._recordNodeOutput(
        sourceNodeId,
        outputs,
        routingHints.invocationLineage
      );
    }

    // Handle __control_output__ from controller nodes (Python parity:
    // send_messages wraps __control_output__ in RunEvent and routes to
    // all controlled nodes via control edges).
    if ("__control_output__" in outputs) {
      await this._routeControlOutput(
        sourceNodeId,
        outputs["__control_output__"]
      );
    }

    const outgoing = this._graph.findOutgoingEdges(sourceNodeId);
    const outputKeys = Object.keys(outputs).filter(
      (k) => outputs[k] !== undefined
    );
    log.debug("_sendMessages", {
      sourceNodeId,
      outputKeys,
      outgoingEdgeCount: outgoing.length,
      outgoingEdges: outgoing.map((e) => ({
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        isControl: isControlEdge(e)
      }))
    });

    for (const edge of outgoing) {
      if (isControlEdge(edge)) {
        // Route control events from controller nodes to controlled nodes.
        // Try __control__ first, then fall back to __control_output__
        // (already handled above, skip duplicate routing).
        const value = outputs[edge.sourceHandle];
        if (value === undefined) continue;
        const targetInbox = this._inboxes.get(edge.target);
        if (!targetInbox) continue;

        // Ensure the value is a proper ControlEvent with event_type.
        // Controller nodes output raw property dicts
        // (e.g. {brightness: 5}) via __control_output__. These must be
        // wrapped in a RunEvent so the controlled actor's _runControlled()
        // recognises them. (Python parity: send_messages wraps
        // __control_output__ in RunEvent.)
        let controlEvent: ControlEvent;
        if (isControlEventValue(value)) {
          controlEvent = value;
        } else if (isObjectValue(value)) {
          // Raw property dict — wrap as RunEvent
          const raw = value as Record<string, unknown>;
          // Support nested {properties: {...}} shape from LLM output
          const properties =
            "properties" in raw && isObjectValue(raw.properties)
              ? raw.properties
              : raw;
          controlEvent = { event_type: "run", properties };
        } else {
          continue; // skip non-object values
        }

        const ctrlEdgeId =
          edge.id ??
          syntheticEdgeId(
            edge.source,
            edge.sourceHandle,
            edge.target,
            edge.targetHandle
          );
        await targetInbox.put("__control__", controlEvent, {
          source_edge_id: ctrlEdgeId
        });
        continue;
      }

      // Drop signal: send `lineage_done` to the downstream inbox instead of
      // delivering a value. §5. The actor sets `lineageDoneSlots` when a
      // stream node calls `outputs.drop()`.
      if (routingHints.lineageDoneSlots?.has(edge.sourceHandle)) {
        const targetInboxDrop = this._inboxes.get(edge.target);
        if (!targetInboxDrop) continue;
        const lineage = routingHints.perSlotLineage?.[edge.sourceHandle] ?? {};
        const edgeId =
          edge.id ??
          syntheticEdgeId(
            edge.source,
            edge.sourceHandle,
            edge.target,
            edge.targetHandle
          );
        // Use the downstream input handle's static scope so the projection
        // keys match the actor's bucket key on that handle.
        const downstreamScope =
          this._correlation?.nodes
            .get(edge.target)
            ?.inputs.get(edge.targetHandle)?.scope ?? [];
        targetInboxDrop.signalLineageDone(
          edge.targetHandle,
          {
            type: "lineage_done",
            source_edge_id: edgeId,
            output: edge.sourceHandle,
            lineage
          },
          downstreamScope
        );
        continue;
      }

      const value = outputs[edge.sourceHandle];
      if (value === undefined) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.debug("_sendMessages skip edge (no matching output)", {
          sourceNodeId,
          sourceHandle: edge.sourceHandle,
          availableKeys: outputKeys
        });
        continue;
      }

      const targetInbox = this._inboxes.get(edge.target);
      if (!targetInbox) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.debug("_sendMessages skip edge (no target inbox)", {
          target: edge.target
        });
        continue;
      }

      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
      log.debug("_sendMessages delivering", {
        sourceNodeId,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle
      });
      const edgeId =
        edge.id ??
        syntheticEdgeId(
          edge.source,
          edge.sourceHandle,
          edge.target,
          edge.targetHandle
        );
      const lineage =
        routingHints.perSlotLineage?.[edge.sourceHandle] ??
        routingHints.invocationLineage;
      await targetInbox.put(edge.targetHandle, value, {
        source_edge_id: edgeId,
        correlation_lineage: lineage
      });
      this._incrementEdgeCounter(edge);
    }

    // Emit output_update for each produced output handle.
    // Skip constant and input nodes: the client already holds their value
    // as a property (or supplied it as a runtime param), so re-sending it
    // (often a large image/audio payload) is redundant.
    // Also skip handles with outgoing data edges: the value travels to its
    // consumer on the edge, and clients only display terminal (unconnected)
    // handles — Output/Preview nodes and dangling outputs. Without this,
    // every intermediate module of a streaming patch firehoses the client
    // (~50 output_updates/s per handle for realtime audio). Nodes whose
    // output_updates are part of their UI contract even when patched onward
    // (e.g. the realtime AudioOutput monitor) opt out via the
    // `always_emit_output_updates` descriptor flag.
    const sourceNode = this._graph.findNode(sourceNodeId);
    if (
      sourceNode &&
      !sourceNode.type.startsWith("nodetool.constant.") &&
      !sourceNode.type.startsWith("nodetool.input.")
    ) {
      const alwaysEmit = Boolean(
        (sourceNode as { always_emit_output_updates?: boolean })
          .always_emit_output_updates
      );
      const declaredOutputs = sourceNode.outputs ?? {};
      for (const [handle, value] of Object.entries(outputs)) {
        if (value === undefined) continue;
        if (handle === "__control__" || handle === "__control_output__")
          continue;
        if (
          !alwaysEmit &&
          this._graph.findEdges(sourceNodeId, handle).some(isDataEdge)
        )
          continue;
        const outputName = clientFacingOutputName(sourceNode, handle);
        this._emit({
          type: "output_update",
          node_id: sourceNodeId,
          node_name: sourceNode.name ?? sourceNodeId,
          output_name: outputName,
          value,
          output_type: declaredOutputs[handle] ?? "any",
          metadata: {},
          // RFC §6: live display feed defaults to "append" (chunk-concatenate),
          // matching today's hardcoded consumer behavior. Artifacts travel on
          // generation_complete, so this is display-only.
          disposition: "append"
        });
      }
    }

    // Resolve the oldest pending sendControlEvent promise for this node.
    const pendingQueue = this._pendingControlResponses.get(sourceNodeId);
    if (pendingQueue && pendingQueue.length > 0) {
      const pending = pendingQueue.shift()!;
      if (pendingQueue.length === 0) {
        this._pendingControlResponses.delete(sourceNodeId);
      }
      pending.resolve(outputs);
    }
  }

  /**
   * A supervisor `skip`: retire one invocation's outputs without emitting.
   *
   * Plain non-emission is not enough. Siblings already buffered against the
   * skipped key would sit at a downstream join forever, and an invocation of an
   * iteration node would have opened child scopes an aggregate is waiting to
   * see closed. So both signals go out on every outgoing data edge: the
   * per-lineage `lineage_done` that unblocks joins, and a `lineage_scope_closed`
   * per child root the invocation could have minted. Design §5.2.
   */
  private _skipInvocationOutputs(
    sourceNodeId: string,
    lineage: CorrelationLineage
  ): void {
    const nodeAnalysis = this._correlation?.nodes.get(sourceNodeId);
    for (const edge of this._graph.findOutgoingEdges(sourceNodeId)) {
      if (isControlEdge(edge)) continue;
      const targetInbox = this._inboxes.get(edge.target);
      if (!targetInbox) continue;
      const edgeId =
        edge.id ??
        syntheticEdgeId(
          edge.source,
          edge.sourceHandle,
          edge.target,
          edge.targetHandle
        );

      for (const root of nodeAnalysis?.outputs.get(edge.sourceHandle)
        ?.possibleChildRoots ?? []) {
        targetInbox.signalLineageScopeClosed(
          edge.targetHandle,
          {
            type: "lineage_scope_closed",
            source_edge_id: edgeId,
            output: edge.sourceHandle,
            parent_lineage: lineage,
            closed_root: root
          },
          // The parent scope of a minted child root is the invocation scope
          // the source node fired at — the scope this lineage projects onto.
          nodeAnalysis?.invocationScope ?? []
        );
      }

      targetInbox.signalLineageDone(
        edge.targetHandle,
        {
          type: "lineage_done",
          source_edge_id: edgeId,
          output: edge.sourceHandle,
          lineage
        },
        this._correlation?.nodes.get(edge.target)?.inputs.get(edge.targetHandle)
          ?.scope ?? []
      );
    }
  }

  /**
   * Mark the source of one data edge done on its target inbox at most once.
   * `markSourceDone` decrements an upstream counter, so calling it twice for
   * the same edge would over-decrement and could prematurely close a handle
   * that still has other open upstreams. Both early per-slot EOS
   * (`_signalSlotEos`) and the final `_sendEOS` route through this guard.
   * Returns true if the mark was applied (first time), false if skipped.
   */
  private _markEdgeSourceDoneOnce(edge: Edge): boolean {
    const edgeId =
      edge.id ??
      syntheticEdgeId(
        edge.source,
        edge.sourceHandle,
        edge.target,
        edge.targetHandle
      );
    if (this._eosSentEdges.has(edgeId)) return false;
    this._eosSentEdges.add(edgeId);
    const targetInbox = this._inboxes.get(edge.target);
    if (targetInbox) {
      targetInbox.markSourceDone(edge.targetHandle);
    }
    return true;
  }

  /**
   * Signal early end-of-stream for a single output slot of a node, in
   * response to `outputs.complete(slot)`. Marks every outgoing edge of
   * `(nodeId, slot)` done on its target inbox immediately, rather than
   * waiting for the actor to finish. Idempotent with `_sendEOS` via the
   * `_eosSentEdges` guard so a handle's upstream count is never
   * double-decremented.
   */
  private _signalSlotEos(nodeId: string, slot: string): void {
    for (const edge of this._graph.findEdges(nodeId, slot)) {
      if (isControlEdge(edge)) continue;
      this._markEdgeSourceDoneOnce(edge);
    }
  }

  /**
   * Signal EOS on all outgoing edges of a completed node.
   * For control edges: close the __control__ handle of the target.
   * For data edges: close the named target handle.
   */
  private async _sendEOS(nodeId: string): Promise<void> {
    const outgoing = this._graph.findOutgoingEdges(nodeId);
    // _initializeInboxes counts one __control__ upstream per unique
    // controller, so decrement once per target — not once per control edge.
    // Parallel control edges to the same target would otherwise drive the
    // count to zero while other controllers are still running.
    const controlTargetsDone = new Set<string>();
    for (const edge of outgoing) {
      if (isControlEdge(edge)) {
        // Always mark __control__ source done when the controller finishes,
        // matching Python parity (_mark_downstream_eos). This unblocks
        // controlled nodes waiting on iterInput("__control__") regardless
        // of whether events were routed through the edge or via the manual
        // sendControlEvent() / dispatchControlEvent() APIs.
        if (controlTargetsDone.has(edge.target)) continue;
        controlTargetsDone.add(edge.target);
        const targetInbox = this._inboxes.get(edge.target);
        if (targetInbox) {
          targetInbox.markSourceDone("__control__");
        }
        continue;
      }
      // Mark the source done at most once per edge — early per-slot EOS
      // (`outputs.complete`) may already have marked it. The rest of the
      // EOS work (lineage_scope_closed, edge_update) is unconditional.
      this._markEdgeSourceDoneOnce(edge);
      const targetInbox = this._inboxes.get(edge.target);
      const edgeId =
        edge.id ??
        syntheticEdgeId(
          edge.source,
          edge.sourceHandle,
          edge.target,
          edge.targetHandle
        );

      // §6 — at source EOS, synthesize `lineage_scope_closed` for every
      // possible child root the edge could have produced. Downstream
      // aggregators rely on receiving a close even when zero child tokens
      // were minted.
      if (this._correlation && targetInbox) {
        const nodeAnalysis = this._correlation.nodes.get(nodeId);
        const outputAnalysis = nodeAnalysis?.outputs.get(edge.sourceHandle);
        if (outputAnalysis) {
          for (const root of outputAnalysis.possibleChildRoots) {
            targetInbox.signalLineageScopeClosed(
              edge.targetHandle,
              {
                type: "lineage_scope_closed",
                source_edge_id: edgeId,
                output: edge.sourceHandle,
                parent_lineage: {},
                closed_root: root
              },
              []
            );
          }
        }
      }

      // This terminal update carries the exact final counter, so clear any
      // dirty mark: otherwise _flushEdgeCounters at run end would re-emit
      // status "active" after "completed" for an edge whose counter advanced
      // within the throttle window just before its source finished. §1.
      this._edgeCounterDirty.delete(edgeId);
      this._emit({
        type: "edge_update",
        job_id: this._effectiveJobId,
        edge_id: edgeId,
        status: "completed",
        counter: this._edgeCounters.get(edgeId) ?? null
      });
    }
  }

  /**
   * Route __control_output__ from controller nodes to all controlled
   * nodes via control edges. Wraps raw property dicts in a RunEvent.
   * (Python parity: send_messages special handling of __control_output__.)
   */
  private async _routeControlOutput(
    sourceNodeId: string,
    controlOutput: unknown
  ): Promise<void> {
    if (!isObjectValue(controlOutput)) return;

    const controlEdges = this._graph
      .findOutgoingEdges(sourceNodeId)
      .filter(isControlEdge);
    if (controlEdges.length === 0) return;

    let properties = controlOutput as Record<string, unknown>;

    // Extract properties if nested inside a metadata wrapper
    if (
      "properties" in properties &&
      isObjectValue(properties.properties) &&
      !Array.isArray(properties.properties)
    ) {
      properties = properties.properties as Record<string, unknown>;
    }

    const event: ControlEvent = { event_type: "run", properties };

    for (const edge of controlEdges) {
      const targetInbox = this._inboxes.get(edge.target);
      if (!targetInbox) continue;
      const ctrlEdgeId =
        edge.id ??
        syntheticEdgeId(
          edge.source,
          edge.sourceHandle,
          edge.target,
          edge.targetHandle
        );
      await targetInbox.put("__control__", event, {
        source_edge_id: ctrlEdgeId
      });
    }
  }

  // -----------------------------------------------------------------------
  // Control event dispatch
  // -----------------------------------------------------------------------

  /**
   * Broadcast a control event to all controlled nodes.
   */
  async dispatchControlEvent(event: ControlEvent): Promise<void> {
    for (const node of this._graph.getControlledNodes()) {
      const inbox = this._inboxes.get(node.id);
      if (inbox) {
        await inbox.put("__control__", event);
      }
    }
  }

  /**
   * Send a control event to a specific target node.
   */
  async dispatchControlEventToTarget(
    event: ControlEvent,
    targetNodeId: string
  ): Promise<void> {
    const inbox = this._inboxes.get(targetNodeId);
    if (inbox) {
      await inbox.put("__control__", event);
    }
  }

  /**
   * Send a run control event to a specific node and await its output.
   * Returns a promise that resolves with the node's output from the next
   * output_update message emitted for that node.
   */
  async sendControlEvent(
    targetNodeId: string,
    properties: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const inbox = this._inboxes.get(targetNodeId);
    if (!inbox) {
      throw new Error(`Target node not found or no inbox: ${targetNodeId}`);
    }

    // The target's actor has already finished — nothing will ever read its
    // inbox again, so a registered response would hang forever. Reject now.
    if (this._completedNodes.has(targetNodeId)) {
      throw new Error(
        `Target node already completed and cannot handle control events: ${targetNodeId}`
      );
    }

    const entry: {
      resolve: (outputs: Record<string, unknown>) => void;
      reject: (err: Error) => void;
    } = { resolve: () => {}, reject: () => {} };
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
      let queue = this._pendingControlResponses.get(targetNodeId);
      if (!queue) {
        queue = [];
        this._pendingControlResponses.set(targetNodeId, queue);
      }
      queue.push(entry);
    });

    const event: ControlEvent = {
      event_type: "run",
      properties
    };
    await inbox.put("__control__", event);

    // The target's actor can finish between the check above and this point —
    // its completion handler drains `_pendingControlResponses` before this
    // waiter joined the queue, so nothing would ever settle it. Re-check after
    // registering and reject rather than hang.
    if (this._completedNodes.has(targetNodeId)) {
      const queue = this._pendingControlResponses.get(targetNodeId);
      const index = queue?.indexOf(entry) ?? -1;
      if (queue && index >= 0) {
        queue.splice(index, 1);
        if (queue.length === 0) {
          this._pendingControlResponses.delete(targetNodeId);
        }
        entry.reject(
          new Error(
            `Target node already completed and cannot handle control events: ${targetNodeId}`
          )
        );
      }
    }

    return promise;
  }

  // -----------------------------------------------------------------------
  // Edge counters
  // -----------------------------------------------------------------------

  private _incrementEdgeCounter(edge: Edge): void {
    const id =
      edge.id ??
      syntheticEdgeId(
        edge.source,
        edge.sourceHandle,
        edge.target,
        edge.targetHandle
      );
    const counter = (this._edgeCounters.get(id) ?? 0) + 1;
    this._edgeCounters.set(id, counter);

    // Per-message edge_updates only drive UI affordances: the flow animation
    // needs the first message, and the "N streamed" badge doesn't need more
    // than a few updates per second. Realtime audio streams cross edges at
    // chunk rate (~50/s per edge), which would otherwise flood the transport.
    // Emit the first update immediately, throttle the rest, and flush exact
    // final counters in _flushEdgeCounters() at run end.
    const now = Date.now();
    const last = this._edgeCounterLastEmitMs.get(id);
    if (last !== undefined && now - last < EDGE_UPDATE_MIN_INTERVAL_MS) {
      this._edgeCounterDirty.add(id);
      return;
    }
    this._edgeCounterLastEmitMs.set(id, now);
    this._edgeCounterDirty.delete(id);
    this._emit({
      type: "edge_update",
      job_id: this._effectiveJobId,
      edge_id: id,
      status: "active",
      counter
    });
  }

  /**
   * Emit the final counter for every edge whose count advanced past its last
   * throttled edge_update, so the badge ends on the exact total. Called from
   * _drainActiveEdges (which runs on completion, cancellation and error).
   */
  private _flushEdgeCounters(): void {
    for (const id of this._edgeCounterDirty) {
      this._emit({
        type: "edge_update",
        job_id: this._effectiveJobId,
        edge_id: id,
        status: "active",
        counter: this._edgeCounters.get(id) ?? null
      });
    }
    this._edgeCounterDirty.clear();
  }

  // -----------------------------------------------------------------------
  // Drain active edges (Python parity: drain_active_edges)
  // -----------------------------------------------------------------------

  /**
   * Post a "drained" EdgeUpdate for any edge whose target handle still has
   * buffered items or open upstream sources. Called during post-completion
   * cleanup to ensure front-end consumers stop listening to streams and
   * clear any spinners.
   *
   * Returns the ids of edges found in that leftover state — §6's "zero
   * pending work" is violated whenever this is non-empty after a normal
   * (non-error) completion. The caller decides what strict mode does with
   * that list; this method's own emit-and-continue behavior never changes,
   * since it also runs on the error/cancellation cleanup path where a
   * partial graph is expected to have open edges.
   */
  private _drainActiveEdges(): string[] {
    const leftoverEdgeIds: string[] = [];
    if (!this._graph || this._graph.edges.length === 0) return leftoverEdgeIds;
    // Settle the throttled counters first; a "drained" update below may then
    // override the status for still-open edges.
    this._flushEdgeCounters();
    for (const edge of this._graph.edges) {
      try {
        const inbox = this._inboxes.get(edge.target);
        if (!inbox) continue;
        const edgeId =
          edge.id ??
          syntheticEdgeId(
            edge.source,
            edge.sourceHandle,
            edge.target,
            edge.targetHandle
          );
        if (
          inbox.hasBuffered(edge.targetHandle) ||
          inbox.isOpen(edge.targetHandle)
        ) {
          leftoverEdgeIds.push(edgeId);
          this._emit({
            type: "edge_update",
            job_id: this._effectiveJobId,
            edge_id: edgeId,
            status: "drained",
            counter: this._edgeCounters.get(edgeId) ?? null
          });
        }
      } catch {
        // Best effort — ignore errors during draining
      }
    }
    return leftoverEdgeIds;
  }

  /**
   * Strict-mode gate for `_drainActiveEdges`'s findings (§12). Split out from
   * its one call site (the success path in `_runImpl`, right after
   * `_processGraph`) so it is unit-testable without a full graph run: in
   * practice any leftover edge state this reports was already caught by the
   * node-level `_checkPendingInboxWork` gate inside `_processGraph` (an
   * inbox's `hasPendingWork()` covers every handle, edge-targeted ones
   * included) and would have thrown before this method is ever reached —
   * this gate exists for the state `_checkPendingInboxWork` cannot see (e.g.
   * a driver that calls `_drainActiveEdges` directly after bypassing
   * `_processGraph`) and as a second line of defense should that ordering
   * ever change.
   *
   * A cancelled or suspended run, or one with node errors, legitimately
   * leaves edges mid-flight — that is what the drain reports to the
   * frontend in every mode. Only a run that is otherwise clean but still has
   * leftover edge state is a §6 violation ("zero pending work" after a
   * normal completion).
   */
  private _enforceCleanEdgeDrain(leftoverEdgeIds: string[]): void {
    if (
      !this._options.strict ||
      leftoverEdgeIds.length === 0 ||
      this._cancelled ||
      this._suspend ||
      this._nodeErrors.size > 0
    ) {
      return;
    }
    throw new Error(
      `Strict mode: edge(s) still had buffered/open state after a clean ` +
        `run completion: ${leftoverEdgeIds.join(", ")}`
    );
  }

  // -----------------------------------------------------------------------
  // Pending work detection
  // -----------------------------------------------------------------------

  private _checkPendingInboxWork(): string[] {
    const pending: string[] = [];
    for (const [nodeId, inbox] of this._inboxes) {
      if (inbox.hasPendingWork()) pending.push(nodeId);
    }
    return pending;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private _isOutputNode(node: NodeDescriptor): boolean {
    // An output node has no outgoing data edges
    const outgoing = this._graph.findOutgoingEdges(node.id).filter(isDataEdge);
    return outgoing.length === 0;
  }

  /**
   * External input nodes are placeholders that receive runtime params/streamed values.
   * They should not execute as normal source actors.
   */
  private _isExternalInputNode(node: NodeDescriptor): boolean {
    return (
      node.type.startsWith("nodetool.input.") || node.type === "test.Input"
    );
  }

  private _getExternalInputName(node: NodeDescriptor): string {
    const properties = isObjectValue(node.properties) ? node.properties : {};
    const propertyName = isString(properties.name)
      ? properties.name.trim()
      : "";
    if (propertyName) {
      return propertyName;
    }
    return node.name ?? node.id;
  }

  /**
   * Key a terminal node's outputs are collected under.
   *
   * DSL-authored graphs carry the public name in the Output node's `name`
   * *property* (`output({ name: "hook", value })`) — the descriptor's
   * top-level `name` is absent, and the auto-generated node id (`output`,
   * `output_2`, …) is all that would remain. Promote the property for
   * output-typed nodes so a run's outputs are keyed by the name the author
   * asked for. Mirrors `_getExternalInputName` on the input side and the
   * websocket runner's `require_terminal_result` rewrite; gating on
   * `nodetool.output.` keeps other terminal sinks keyed by id.
   */
  private _outputCollectionKey(node: NodeDescriptor): string {
    if (isString(node.name) && node.name.trim()) return node.name;
    if (node.type.startsWith("nodetool.output.")) {
      const properties = isObjectValue(node.properties) ? node.properties : {};
      const propertyName = isString(properties.name)
        ? properties.name.trim()
        : "";
      if (propertyName) return propertyName;
    }
    return node.id;
  }

  private _emit(msg: ProcessingMessage): void {
    // Retain for RunResult.messages — except the realtime-audio firehose: a
    // live synth patch emits ~50 audio-chunk output_updates per node per
    // second, each holding a sample buffer, so retaining them grows the heap
    // without bound (~25MB/min for a small patch) and the mounting GC
    // pressure progressively degrades whichever thread runs the kernel.
    // Streaming delivery (executionContext.emit) is unaffected. A generous
    // cap backstops other unbounded streams.
    if (!isAudioChunkOutputUpdate(msg)) {
      if (this._messages.length >= MAX_RETAINED_MESSAGES) {
        this._messages = this._messages.slice(
          this._messages.length - MAX_RETAINED_MESSAGES / 2
        );
      }
      this._messages.push(msg);
    }
    if (this._options.executionContext) {
      // Message delivery is observation, not execution. A transport that fails
      // mid-run (a closed WebSocket, a full queue) must not abort the workflow
      // — `_emit` is called from EOS routing and actor completion handlers,
      // where a throw would take down the run and orphan sibling actors.
      try {
        this._options.executionContext.emit(msg);
      } catch (err) {
        // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
        log.warn("Message emit failed", {
          jobId: this.jobId,
          type: msg.type,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.debug("Message emitted", { jobId: this.jobId, type: msg.type });
  }

  private _resolveInputNodes(inputName: string): NodeDescriptor[] {
    return this._graph
      .inputNodes()
      .filter(
        (node) =>
          this._getExternalInputName(node) === inputName ||
          node.id === inputName
      );
  }

  // -----------------------------------------------------------------------
  // Control context builder (Python parity: _build_control_context)
  // -----------------------------------------------------------------------

  /**
   * Build control context for a controller node.
   * Returns null if the node has no outgoing control edges.
   *
   * The control context maps controlled node IDs to their metadata
   * (node_type, properties with current values, types, descriptions).
   * This is injected as `_control_context` input so agent nodes can
   * build ControlNodeTool instances for LLM tool-calling.
   */
  private _buildControlContext(nodeId: string): Record<string, unknown> | null {
    const outgoingControlEdges = this._graph
      .findOutgoingEdges(nodeId)
      .filter(isControlEdge);

    if (outgoingControlEdges.length === 0) return null;

    const controlledNodeIds = new Set(
      outgoingControlEdges.map((e) => e.target)
    );
    const context: Record<string, unknown> = {};

    for (const targetId of controlledNodeIds) {
      const targetNode = this._graph.findNode(targetId);
      if (!targetNode) continue;

      const properties: Record<string, unknown> = {};

      // Extract property info from the node descriptor
      if (isObjectValue(targetNode.properties)) {
        const props = targetNode.properties;
        const propTypes = targetNode.propertyTypes ?? {};

        for (const [propName, propValue] of Object.entries(props)) {
          if (propName.startsWith("_")) continue; // skip private
          const meta = targetNode.propertyMeta?.[propName] as
            | { description?: string; min?: number; max?: number }
            | undefined;
          type DescribedFields = {
            value: unknown;
            type: string;
            description?: string;
            min?: number;
            max?: number;
          };
          const described: DescribedFields = {
            value: propValue,
            type:
              (propTypes as Record<string, string>)[propName] ??
              typeof propValue
          };
          if (meta?.description) {
            described.description = meta.description;
          }
          if (meta?.min != null) {
            described.min = meta.min;
          }
          if (meta?.max != null) {
            described.max = meta.max;
          }
          properties[propName] = described;
        }
      }

      context[targetId] = {
        node_id: targetId,
        node_type: targetNode.type,
        node_title: targetNode.name ?? targetId,
        properties,
        control_actions: {
          run: {
            properties: this._buildControlActionProperties(targetNode)
          }
        }
      };
    }

    return Object.keys(context).length > 0 ? context : null;
  }

  /**
   * Build the property schema for a controlled node's "run" action.
   * Maps property names to JSON-schema-like descriptors for ControlNodeTool.
   */
  private _buildControlActionProperties(
    node: NodeDescriptor
  ) {
    const result: Record<string, Record<string, unknown>> = {};

    const props = (node.properties ?? {}) as Record<string, unknown>;
    const slotTypes = dynamicSlotPropertyTypes(node.dynamic_inputs);
    // Declared dynamic slots type their handles; the registry map wins on a
    // name collision.
    const propTypes: Record<string, string> = {
      ...slotTypes,
      ...((node.propertyTypes ?? {}) as Record<string, string>)
    };

    // Build the schema from registry-declared property types so the LLM sees
    // every argument the node accepts, even when the node has no saved values.
    // Fall back to keys present in `properties` for dynamic nodes whose
    // registry metadata doesn't enumerate every property.
    const names = new Set<string>([
      ...Object.keys(propTypes),
      ...Object.keys(props)
    ]);

    for (const name of names) {
      if (name.startsWith("_")) continue;

      const declaredType = propTypes[name];
      const value = props[name];
      let jsonType = "string";
      if (declaredType) {
        const lower = declaredType.toLowerCase();
        if (lower === "int" || lower === "integer") jsonType = "integer";
        else if (lower === "float" || lower === "number") jsonType = "number";
        else if (lower === "bool" || lower === "boolean") jsonType = "boolean";
        else if (lower.startsWith("list") || lower === "array")
          jsonType = "array";
        else if (lower.startsWith("dict") || lower === "object")
          jsonType = "object";
      } else if (isNumber(value)) {
        jsonType = Number.isInteger(value) ? "integer" : "number";
      } else if (isBoolean(value)) {
        jsonType = "boolean";
      }

      const slot = node.dynamic_inputs?.[name];
      const meta = (node.propertyMeta?.[name] ?? slot) as
        | { description?: string; min?: number; max?: number }
        | undefined;
      type SchemaFields = {
        type: string;
        description: string;
        default?: unknown;
        minimum?: number;
        maximum?: number;
      };
      const schema: SchemaFields = {
        type: jsonType,
        description:
          meta?.description ??
          `Property '${name}' (${declaredType ?? jsonType})`
      };
      if (value !== undefined) {
        schema.default = value;
      }
      if (meta?.min != null) {
        schema.minimum = meta.min;
      }
      if (meta?.max != null) {
        schema.maximum = meta.max;
      }
      result[name] = schema;
    }

    return result;
  }
}
