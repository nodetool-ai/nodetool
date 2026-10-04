import { withRegisteredRunTrace, settleRegisteredRunTrace } from "./service/run-trace-lifecycle.js";
/** Canonical lifecycle for top-level Node/server workflow runs. */
import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import { hydrateGraphNodeFlags } from "@nodetool-ai/node-sdk";
import {
  Graph,
  WorkflowRunner,
  withExplicitNodeFlags,
  MessageStream,
  type RunResult
} from "@nodetool-ai/kernel";
import {
  PERMISSION_GATE_CONTEXT_KEY,
  ProcessingContext,
  inAppRunCostAccount,
  connectPythonBridgeForGraph,
  headlessGate
} from "@nodetool-ai/runtime";
import type {
  PythonJobLifecycle,
  PythonBridgeBase
} from "@nodetool-ai/runtime";
import type {
  HydratedGraphData,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import { createExecutorResolver } from "./executor-resolver.js";
import {
  WORKFLOW_RUN_HOST,
  buildWorkspaceExecutionContext
} from "./service/workflow-workspace.js";
import { normalizeGraph } from "./normalize-graph.js";
import { assertPreflight } from "./preflight.js";
import { rewriteOutputNames } from "./output-names.js";
import { attachRunCostLedger, nodeTypeLookup } from "./cost-ledger.js";
import type { BridgeFactory, ExecutionSessionOptions } from "./types.js";

const log = createLogger("nodetool.execution.session");

export class ExecutionSession {
  readonly jobId: string;
  readonly workflowId: string | null;
  readonly graph: HydratedGraphData;

  private readonly runner: WorkflowRunner;
  /** Null unless the caller opted into `captureMessages` (see options). */
  private readonly stream: MessageStream | null;
  private readonly persistence: ExecutionSessionOptions["persistence"];
  private readonly bridge: { pendingRequestCount?: number } | null;
  private readonly resultPromise: Promise<RunResult>;
  private runTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private _cancelReason: string | null = null;

  private constructor(init: {
    jobId: string;
    workflowId: string | null;
    graph: HydratedGraphData;
    runner: WorkflowRunner;
    context: ProcessingContext;
    persistence: ExecutionSessionOptions["persistence"];
    params: Record<string, unknown>;
    triggerEvent: ExecutionSessionOptions["triggerEvent"];
    bridge: { pendingRequestCount?: number } | null;
    lifecycle: PythonJobLifecycle | null;
    userId: string;
    closeBridge: () => void;
    runTimeoutMs: number | undefined;
    captureMessages: boolean;
    messageBufferLimit: number | undefined;
    recordCosts: boolean;
    projectId: string | null | undefined;
    documentId: string | null | undefined;
  }) {
    this.jobId = init.jobId;
    this.workflowId = init.workflowId;
    this.graph = init.graph;
    this.runner = init.runner;
    this.persistence = init.persistence;
    this.bridge = init.bridge;
    this.stream = init.captureMessages
      ? new MessageStream(init.context, init.messageBufferLimit)
      : null;

    const detachLedger = init.recordCosts
      ? attachRunCostLedger(init.context, {
          userId: init.userId,
          appRunContext: init.context.appRunContext ?? undefined,
          workflowId: init.workflowId,
          projectId: init.projectId ?? null,
          documentId: init.documentId ?? null,
          nodeType: nodeTypeLookup(init.graph.nodes),
          resolveSecret: (key) => init.context.getSecret(key)
        })
      : null;

    if (init.runTimeoutMs && init.runTimeoutMs > 0) {
      this.runTimeoutHandle = setTimeout(() => {
        this.cancel("timeout");
      }, init.runTimeoutMs);
    }

    // Open the run boundary on the Python worker before the kernel starts, so
    // an execute frame can never arrive ahead of the job it belongs to. Fire
    // and forget: `jobStart` is a no-op on a pre-v4 worker and swallows its own
    // failures, and blocking the kernel on worker bookkeeping would make an
    // unreachable worker a run failure.
    const boundary = {
      jobId: init.jobId,
      workflowId: init.workflowId,
      userId: init.userId
    };
    void init.lifecycle?.jobStart(boundary);

    type RunRequestFields = {
      job_id: string;
      workflow_id: string | undefined;
      params: typeof init.params;
      trigger_event?: NonNullable<typeof init.triggerEvent>;
    };
    const runRequest: RunRequestFields = {
      job_id: init.jobId,
      workflow_id: init.workflowId ?? undefined,
      params: init.params
    };
    if (init.triggerEvent) {
      runRequest.trigger_event = init.triggerEvent;
    }

    this.resultPromise = Promise.resolve()
      .then(() => withRegisteredRunTrace(init.context, "workflow.run", () => inAppRunCostAccount(init.context.appRunCostAccount, () => init.runner.run(runRequest, init.graph))))
      .then(
        async (result) => {
          await settleRegisteredRunTrace(init.context, result.status === "cancelled" ? "cancelled" : result.status === "failed" ? "failed" : "completed", result.error);
          void init.lifecycle?.jobEnd({
            ...boundary,
            reason: this.endReason(result.status)
          });
          return result;
        },
        async (err: unknown) => {
          await settleRegisteredRunTrace(init.context, "failed", err instanceof Error ? err.message : String(err));
          // `run()` documents that it never rejects, but the boundary must
          // close even if that ever stops being true — an abandoned run is
          // exactly the leak `job.end` exists to prevent.
          void init.lifecycle?.jobEnd({ ...boundary, reason: "abandoned" });
          throw err;
        }
      )
      .finally(async () => {
        if (this.runTimeoutHandle) {
          clearTimeout(this.runTimeoutHandle);
          this.runTimeoutHandle = null;
        }
        try {
          init.closeBridge();
        } finally {
          await detachLedger?.settled();
          detachLedger?.();
          this.stream?.close();
          await cleanupWorkspace(init.context, this.jobId);
        }
      });

    this.resultPromise
      .then((result) => this.persistence?.onTerminal?.(result))
      .catch((err) => {
        log.warn("persistence.onTerminal threw", {
          jobId: this.jobId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
  }

  /** Map a kernel run status onto the `job.end` reason. */
  private endReason(
    status: RunResult["status"]
  ): "completed" | "failed" | "cancelled" {
    if (status === "failed") return "failed";
    if (status === "cancelled") return "cancelled";
    return "completed";
  }

  static async create(
    options: ExecutionSessionOptions
  ): Promise<ExecutionSession> {
    if (options.limits?.nodeTimeoutMs) {
      throw new Error(
        "ExecutionSession: nodeTimeoutMs is not yet supported — the kernel " +
          "has no per-node timeout hook (only run-level cancel()). Omit it " +
          "or use limits.runTimeoutMs."
      );
    }

    if (
      !options.registry &&
      !options.resolveExecutor &&
      !options.executorResolverFactory
    ) {
      throw new Error(
        "ExecutionSession: either registry or resolveExecutor (or executorResolverFactory) must be provided " +
          "(registry builds the default registry+bridge resolver; resolveExecutor " +
          "bypasses it for a host with its own resolution, e.g. the WS runner)."
      );
    }

    const jobId = options.jobId ?? randomUUID();
    const workflowId = options.workflowId ?? null;
    const registry = options.registry;

    // A caller that brings no context still gets one that can reach the
    // secret store. The bare `new ProcessingContext(...)` this replaced
    // resolved no secret at all, so a graph with a provider node failed on
    // credentials the install had — the same defect the service-layer run
    // path shipped with. Selected here, ahead of the bridge, because the
    // preflight below resolves credentials through it.
    const context =
      options.context ??
      buildWorkspaceExecutionContext({
        jobId,
        workflowId,
        userId: "1",
        workspace: null,
        durableFalGenerations: true
      });
    // This facade is the workflow host for every caller that builds its own
    // context (`nodetool run`, the WebSocket job runner, the app simulator):
    // a run is consent, so a context that arrived with no gate gets the
    // headless one here. A caller that already has a user to ask — a chat
    // turn's `run_node` — set its gate before handing the context in, and
    // keeps it.
    if (
      options.installHeadlessPermissionGate !== false &&
      context.get(PERMISSION_GATE_CONTEXT_KEY) === undefined
    ) {
      context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate(WORKFLOW_RUN_HOST));
    }

    // Refuse a graph this runtime cannot honour before anything is paid for:
    // ahead of the Python bridge (a worker spawn), ahead of
    // `persistence.onAccepted` (a job row), and ahead of the kernel. Without
    // this, a bad model id or a missing key failed at the node that needed it
    // — after the upstream half of the graph had already run and billed.
    // A context serving providers from its own resolver (a fake, a cassette,
    // the e2e server's scripted provider) never reaches the registry and never
    // reads a credential, so the registry's "is this key set" question does not
    // apply to it — asking anyway refuses the run for a secret it would not
    // have used. An explicit checker still wins: a host that knows its own
    // registry says so itself.
    const providerConfiguration =
      options.providerConfiguration ??
      (context.hasProviderResolver ? () => [] : undefined);

    let bridge: PythonBridgeBase | null = null;
    let bridgeClosed = false;
    const closeBridge = (): void => {
      if (bridgeClosed) return;
      bridgeClosed = true;
      bridge?.close();
    };

    try {
      const normalized = normalizeGraph(options.graph);
      if (options.preflight !== false) {
        await assertPreflight(normalized, {
          catalogs: options.catalogs,
          providerConfiguration,
          resolveSecret: (key) => context.getSecret(key)
        });
      }
      // A resolver supplied directly already owns its bridge. A factory
      // instead receives the connection owned and closed by this session.
      const bridgeFactory: BridgeFactory =
        options.bridgeFactory ??
        (options.resolveExecutor
          ? async () => null
          : (nodes, hasTsExecutor) =>
              connectPythonBridgeForGraph(
                nodes,
                hasTsExecutor,
                options.bridgeOptions
              ));
      bridge = await bridgeFactory(
        normalized.nodes,
        options.hasTsExecutor ?? ((type) => registry?.has(type) ?? false)
      );

      let hydrated: HydratedGraphData;
      if (options.resolveNodeType) {
        // Richer path: resolves `propertyTypes`/`outputs` from registry
        // metadata too (async — the resolver may lazy-load a namespace),
        // matching `websocket-client-session.ts`'s `Graph.loadFromDict`
        // hydration. Without this, multi-edge fan-in into a non-list
        // property is misclassified as list aggregation (the kernel only
        // gates on a populated `propertyTypes` map).
        const loaded = await Graph.loadFromDict(normalized, {
          resolver: options.resolveNodeType
        });
        hydrated = { nodes: [...loaded.nodes], edges: [...loaded.edges] };
      } else if (registry) {
        hydrated = hydrateGraphNodeFlags(normalized, registry);
      } else {
        // No registry and no resolveNodeType: the caller hydrates its own
        // graph before handing it to this facade (see the `registry` option
        // doc) — default absent flags to `false` rather than guessing.
        // `...node` on every field `withExplicitNodeFlags` doesn't touch
        // means an already-resolved `propertyTypes`/`outputs` passes through
        // unchanged.
        hydrated = withExplicitNodeFlags(normalized);
      }

      if (options.requireTerminalResult) {
        rewriteOutputNames(hydrated);
      }

      const resolveExecutor =
        options.resolveExecutor ??
        options.executorResolverFactory?.(bridge) ??
        (registry ? createExecutorResolver(registry, bridge) : null);
      if (!resolveExecutor) {
        throw new Error("ExecutionSession: no executor resolver available");
      }

      const runnerOptions: ConstructorParameters<typeof WorkflowRunner>[1] = {
        resolveExecutor,
        executionContext: context,
        validateNode: options.validateNode,
        bufferLimit: options.limits?.bufferLimit ?? null,
        strict: options.strict
      };
      if (options.supervisor) {
        runnerOptions.supervisor = options.supervisor;
      }
      const runner = new WorkflowRunner(jobId, runnerOptions);

      try {
        await options.persistence?.onAccepted?.(jobId);
      } catch (err) {
        log.warn("persistence.onAccepted threw", {
          jobId,
          error: err instanceof Error ? err.message : String(err)
        });
      }

      return new ExecutionSession({
        jobId,
        workflowId,
        graph: hydrated,
        runner,
        context,
        persistence: options.persistence ?? null,
        params: options.params ?? {},
        triggerEvent: options.triggerEvent ?? null,
        bridge,
        lifecycle: options.jobLifecycleBridge ?? bridge,
        userId: context.userId,
        closeBridge,
        runTimeoutMs: options.limits?.runTimeoutMs,
        captureMessages: options.captureMessages === true,
        messageBufferLimit: options.limits?.messageBufferLimit,
        recordCosts: options.recordCosts !== false,
        projectId: options.projectId,
        documentId: options.documentId
      });
    } catch (err) {
      try {
        closeBridge();
      } finally {
        await cleanupWorkspace(context, jobId);
      }
      throw err;
    }
  }

  /**
   * Live message stream — closes once the run reaches a terminal state.
   * Requires `captureMessages: true` at `create()`; without it nothing is
   * queued (see that option) and reading this throws rather than handing back
   * a stream that would silently yield nothing.
   */
  get messages(): AsyncIterable<ProcessingMessage> {
    if (!this.stream) {
      throw new Error(
        "ExecutionSession: `messages` requires `captureMessages: true` at " +
          "create() — message capture is opt-in so a host that only awaits " +
          "`result` never queues a run's messages unread."
      );
    }
    return this.stream;
  }

  /** Terminal result. Kernel failures resolve as failed, unexpected lifecycle errors reject. */
  get result(): Promise<RunResult> {
    return this.resultPromise;
  }

  /**
   * Live resource counts, for leak accounting: after a terminal result every
   * one of these must be back to zero. Measured, not inferred — the
   * reliability harness's `cleanup-leaks` invariant asserts against these
   * numbers and reports a violation when a driver can't produce them.
   */
  resourceCounters() {
    return {
      liveActors: this.runner.liveActorCount,
      pendingControlResponses: this.runner.pendingControlResponseCount,
      // The session's own run-timeout timer is the only timer it owns; it is
      // cleared when the run settles.
      pendingTimers: this.runTimeoutHandle === null ? 0 : 1,
      pythonBridgePendingRequests: this.bridge?.pendingRequestCount ?? 0
    };
  }

  /** The reason passed to the most recent `cancel()` call, if any. */
  get cancelReason(): string | null {
    return this._cancelReason;
  }

  /** Stream one more value into a live input node (mirrors the WS `stream_input` command). */
  pushInput(
    inputName: string,
    value: unknown,
    sourceHandle?: string
  ): Promise<void> {
    return this.runner.pushInputValue(inputName, value, sourceHandle);
  }

  /** Signal end-of-stream for a live input node (mirrors `end_input_stream`). */
  finishInputStream(inputName: string, sourceHandle?: string): void {
    this.runner.finishInputStream(inputName, sourceHandle);
  }

  /**
   * Push property updates into a running node's executor instance (live
   * parameter changes, e.g. a synth knob while a patch plays — mirrors the
   * WS runner's `update_node_properties` command). Returns `true` when the
   * node's executor exists and supports live updates; `false` is not an
   * error — the caller's own state already holds the new value for the next
   * run.
   */
  updateNodeProperties(
    nodeId: string,
    properties: Record<string, unknown>
  ): boolean {
    return this.runner.updateNodeProperties(nodeId, properties);
  }

  /**
   * The only cancel path. `runTimeoutMs` is implemented as
   * `cancel("timeout")` — there is no separate timeout code path.
   */
  cancel(reason?: string): void {
    this._cancelReason = reason ?? this._cancelReason ?? "cancelled";
    this.runner.cancel();
  }
}

async function cleanupWorkspace(
  context: ProcessingContext,
  jobId: string
): Promise<void> {
  try {
    await context.workspace?.cleanupScratch?.();
  } catch (err) {
    log.warn("Workspace scratch cleanup failed", {
      jobId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
